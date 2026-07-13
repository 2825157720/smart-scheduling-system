# 智能排班系统 Cloudflare 迁移设计

**日期：** 2026-07-13

**状态：** 待实施

**目标：** 在不购买服务器和域名的前提下，把现有 Render + PostgreSQL 部署迁移到 Cloudflare 免费层，并保留可回滚能力。

## 1. 结论

推荐使用一个 Cloudflare Worker 同时承载：

- `static/` 静态前端；
- `/api/*` 后端 API；
- D1 数据库访问；
- Cloudflare Access 登录保护。

首个正式地址使用 `https://smart-scheduling-system.<account-subdomain>.workers.dev`，不要求先购买域名。代码继续在本机维护并推送 GitHub，Cloudflare Workers Builds 监听 GitHub：非正式分支生成预览版本，`main` 才部署正式版本。

后端首选 Cloudflare Python Workers + FastAPI，而不是立即把排班算法重写成 TypeScript。现有 `schedule_core.py` 是纯 Python，可直接复用；Flask 路由、文件存储、Gunicorn 和启动脚本不能原样迁移，必须改为 Worker/FastAPI 入口和异步 D1 repository。

这是一套“零成本过渡架构”，不是带 SLA 的最终企业架构。Cloudflare 官方仍将 Python Workers 标为 Beta，Workers 免费版每次动态请求的 CPU 上限为 10ms，`workers.dev` 也更适合起步和非关键业务。因此上线前必须通过真实数据 CPU 门禁；不通过就不切换。

## 2. 为什么采用单 Worker 同源部署

当前前端在 `static/index.html:724-730` 使用相对 `/api/*` URL，同源是现有程序的硬假设。若把静态页面和 API 分开部署到两个域名：

- 所有相对 API 请求会先打到静态站域名；
- 当前 GET 也发送 `Content-Type: application/json`，跨域会触发预检；
- 需要额外维护 CORS、API 地址、登录 Cookie 和两套部署；
- 更容易出现静态前端已更新、API 尚未更新的版本错配。

Workers Static Assets 支持把 `static/` 与 Worker 脚本一起发布，并让 `/api/*` 先进入 Worker。这样不改 URL、不需要 CORS，也不需要引入 React、Vite 或 Sites/Vinext 前端重写。

```text
浏览器
  │
  ▼
Cloudflare Access
  │
  ▼
同一个 Cloudflare Worker
  ├─ /、/static/* ──────> Static Assets（static/index.html）
  └─ /api/* ───────────> FastAPI adapter
                           │
                           ├─ domain/services（复用排班算法）
                           └─ D1 repositories ──> D1
```

## 3. 方案比较与二次审查

### 方案 A：Python Worker + FastAPI + D1（推荐）

优点：

- 最大程度复用 `schedule_core.py` 及现有 Python 测试；
- 后续业务规则仍使用团队已经熟悉的 Python；
- FastAPI、D1 binding 和 Static Assets 都有 Cloudflare 官方路径；
- 初始改写量显著低于 TypeScript 全量重写。

主要代价：

- Python Workers 截至本设计日期仍为 Beta；
- 免费版每次请求只有 10ms CPU，自动排班必须用真实数据测量；
- Flask request context、同步数据库代码和文件降级模式不能复用；
- FastAPI 默认 422 错误需适配成现有前端理解的 400/403/404/500 契约。

### 方案 B：TypeScript/Hono Worker + D1

优点：Workers 主运行时更成熟、工具链和测试集成更完整、通常更容易压低 CPU。

不作为首选的原因：需要重写并重新验证约 476 行核心排班算法以及全部后端路由，最容易引入“看起来能运行、排班结果悄悄变化”的业务回归。若方案 A 的 CPU 或 Beta 兼容性门禁失败，再启用方案 B；D1 schema、API 契约和数据迁移脚本仍可复用。

### 方案 C：Cloudflare Pages/Sites 前端 + 独立 API

不推荐。它会制造跨域、两次发布和认证边界，且没有解决 Flask 不能原样运行在 Workers 的问题。当前前端本身已经是可直接托管的静态单页，无需为部署而重写。

### 二次方案审查后的调整

从长期扩展、安全隔离、故障恢复、维护成本和实际操作复杂度复核后，基础方案做以下增强：

1. 不把现有 `app_json_documents` 整行 JSON 模型原样复制到 D1。排班按日期拆表，人员、小组、岗位关系化，避免所有月份共享一个 `schedule.json` 行造成丢失更新和单行增长。
2. 不使用双写 PostgreSQL + D1。采用短暂停写窗口、最终快照、校验后一次切换，降低数据分叉和维护成本。
3. 不自行维护共享登录密码。用 Cloudflare Access 保护 `workers.dev` 和预览地址；Worker 仍验证 Access JWT，敏感操作再按管理员邮箱授权。
4. 不让数据库故障静默降级到 Worker 文件系统。D1 写失败必须明确返回失败；Workers 临时文件不能当持久化存储。
5. 不让每个浏览器继续每 10 秒发 3 个读取请求。增加轻量 revision 接口，页面可见时每 30 秒检查一次，只有版本变化才重新加载，避免少量常开客户端耗尽 100,000 次/日免费请求。
6. 不依赖应用启动建表或播种。所有 DDL 和 seed 都进入版本化 D1 migrations。
7. 正式库、预览库和本地库彻底分离，任何非 `main` 构建都不得绑定正式 D1。

## 4. 目标数据模型

建议的 D1 核心表：

```text
groups
  id PK, name UNIQUE, created_at, updated_at

staff
  id PK, name, group_id FK -> groups ON DELETE SET NULL,
  can_cpin, can_jd, saturday_only, no_substitute,
  created_at, updated_at

positions
  id PK, sort_order, name, workload, category, split_allowed,
  default_staff_id FK -> staff,
  default_group_id FK -> groups,
  created_at, updated_at

schedule_days
  work_date PK, scatter_groups, revision, updated_at

schedule_day_off_staff
  work_date FK, staff_id FK, PK(work_date, staff_id)

schedule_cells
  work_date FK, position_id FK, status,
  staff_id FK nullable, group_id FK nullable,
  revision, PK(work_date, position_id)

schedule_slots
  work_date FK, position_id FK, slot CHECK(am/pm), status,
  staff_id FK nullable, group_id FK nullable, workload,
  PK(work_date, position_id, slot)

hidden_days
  work_date PK

memos
  id PK CHECK(id = 'global'), content, updated_at

schedule_backups
  id PK, year, month, payload_json, created_at, created_by

app_revision
  id PK CHECK(id = 1), revision, updated_at

mutation_audit
  id PK, actor_email, action, target, summary_json, created_at
```

兼容策略：数据库内部改用 ID 和外键，API 继续输出当前前端依赖的姓名字段和 JSON 形状。这样前端首阶段无需整体重写，同时消除姓名改动造成的引用漂移。

导入时必须拒绝以下数据，而不是猜测：

- 人员名和小组名重名，导致 `default_person` 无法判定主体；
- 排班记录中的姓名在人员、小组中都找不到；
- 同一类型内存在重复名称；
- 岗位、日期或 slot 结构不合法；
- 权威数据库与 Render 本地降级文件的更新时间冲突。

## 5. API 与前端兼容

首阶段保留所有现有前端已调用的 URL、HTTP 方法、成功字段和错误状态。重点包括：

- groups、staff、positions CRUD；
- positions reorder；
- 月排班读取、单格保存、单日规划、重置、备份、恢复；
- auto-substitute、cascade-off；
- hidden-days 和 memo。

新增：

- `GET /api/live`：只证明 Worker 能响应，永远不执行 DDL；
- `GET /api/ready`：执行只读 D1 探测，D1 不可用时返回 503；
- `GET /api/revision`：返回全局 revision，供低成本轮询；
- 所有写响应返回最新 revision；
- 写冲突返回 409 和可读中文提示，前端重新获取权威数据后再操作。

删除或替代：

- `/api/server-info` 的局域网 IP 逻辑改为 `location.origin`；
- 任意来源 CORS 不迁移；
- 浏览器源码和后端中的固定密码 `11050` 删除；
- 数据库失败后的文件降级删除。

前端迁移时一并修复：

- 非 2xx 时解析后端 JSON 错误而不是只显示 `HTTP 500`；
- 写失败后恢复界面或重新拉取权威数据；
- 修复岗位拖拽失败路径中未定义的 `fetchAll()`；
- 数据库文本进入 `innerHTML` 前转义，消除持久化 XSS；
- 年份下拉不再固定到 2030；
- 页面隐藏时暂停 revision 轮询。

## 6. 安全设计

1. Cloudflare Access 覆盖正式 Worker 和预览 URL，默认拒绝未授权用户。
2. Access 策略只允许明确的公司邮箱或邮箱域；避免 `Everyone`、`All valid emails` 等宽泛策略。
3. Worker 验证 `CF-Access-Jwt-Assertion` 的签名、issuer 和 audience，不能只信任可伪造请求头。
4. reset、restore、人员/岗位/小组管理仅允许 `ADMIN_EMAILS` 中的邮箱。
5. 所有敏感写操作记录 `mutation_audit`；日志不记录完整排班、数据库导出或 Access JWT。
6. 预览环境使用独立 D1 和独立 Access 策略，禁止读取正式数据。
7. 导出文件放在忽略版本控制的 `.migration/`，不得提交数据库 URL、API Token、JWT 或生产数据。
8. 首次配置 Zero Trust 时明确选择 Free 计划，并在开放用户前核对实际席位数仍在 Dashboard 显示的免费额度内；若公司用户数超出免费额度，必须重新做成本审批，不能继续宣称零成本。

## 7. 成本与容量门禁

已登录账户当前 D1 页面显示 0/10 个数据库，可创建免费 D1。设计至少使用两个远程库：preview 和 production，仍在账户免费数量范围内。

“零成本”还以 Cloudflare Zero Trust/Access 账户保持 Free 计划、实际用户席位未超额为前提；该条件要在 Dashboard 中作为上线检查项再次确认。

当前免费层关键约束：

- Workers 动态请求 100,000 次/日；
- 每次动态请求 CPU 10ms；
- 静态资源请求免费且不限次数；
- D1 读取 5,000,000 行/日、写入 100,000 行/日；
- D1 单库 500MB、账户总计 5GB；
- D1 Time Travel 免费版保留 7 天。

上线门禁：

- 正式数据 fixture 下，自动排班/单日规划连续执行 100 次无 Error 1102；
- Cloudflare 实测 CPU P95 小于 8ms，留出平台波动空间；
- 10 个客户端按 8 小时工作日估算，API 请求量低于 30,000 次/日；
- D1 日读写估算低于免费额度的 50%；
- 若 CPU 门禁失败，先优化热点；仍失败则选择 TypeScript Worker 或每月最低 5 美元的 Workers Paid，不以“偶尔能跑”作为上线标准。

## 8. 数据迁移与切换

### 权威数据确认

交接文档称正式数据在 Supabase，但当前正式工作区未提交的 `render.yaml` 又声明 Render PostgreSQL，同时应用在数据库失败时可能写本地文件。迁移前必须读取线上 `/api/storage-info`，并比较：

- Supabase `app_json_documents`；
- Render PostgreSQL（若已创建）；
- Render 实例文件或最近导出；
- 各文档 key、更新时间、字节数和 SHA-256。

只有一处可被书面标记为权威源；有冲突时暂停导入并人工决定，不能按“更新时间最新”自动覆盖。

### 切换流程

1. 在 preview D1 完成迁移、契约测试、E2E 和真实数据脱敏压测。
2. 给旧 Render 增加 `READ_ONLY_MODE`，写请求返回维护提示。
3. 开始维护窗口，启用 Render 只读，记录切换时间。
4. 从权威 PostgreSQL 做最终一致快照并生成 manifest。
5. 转换、导入 production D1，执行行数、外键、业务聚合和抽样 JSON 校验。
6. 仅把 Access 策略开放给管理员，完成正式 URL 写入验收。
7. 验收通过后再开放给普通用户；Render 继续只读 14 天。
8. 14 天稳定期后再下线 Render；Supabase 保留只读备份到约定日期。

不做 PostgreSQL 与 D1 长期双写。双写会同时引入失败顺序、补偿、重放和去重问题，远高于一次短暂停写的操作成本。

## 9. 回滚与恢复

### 开放普通用户前失败

停止 Cloudflare 发布，关闭新 Worker 的普通用户 Access，取消 Render 只读并继续使用原 URL。此时没有普通用户在 D1 产生业务写入，回滚最简单。

### 开放普通用户后失败

1. 立即把 Cloudflare 应用改为维护状态，停止 D1 新写入；
2. 导出 D1 SQL 和业务 JSON；
3. 使用预先演练过的反向转换脚本导回临时 PostgreSQL；
4. 对比 manifest 和业务聚合；
5. 通过后才重新开放 Render 写入。

不能只执行 Worker 版本回滚：Worker rollback 不会回滚 D1 schema 或数据。

### 日常恢复

- D1 migration 前记录 Time Travel bookmark；
- 每周执行 `wrangler d1 export`，加密后保存在公司共享路径；
- 免费版 Time Travel 只能覆盖 7 天，因此独立导出至少保留 4 周；
- 每季度演练一次从 SQL 导出恢复到空 preview D1。

## 10. 维护方式

日常流程保持简单：

1. 在 `.worktrees/dev` 开发并运行测试；
2. 推送功能分支，Cloudflare 生成隔离 preview；
3. 通过契约测试、浏览器验收和人工批准；
4. 合并 `main`，Workers Builds 自动发布 production；
5. migration 与代码同一提交，先应用向后兼容 schema，再发布代码；
6. 破坏性 schema 清理延后至少一个版本。

不得在 Cloudflare Dashboard 直接编辑正式 Worker 代码。Dashboard 只用于账户、D1、Access、绑定、构建和观测配置，GitHub 仓库是代码事实来源。

## 11. 预计节奏与实际代价

按一名熟悉现有代码的开发者估算：

| 阶段 | 预计工作量 | 交付 |
| --- | ---: | --- |
| 基线、权威数据源、API 契约 | 1 天 | 可比较的旧系统基线 |
| Worker/FastAPI、D1 schema、repository | 2–3 天 | 本地完整 API |
| Access、前端可靠性、数据转换 | 2–3 天 | 可发布 preview |
| preview 验收、CPU/额度门禁 | 1–2 天 | 上线/停止决策 |
| 生产维护窗口与切换 | 0.5–1 天 | 管理员验收后开放 |
| 只读观察期 | 14 个自然日 | 决定是否下线旧平台 |

正常路径约 6.5–10 个开发工作日，日历时间约 3 周（含 14 天只读观察）。基础设施账单可以保持 0 元，但真正的成本是代码迁移、测试、数据核对和恢复演练。若 Python Worker CPU 门禁失败，TypeScript 改写会额外增加约 3–5 个开发工作日；选择 Workers Paid 则至少增加每月 5 美元平台成本。

## 12. 参考文档

- [Python Workers](https://developers.cloudflare.com/workers/languages/python/)
- [FastAPI on Python Workers](https://developers.cloudflare.com/workers/languages/python/packages/fastapi/)
- [Python Worker 查询 D1](https://developers.cloudflare.com/d1/examples/query-d1-from-python-workers/)
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Workers 免费层与计费](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 价格与限制](https://developers.cloudflare.com/d1/platform/pricing/)
- [D1 migrations](https://developers.cloudflare.com/d1/wrangler-commands/)
- [D1 导入导出](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [保护 workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- [Workers Builds GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
- [Worker rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
