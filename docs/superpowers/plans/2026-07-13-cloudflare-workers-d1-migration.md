# Cloudflare Workers + D1 迁移 Implementation Plan

> **实施结果说明（2026-07-13）：** 本文保留迁移前的原始设计与门禁，实际切换结果以 [`docs/cloudflare/cutover-record.md`](../../cloudflare/cutover-record.md) 和 [`docs/cloudflare/operations-runbook.md`](../../cloudflare/operations-runbook.md) 为准。实施中基于 Cloudflare Python Workers 兼容性验证改用 JavaScript Worker；用户明确接受风险并要求正式地址无需登录，因此 production 为公开访问，preview 仍受 Access 保护。原计划中关于 Python Worker、production Access 和 GitHub 自动构建的条目不再代表当前状态。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把智能排班系统从 Render + PostgreSQL 安全迁移到一个受 Cloudflare Access 保护的 Cloudflare Python Worker，静态前端和 `/api/*` 同源发布，数据进入独立 preview/production D1，并具备校验、回滚和 GitHub 自动部署能力。

**Architecture:** `static/` 由 Workers Static Assets 托管，`/api/*` 进入 FastAPI Python Worker；业务规则放在纯 Python domain/service 层，异步 repository 访问关系化 D1。正式、预览、本地环境完全隔离。生产迁移采用旧系统短暂停写、最终快照、单向导入和验收后开放，不做长期双写。

**Tech Stack:** Python 3.13, Cloudflare Python Workers (Beta), FastAPI, D1/SQLite, Workers Static Assets, pywrangler/Wrangler, uv 0.11.28, pytest, Playwright, Cloudflare Access, GitHub + Workers Builds.

## Global Constraints

- 所有实现只在 `C:\Codex\智能排班系统\.worktrees\dev` 开始；不得覆盖或重置正式工作区 `C:\Codex\智能排班系统` 的未提交改动。
- `main` 只用于通过验收后的生产发布；功能分支和 `dev` 只能发布到 preview 环境。
- preview、production 和本地 D1 必须分离；任何预览构建不得绑定 production D1。
- 保持现有前端已消费 API 的 URL、HTTP 方法、成功 JSON 和错误状态兼容，除非任务明确记录迁移。
- `schedule_core.py` 的现有算法结果是迁移基线；平台迁移不得顺手改变排班规则。
- Worker 不得把 D1 故障降级为文件写入，不得在导入或请求冷启动时建表、播种或修改生产数据。
- 同源部署后不配置任意来源 CORS；认证由 Cloudflare Access 提供，Worker 必须验证 Access JWT。
- 生产数据、数据库 URL、Access JWT、API Token 和导出文件不得进入 Git；统一放入已忽略的 `.migration/`。
- 所有日期业务按 `Asia/Shanghai` 解释，数据库时间存 UTC ISO-8601。
- Python Workers Beta 兼容性、10ms CPU、100,000 动态请求/日是强制上线门禁，不满足就停止切换。
- 每个任务必须先写失败测试，再实现，再运行相关测试和完整测试；未通过不得提交。

---

### Task 0: 固定安全基线并确认迁移事实来源

**Files:**
- Modify: `.gitignore`
- Create: `docs/cloudflare/baseline-audit.md`
- Create: `docs/cloudflare/source-of-truth-checklist.md`

- [ ] **Step 1: 证明两个工作区状态并保存输出**

在正式工作区运行：

```powershell
git -C 'C:\Codex\智能排班系统' status --short --branch
git -C 'C:\Codex\智能排班系统' diff --check
```

预期：正式 `main` 显示已有用户改动；只记录，不暂存、不清理、不切分支。

在开发 worktree 运行：

```powershell
git status --short --branch
python -m unittest discover -s tests -v
```

预期：开始实施前 `dev` 除本计划文档外无意外改动；基线 44 个测试通过。若已把正式工作区的新测试安全迁入 `dev`，则测试数应为 47 且全部通过。

- [ ] **Step 2: 记录正式工作区未提交文件的处置**

在 `docs/cloudflare/baseline-audit.md` 为下列文件逐项记录 `纳入迁移 / 保留在旧部署 / 文档用途` 和理由：

```text
agent.md
db_json_store.py
render.yaml
server_runtime.py
tests/test_db_json_store.py
tests/test_render_config.py
HANDOFF.md
MEMORY.md
```

不得用复制整个文件的方式覆盖 `dev`。对需要纳入的代码，以最小补丁和对应测试重新实现。

- [ ] **Step 3: 建立秘密和导出文件隔离**

先写失败测试 `tests/test_migration_hygiene.py`，断言 `.gitignore` 包含：

```text
.migration/
.dev.vars
.wrangler/
```

运行：

```powershell
python -m unittest tests.test_migration_hygiene -v
```

预期：修改 `.gitignore` 前失败；添加规则后通过。

- [ ] **Step 4: 确认唯一权威生产数据源**

只读检查线上：

```powershell
$base = 'https://smart-scheduling-system-ty94.onrender.com'
Invoke-RestMethod "$base/api/storage-info" | ConvertTo-Json -Depth 10
```

然后分别导出 Supabase `app_json_documents`、Render PostgreSQL（如存在）和可取得的 Render 文件数据清单，只写入 `.migration/source-audit/`。对每个来源生成：

```text
source
key
updated_at
byte_length
sha256
```

在 `source-of-truth-checklist.md` 明确写出唯一权威源。若来源冲突，停止后续任务，提交审计文档并请求业务负责人选择；不得自动用“最新时间”覆盖。

- [ ] **Step 5: 提交基线文档**

```powershell
git add .gitignore docs/cloudflare tests/test_migration_hygiene.py
git commit -m "docs: record Cloudflare migration baseline"
```

---

### Task 1: 冻结现有 API 契约和黄金业务数据

**Files:**
- Create: `docs/cloudflare/api-contract.md`
- Create: `tests/contract/test_flask_api_contract.py`
- Create: `tests/fixtures/cloudflare/golden_input.json`
- Create: `tests/fixtures/cloudflare/golden_responses.json`
- Modify: `tests/test_schedule_core.py`

- [ ] **Step 1: 为全部前端已消费路由写 HTTP 契约测试**

使用 Flask `test_client()` 而不是直接调用 route 函数，至少冻结：

```text
GET/POST/PUT/DELETE groups
GET/POST/PUT/DELETE staff
GET/POST/PUT/DELETE positions
POST positions/reorder
GET schedule/<year>/<month>
POST schedule/<year>/<month>/day
POST schedule/<year>/<month>/plan-day
POST reset/backup/restore
POST auto-substitute
POST cascade-off
GET/POST hidden-days
GET/POST memo
```

每个测试同时断言状态码、`Content-Type`、成功字段、错误字段和空数据形状。

- [ ] **Step 2: 增加迁移敏感规则测试**

在 `tests/test_schedule_core.py` 增加固定 fixture，覆盖：

- 人员和小组重名时明确报错；
- split slot 的 workload 保持；
- 月末、闰年和周六规则；
- 同一输入连续运行得到完全相同结果；
- `Asia/Shanghai` 日期边界不因 UTC 日切换改变业务日。

- [ ] **Step 3: 生成黄金响应并防止人工漂移**

只使用仓库测试数据生成 `golden_responses.json`。测试中规范化动态字段，只允许忽略 `updated_at`、请求 ID 和主机 URL；不得忽略排班内容、状态码或 ID。

运行：

```powershell
python -m unittest discover -s tests -v
```

预期：全部通过。

- [ ] **Step 4: 写 API 契约文档并提交**

```powershell
git add docs/cloudflare/api-contract.md tests/contract tests/fixtures tests/test_schedule_core.py
git commit -m "test: freeze scheduling API contract"
```

---

### Task 2: 建立 Python Worker、Static Assets 和隔离环境骨架

**Files:**
- Create: `pyproject.toml`
- Create: `uv.lock`
- Create: `wrangler.jsonc`
- Create: `src/__init__.py`
- Create: `src/entry.py`
- Create: `src/api.py`
- Create: `src/config.py`
- Create: `tests/worker/test_worker_skeleton.py`
- Create: `static/_headers`

- [ ] **Step 1: 建立锁定依赖**

```powershell
uv init --bare
uv add fastapi
uv add --dev workers-py workers-runtime-sdk pytest pytest-asyncio httpx flask
uv lock
```

提交 `uv.lock`。Worker 生产依赖不得包含 Flask、Gunicorn、psycopg 或 sqlite 驱动；它们只属于旧部署或开发测试组。

- [ ] **Step 2: 先写骨架失败测试**

`tests/worker/test_worker_skeleton.py` 断言：

- `GET /api/live` 返回 200 和 `{"ok": true}`；
- 未知 `/api/*` 返回 JSON 404，不返回 `index.html`；
- FastAPI 校验异常被转换为 `{success:false,msg,details?}`；
- HTML 请求不经过 API router。

运行：

```powershell
uv run pytest tests/worker/test_worker_skeleton.py -q
```

预期：入口不存在而失败。

- [ ] **Step 3: 实现官方 ASGI 入口**

`src/entry.py` 使用官方形状：

```python
import asgi
from workers import WorkerEntrypoint
from src.api import app


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        return await asgi.fetch(app, request, self.env)
```

在 `src/api.py` 实现 `/api/live`、统一 JSON 错误处理和请求 ID 中间件。

- [ ] **Step 4: 配置 Wrangler**

`wrangler.jsonc` 必须包含：

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "smart-scheduling-system",
  "main": "src/entry.py",
  "compatibility_date": "2026-07-13",
  "compatibility_flags": ["python_workers"],
  "workers_dev": true,
  "preview_urls": true,
  "assets": {
    "directory": "./static",
    "binding": "ASSETS",
    "run_worker_first": ["/api/*"]
  }
}
```

若当前 pywrangler 生成的 schema 字段不同，以 `uv run pywrangler types` 和官方配置校验结果为准；不得删除 `python_workers`、环境隔离或 `/api/*` worker-first。

- [ ] **Step 5: 创建两个远程 D1 并写入环境绑定**

```powershell
uv run pywrangler login
uv run pywrangler d1 create smart-scheduling-preview
uv run pywrangler d1 create smart-scheduling-production
uv run pywrangler d1 info smart-scheduling-preview
uv run pywrangler d1 info smart-scheduling-production
```

把两个命令返回的真实 `database_id` 分别写入 `env.preview` 和 `env.production` 的 `DB` binding；production Worker 名固定为 `smart-scheduling-system`，preview 名固定为 `smart-scheduling-system-preview`。不得让两套环境引用同一 ID。

- [ ] **Step 6: 本地启动和静态资源验收**

```powershell
uv run pywrangler dev --env preview
```

另一个终端运行：

```powershell
Invoke-WebRequest 'http://127.0.0.1:8787/' -UseBasicParsing
Invoke-RestMethod 'http://127.0.0.1:8787/api/live'
try {
    Invoke-WebRequest 'http://127.0.0.1:8787/api/not-found' -UseBasicParsing
    throw '未知 API 不应返回 2xx'
} catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw }
}
```

预期：首页 200 且为 HTML；live 200 JSON；未知 API 为 JSON 404。

- [ ] **Step 7: 测试并提交**

```powershell
uv run pytest -q
git add pyproject.toml uv.lock wrangler.jsonc src static/_headers tests/worker
git commit -m "feat: add Cloudflare Python Worker skeleton"
```

---

### Task 3: 建立关系化 D1 schema 和 migration 门禁

**Files:**
- Create: `migrations/0001_initial.sql`
- Create: `migrations/0002_indexes.sql`
- Create: `tests/integration/test_d1_migrations.py`
- Create: `scripts/check_d1_schema.py`

- [ ] **Step 1: 写 migration 失败测试**

测试应先验证目标表不存在，然后应用 migration 并断言：

- 本设计列出的 11 张表存在；
- `PRAGMA foreign_keys` 开启；
- 删除 group 自动把 `staff.group_id` 置空；
- 重复 group name、非法 slot、同一日期重复岗位 cell 被约束拒绝；
- 常用查询存在索引；
- migration 重复执行由 Wrangler migration journal 安全处理。

- [ ] **Step 2: 编写 `0001_initial.sql`**

实现设计文档中的 `groups`、`staff`、`positions`、`schedule_days`、`schedule_day_off_staff`、`schedule_cells`、`schedule_slots`、`hidden_days`、`memos`、`schedule_backups`、`app_revision` 和 `mutation_audit`。

要求：

- ID 沿用旧系统字符串 ID，新增 ID 使用不可碰撞的 UUID/ULID，不再使用 `len(list)+1`；
- 所有外键显式写出 `ON DELETE` 策略；
- `positions` 的默认人员和默认小组最多只能有一个；
- `schedule_cells` 和 `schedule_slots` 不能同时表达同一岗位的互斥状态；
- `app_revision` 初始插入 `(1, 0, CURRENT_TIMESTAMP)`；
- migration 不包含生产数据。

- [ ] **Step 3: 本地应用并校验**

```powershell
uv run pywrangler d1 migrations apply DB --local --env preview
uv run python scripts/check_d1_schema.py --local --env preview
uv run pytest tests/integration/test_d1_migrations.py -q
```

预期：schema、约束、外键和索引测试全部通过。

- [ ] **Step 4: 提交**

```powershell
git add migrations scripts/check_d1_schema.py tests/integration/test_d1_migrations.py
git commit -m "feat: add normalized D1 schema"
```

---

### Task 4: 抽离可复用领域逻辑并建立 D1 repository

**Files:**
- Create: `src/domain/schedule/core.py`
- Create: `src/domain/schedule/models.py`
- Create: `src/domain/errors.py`
- Modify: `schedule_core.py`
- Create: `src/repositories/base.py`
- Create: `src/repositories/groups.py`
- Create: `src/repositories/staff.py`
- Create: `src/repositories/positions.py`
- Create: `src/repositories/schedules.py`
- Create: `src/repositories/settings.py`
- Create: `src/repositories/backups.py`
- Create: `tests/unit/test_domain_compatibility.py`
- Create: `tests/integration/test_d1_repositories.py`

- [ ] **Step 1: 写领域等价失败测试**

对 `tests/fixtures/cloudflare/golden_input.json` 的每个场景，同时调用旧 `schedule_core` 和新 `src.domain.schedule.core`，断言结果深度相等。

- [ ] **Step 2: 移动而不改写算法**

把纯算法移到 `src/domain/schedule/core.py`；根目录 `schedule_core.py` 只保留兼容 re-export，使旧 Flask 测试继续通过。此提交不得改动算法分支、排序或中文业务含义。

- [ ] **Step 3: 写 repository 失败测试**

覆盖：

- groups/staff/positions CRUD 和外键；
- 一天普通 cell 与 split slots 的往返；
- 同一天不同岗位并发写不互相覆盖；
- 相同岗位 revision 冲突返回领域 `ConflictError`；
- D1 失败向上传播，不生成文件、不返回假成功；
- `batch()` 任一 SQL 失败时整批回滚；
- 每次成功写只增加一次 `app_revision`；
- read replica 未启用，读写都走同一 D1 binding。

- [ ] **Step 4: 实现 async repositories**

只通过 FastAPI request scope 中的 `env.DB` 获取 binding。SQL 全部使用 prepared statements；禁止字符串拼接用户输入。多表写使用 D1 `batch()`，写后检查每条语句的 `success/rows_written`，对 revision 冲突返回 409 所需领域错误。

- [ ] **Step 5: 运行完整测试并提交**

```powershell
uv run pytest -q
git add src/domain src/repositories schedule_core.py tests/unit tests/integration
git commit -m "refactor: isolate scheduling domain and D1 repositories"
```

---

### Task 5: 移植诊断和只读 API，建立 Flask/Worker 双运行契约

**Files:**
- Create: `src/routes/diagnostics.py`
- Create: `src/routes/groups.py`
- Create: `src/routes/staff.py`
- Create: `src/routes/positions.py`
- Create: `src/routes/schedules.py`
- Create: `src/routes/hidden_days.py`
- Create: `src/routes/memo.py`
- Create: `src/contracts/common.py`
- Create: `src/contracts/entities.py`
- Create: `src/contracts/schedules.py`
- Create: `tests/contract/test_worker_read_contract.py`

- [ ] **Step 1: 为只读路由写失败契约测试**

用相同 fixture 比较 Flask 与 Worker：

```text
GET groups
GET staff
GET positions
GET schedule/<year>/<month>
GET hidden-days/<year>/<month>
GET memo
GET storage-info
```

忽略平台特有诊断字段，其余 JSON 必须相等。

- [ ] **Step 2: 实现只读 routes 和 DTO 映射**

数据库内部用 ID，响应仍输出当前前端依赖的 `group_name`、`member_names`、`default_person` 和 `person`。FastAPI 422 统一转换为现有 400 错误体。

- [ ] **Step 3: 拆分健康检查**

- `/api/live` 不访问 D1；
- `/api/ready` 只运行 `SELECT 1`，失败返回 503；
- `/api/storage-info` 返回 `mode="d1"`、`database_kind="d1"`，不可用时返回明确状态；
- 任何健康检查不得运行 DDL、seed 或写入。

- [ ] **Step 4: 运行并提交**

```powershell
uv run pytest tests/contract/test_worker_read_contract.py tests/worker -q
uv run pytest -q
git add src/routes src/contracts src/api.py tests/contract
git commit -m "feat: port read APIs to Cloudflare Worker"
```

---

### Task 6: 移植所有写 API、事务和并发冲突处理

**Files:**
- Create: `src/services/group_service.py`
- Create: `src/services/staff_service.py`
- Create: `src/services/position_service.py`
- Create: `src/services/schedule_service.py`
- Create: `src/services/backup_service.py`
- Create: `src/routes/automation.py`
- Modify: `src/routes/groups.py`
- Modify: `src/routes/staff.py`
- Modify: `src/routes/positions.py`
- Modify: `src/routes/schedules.py`
- Modify: `src/routes/hidden_days.py`
- Modify: `src/routes/memo.py`
- Create: `tests/contract/test_worker_write_contract.py`
- Create: `tests/integration/test_write_atomicity.py`

- [ ] **Step 1: 写全部写接口失败契约测试**

覆盖现有所有成功路径和 400/403/404/409/500/503，并特别验证：

- 删除组时人员关系原子清理；
- 更新岗位默认主体和未来排班不会留下半完成状态；
- 单格保存只更新目标日期/岗位；
- cascade-off 是一次 API 原子写，不再依赖前端逐项二次保存；
- reset/restore 失败不改变任何行；
- backup 生成不可覆盖的历史快照；
- auto-substitute 只推荐不写库；
- D1 不可用时写请求返回 503；
- revision 冲突返回 409，不做最后写入者静默覆盖。

- [ ] **Step 2: 实现 framework-neutral services**

service 负责验证和组合 repository 操作，route 只解析输入与转换响应。需要一次修改多表的操作统一构造 D1 batch；对可重试的读后写冲突最多重试 2 次，仍冲突则返回 409。

- [ ] **Step 3: 保持旧 API 形状**

`POST .../day`、`plan-day`、`cascade-off`、`backup` 和 `restore` 继续返回前端已使用字段，同时增加顶层 `revision`。不得把 FastAPI/Pydantic 内部错误直接暴露给用户。

- [ ] **Step 4: 运行并提交**

```powershell
uv run pytest tests/contract/test_worker_write_contract.py tests/integration/test_write_atomicity.py -q
uv run pytest -q
git add src/services src/routes tests/contract tests/integration
git commit -m "feat: port transactional write APIs to D1"
```

---

### Task 7: 加入 Cloudflare Access 身份验证和管理员授权

**Files:**
- Create: `src/security/access.py`
- Create: `src/security/authorization.py`
- Create: `src/routes/auth.py`
- Modify: `src/api.py`
- Modify: `src/routes/groups.py`
- Modify: `src/routes/staff.py`
- Modify: `src/routes/positions.py`
- Modify: `src/routes/schedules.py`
- Create: `tests/security/test_access_jwt.py`
- Create: `tests/security/test_admin_authorization.py`

- [ ] **Step 1: 写认证失败测试**

覆盖：缺 JWT、错误签名、错误 issuer、错误 audience、过期 token、普通用户访问管理员接口、合法用户和合法管理员。测试不得只信任 `Cf-Access-Authenticated-User-Email` 请求头。

- [ ] **Step 2: 实现 JWT 验证与权限矩阵**

Worker 从 Access JWKs 验证 `CF-Access-Jwt-Assertion`。普通排班读写允许授权员工；人员、岗位、小组管理以及 reset/restore 只允许 `ADMIN_EMAILS`。`ADMIN_EMAILS`、Access team domain 和 audience 通过 Worker secrets/vars 注入，不硬编码到仓库。

JWK 按 `kid` 在 isolate 内短时缓存并设置过期时间，使用 Workers Web Crypto/FFI 做签名验证；不得每个 API 请求都重新下载 JWK，也不得用不验签的 JWT decode 代替验证。

- [ ] **Step 3: 删除旧固定密码依赖**

API 不再接受或校验 `11050`。为了兼容旧前端，过渡期可以忽略 body 中的 `password` 字段，但授权必须由 Access 身份决定，并在下一任务删除前端输入。

- [ ] **Step 4: 测试并提交**

```powershell
uv run pytest tests/security -q
uv run pytest -q
git add src/security src/routes src/api.py tests/security
git commit -m "feat: secure Worker with Cloudflare Access"
```

---

### Task 8: 修复前端可靠性、安全和免费请求量

**Files:**
- Modify: `static/index.html`
- Modify: `tests/test_frontend_smoke.py`
- Create: `tests/e2e/test_cloudflare_frontend.py`

- [ ] **Step 1: 先写前端失败测试**

断言：

- `api()` 对非 2xx 解析 `{msg}`；
- 请求有超时/取消，页面卸载时取消；
- 写失败会回拉权威状态并显示中文错误；
- 不再包含字符串 `11050`；
- 不再调用未定义 `fetchAll()`；
- 人员、岗位、小组名称进入 HTML 前统一转义；
- 年份列表基于当前年动态生成；
- 轮询只调用 `/api/revision`，间隔至少 30 秒，`document.hidden` 时暂停；
- revision 变化时才并行刷新 positions、staff、groups 和当月 schedule。

- [ ] **Step 2: 改造 `api()`**

保留相对 `/api/*`；不增加跨域 `API_BASE`。默认同源 Cookie/Access session。所有错误显示后端中文 `msg`，并保留 HTTP status 供调用者区分 401/403/409/503。

- [ ] **Step 3: 合并 cascade-off 保存链**

后端已原子保存时，删除前端对 `updated[]` 的逐项二次 POST，避免重复写和中途失败。

- [ ] **Step 4: 降低轮询量并增加同步状态**

页面可见时每 30 秒请求一次 revision；无变化不读取业务表。页面显示 `已同步 / 同步中 / 同步失败 / 数据冲突已重新加载`，不得吞掉失败。

- [ ] **Step 5: 运行浏览器 E2E**

本地启动 Worker 后运行：

```powershell
uv run pytest tests/e2e/test_cloudflare_frontend.py -q
uv run pytest -q
```

E2E 至少覆盖桌面与手机宽度：首页、年月切换、人员/岗位/小组 CRUD、单格保存、split、plan-day、hidden-days、memo、backup/restore、409 和 503 提示。

- [ ] **Step 6: 提交**

```powershell
git add static/index.html tests/test_frontend_smoke.py tests/e2e
git commit -m "fix: harden frontend sync and security"
```

---

### Task 9: 编写 PostgreSQL 导出、转换、D1 导入和反向恢复工具

**Files:**
- Create: `scripts/export_current_documents.py`
- Create: `scripts/transform_documents_to_d1.py`
- Create: `scripts/import_d1_sql.ps1`
- Create: `scripts/verify_import.py`
- Create: `scripts/export_d1_for_rollback.ps1`
- Create: `scripts/transform_d1_to_documents.py`
- Create: `tests/migration/test_transform_documents.py`
- Create: `tests/migration/test_import_verification.py`
- Create: `docs/cloudflare/data-migration-runbook.md`

- [ ] **Step 1: 先写转换失败测试**

fixture 必须覆盖并拒绝：重名、悬空人员、人员/组名冲突、非法日期、非法 slot、未知状态和重复 ID。正常 fixture 转换后要能反向转换，并在规范化动态字段后与源 JSON 深度相等。

- [ ] **Step 2: 实现只读导出**

`export_current_documents.py` 从明确传入的 PostgreSQL URL 读取全部 `app_json_documents` key，包括 `backup/*`，输出：

```text
.migration/<timestamp>/source.json
.migration/<timestamp>/manifest.json
```

manifest 对每个 key 保存行更新时间、规范化 JSON SHA-256、记录数和脚本 Git commit。脚本不能修改源库，不能打印完整 URL。

- [ ] **Step 3: 实现确定性转换**

把 JSON 文档转换为按外键顺序排列的 SQLite SQL。相同输入必须生成字节一致输出；每个 SQL statement 控制在 D1 限制内；生产导出不得进入测试 fixture。

- [ ] **Step 4: 实现导入与校验**

顺序固定为：apply migrations → execute data SQL → foreign key check → table counts → business aggregates → sample hashes。任何一步失败立即退出非零，不继续部署。

preview 示例：

```powershell
uv run pywrangler d1 migrations apply DB --remote --env preview
uv run pywrangler d1 execute DB --remote --env preview --file='.migration\<timestamp>\d1-import.sql'
uv run python scripts/verify_import.py --env preview --manifest '.migration\<timestamp>\manifest.json'
```

实际执行时 `<timestamp>` 必须替换为本次导出目录的真实名称，并把该名称写入切换记录。

- [ ] **Step 5: 演练反向恢复**

从空 preview D1 导入，再导出并转换回旧 `app_json_documents` JSON，使用临时 PostgreSQL/SQLite 验证旧 Flask 可读取。没有通过反向演练不得进入生产切换。

- [ ] **Step 6: 运行并提交**

```powershell
uv run pytest tests/migration -q
uv run pytest -q
git add scripts tests/migration docs/cloudflare/data-migration-runbook.md
git commit -m "feat: add verified D1 migration and rollback tooling"
```

---

### Task 10: 建立 preview 部署、Access 和真实平台验收

**Files:**
- Create: `docs/cloudflare/deployment-runbook.md`
- Create: `docs/cloudflare/access-policy.md`
- Create: `scripts/smoke_cloudflare.py`
- Create: `scripts/measure_request_budget.py`
- Create: `tests/deployment/test_wrangler_config.py`

- [ ] **Step 1: 配置 Workers Builds GitHub 集成**

在 Cloudflare Dashboard：

1. Workers & Pages → Import a repository；
2. 只授权 GitHub 仓库 `2825157720/smart-scheduling-system`；
3. production branch 设为 `main`；
4. 开启 non-production branch builds；
5. build command：`python -m pip install uv==0.11.28 && uv sync --frozen`；
6. production deploy command：`uv run pywrangler deploy --env production`；
7. non-production deploy command：`uv run pywrangler versions upload --env preview`；
8. Python 版本固定为仓库 `.python-version`。

Worker Dashboard 名称必须与 Wrangler 对应环境的有效 `name` 完全一致。

- [ ] **Step 2: 配置 Cloudflare Access**

首次进入 Zero Trust 时明确选择 Free 计划，并记录 Dashboard 显示的免费席位额度和当前已用席位；若拟开放用户会超额，停止部署并重新审批成本。然后保护 preview Worker 和 preview URLs，只允许管理员邮箱。确认登录后，再为 production Worker 建立默认拒绝策略和员工 allowlist。Access 应覆盖整个 Worker，而不仅是首页。

把真实 Access team domain、audience、管理员列表写入 Cloudflare vars/secrets，不写入文档正文；文档只记录变量名和负责人。

- [ ] **Step 3: 发布 preview 并导入脱敏真实数据**

```powershell
uv run pywrangler d1 migrations apply DB --remote --env preview
uv run pywrangler versions upload --env preview --preview-alias staging
```

将脱敏后的生产快照导入 preview D1，运行：

```powershell
uv run python scripts/smoke_cloudflare.py --base-url $env:CLOUDFLARE_PREVIEW_URL
uv run pytest tests/e2e/test_cloudflare_frontend.py -q
```

- [ ] **Step 4: 执行 Python Worker CPU 强制门禁**

用生产规模 fixture 对 `plan-day`、`auto-fill-all`、月排班 GET 各执行至少 100 次。Cloudflare Analytics/Logs 验收：

- 没有 Error 1102；
- CPU P95 < 8ms；
- 单次响应无意外 5xx；
- 请求体和响应体不写入日志；
- 估算 10 个客户端、每天 8 小时的动态请求 < 30,000/日；
- D1 读写均低于免费额度 50%。

若 CPU 不通过，停止 Task 11。先 profile 并优化；仍不通过，记录 ADR，转 TypeScript Worker 或 Workers Paid。不得放宽门禁上线。

- [ ] **Step 5: 提交运行手册**

```powershell
uv run pytest tests/deployment -q
git add docs/cloudflare scripts/smoke_cloudflare.py scripts/measure_request_budget.py tests/deployment
git commit -m "docs: add Cloudflare deployment and access runbook"
```

---

### Task 11: 给旧 Render 增加可逆只读维护模式

**Files:**
- Modify: `server_runtime.py`
- Modify: `static/index.html`
- Create: `tests/test_read_only_mode.py`
- Modify: `render.yaml`
- Modify: `docs/cloudflare/data-migration-runbook.md`

- [ ] **Step 1: 写维护模式失败测试**

当 `READ_ONLY_MODE=1`：

- 所有 GET 继续可用；
- 所有业务 POST/PUT/DELETE 返回 503 和明确中文维护提示；
- `/api/live` 或旧健康检查仍可用；
- UI 显示只读横幅并禁用编辑入口；
- 关闭变量后无需改数据即可恢复写入。

- [ ] **Step 2: 实现并在 Render 预演**

通过环境变量控制，不把只读状态写入数据库。先在非正式环境打开、关闭各一次并完成 HTTP 验证。

- [ ] **Step 3: 运行并提交**

```powershell
uv run pytest tests/test_read_only_mode.py -q
uv run pytest -q
git add server_runtime.py static/index.html tests/test_read_only_mode.py render.yaml docs/cloudflare/data-migration-runbook.md
git commit -m "feat: add reversible Render read-only mode"
```

---

### Task 12: 生产迁移、验收和回滚门禁

**Files:**
- Create: `docs/cloudflare/cutover-record.md`
- Modify: `docs/cloudflare/data-migration-runbook.md`
- Modify: `docs/cloudflare/deployment-runbook.md`

- [ ] **Step 1: 切换前 24 小时检查**

- 所有测试通过；
- preview 连续稳定至少一个工作日；
- CPU 和请求预算门禁通过；
- Access 普通用户/管理员策略分别验证；
- 生产 D1 当前为空或有明确清理批准；
- PostgreSQL → D1 和 D1 → PostgreSQL 两个方向均已演练；
- 用户已收到维护窗口、旧 URL 和新 URL 说明；
- Render/Supabase 保留 14 天的负责人明确。

- [ ] **Step 2: 进入维护窗口并锁定旧写入**

在 Render 设置 `READ_ONLY_MODE=1` 并验证 GET 200、写请求 503。记录 UTC 和 `Asia/Shanghai` 切换时间、旧应用 commit、权威数据库标识。

- [ ] **Step 3: 最终导出和生产导入**

```powershell
uv run python scripts/export_current_documents.py --output-root .migration
uv run python scripts/transform_documents_to_d1.py --latest-export .migration
uv run pywrangler d1 time-travel info smart-scheduling-production
uv run pywrangler d1 migrations apply DB --remote --env production
uv run pywrangler d1 execute DB --remote --env production --file=$env:D1_IMPORT_FILE
uv run python scripts/verify_import.py --env production --manifest $env:SOURCE_MANIFEST
```

把真实导出目录、manifest SHA-256、Time Travel bookmark、migration list 和每表行数写入 `cutover-record.md`；不写生产数据和秘密。

- [ ] **Step 4: 管理员限定验收**

普通用户 Access 暂不开放。管理员逐项验证：

```text
首页与登录
人员/小组/岗位读取
年月切换
单格保存和刷新一致
split 两个 slot
plan-day 与黄金结果
hidden-days
memo
backup/restore
409 冲突
ready/live
审计记录
```

任何失败都在开放普通用户前回滚到 Render，取消只读变量即可。

- [ ] **Step 5: 开放普通用户并观察**

扩大 production Access allowlist，通知用户新 `workers.dev` 地址。观察至少 2 小时：错误率、CPU、D1 读写、Access 登录、用户反馈。Render 保持只读，禁止两个系统同时可写。

- [ ] **Step 6: 上线后回滚规则**

若普通用户已在 D1 写入，不能直接打开 Render 写入。先把 Worker 切维护状态，导出 D1，反向转换并校验导回 PostgreSQL，验收后才解除 Render 只读。

- [ ] **Step 7: 提交不含秘密的切换记录**

```powershell
git add docs/cloudflare/cutover-record.md docs/cloudflare/data-migration-runbook.md docs/cloudflare/deployment-runbook.md
git commit -m "docs: record Cloudflare production cutover"
```

---

### Task 13: 稳定期、备份和旧平台下线

**Files:**
- Create: `docs/cloudflare/operations-runbook.md`
- Create: `scripts/backup_d1.ps1`
- Create: `scripts/restore_preview_from_backup.ps1`
- Modify: `README.md`

- [ ] **Step 1: 建立独立导出备份**

每周在低峰执行：

```powershell
uv run pywrangler d1 export smart-scheduling-production --remote --output=$env:D1_BACKUP_PATH
```

导出后计算 SHA-256、加密并复制到公司共享路径；至少保留 4 周。免费 D1 Time Travel 只有 7 天，不能代替独立备份。

- [ ] **Step 2: 建立日常维护文档**

README 和 operations runbook 写清：

- 本地 `uv sync`、migration、dev server 和测试命令；
- 分支 → preview → `main` → production 流程；
- Access 用户增删；
- D1 用量和错误查看；
- migration 前 bookmark；
- Worker 代码回滚与 D1 数据恢复是两件事；
- 不在 Dashboard 直接改正式代码。

- [ ] **Step 3: 恢复演练**

把最近一次正式 SQL 导出恢复到空 preview D1，运行完整 API smoke 和 Playwright E2E。记录恢复耗时、失败点和改进项。

- [ ] **Step 4: 14 天稳定验收后下线旧平台**

只有同时满足以下条件才删除 Render/Supabase 资源：

- 14 天内无未解决 P0/P1；
- 两次独立 D1 导出成功；
- 至少一次恢复演练成功；
- 业务负责人确认新 URL 和数据完整；
- 最终 PostgreSQL 导出已加密归档；
- 取消旧平台前已核对是否存在账单和依赖。

- [ ] **Step 5: 最终测试并提交**

```powershell
uv run pytest -q
git diff --check
git add README.md docs/cloudflare/operations-runbook.md scripts/backup_d1.ps1 scripts/restore_preview_from_backup.ps1
git commit -m "docs: complete Cloudflare operations handoff"
```

---

## Definition of Done

- [ ] 一个受 Access 保护的 production `workers.dev` URL 同源提供前端和全部 API。
- [ ] production/preview/local D1 绑定隔离，并通过自动测试验证不共享数据库 ID。
- [ ] 旧 Flask 和新 Worker 的业务黄金契约一致。
- [ ] 无硬编码密码、任意来源 CORS、文件降级或请求期 DDL。
- [ ] 关系化数据导入无重名、悬空外键、非法日期或数量差异。
- [ ] CPU P95、动态请求、D1 读写均满足免费门禁。
- [ ] 管理员和普通用户权限不同，Access JWT 被 Worker 验证。
- [ ] PostgreSQL → D1 和 D1 → PostgreSQL 都演练成功。
- [ ] Render 在稳定期只读，不存在双写。
- [ ] D1 Time Travel bookmark、每周独立导出和恢复手册可用。
- [ ] 所有测试通过，`git diff --check` 无错误，文档与实际配置一致。
