# Production Short URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将正式 Cloudflare Worker 地址缩短为 `paiban.2825157720.workers.dev`，并让旧地址安全跳转到新地址。

**Architecture:** `paiban` 继续运行现有应用并绑定同一个生产 D1。旧 Worker 改为独立、无数据库绑定的 308 跳转器，在新地址验收成功后才部署。

**Tech Stack:** Cloudflare Workers、D1、Wrangler 4、JavaScript ES Modules、Python pytest、Node.js test runner

## Global Constraints

- 生产 D1 必须继续使用 `a31cca3c-92c8-4f11-b5c7-42172c5da53e`。
- 新正式地址必须公开访问，不启用仅限个人邮箱的 Access 策略。
- `ADMIN_PASSWORD` 只能通过 Worker Secret 配置，不能写入代码、配置或日志。
- 旧 Worker 不得保留 D1 或静态资源绑定。
- 先验收新地址，后切换旧地址。

---

### Task 1: 配置与跳转行为

**Files:**
- Modify: `wrangler.jsonc`
- Create: `wrangler.legacy-redirect.jsonc`
- Create: `src/legacy-redirect.js`
- Create: `tests/worker/legacy-redirect.test.mjs`
- Modify: `tests/worker/test_worker_skeleton.py`

**Interfaces:**
- Consumes: 请求对象 `Request` 和目标主机 `paiban.2825157720.workers.dev`
- Produces: 保留路径及查询参数的 `308` 响应；生产环境 Worker 名称 `paiban`

- [ ] **Step 1: 写入失败测试**

在 Python 配置测试中断言生产 Worker 名称为 `paiban`，并在 Node 测试中请求 `/api/live?probe=1`，断言状态码为 `308` 且 `Location` 为 `https://paiban.2825157720.workers.dev/api/live?probe=1`。

- [ ] **Step 2: 确认测试按预期失败**

Run: `uv run pytest tests/worker/test_worker_skeleton.py -q; node --test tests/worker/legacy-redirect.test.mjs`

Expected: Python 因旧生产名称失败，Node 因跳转模块不存在失败。

- [ ] **Step 3: 最小实现**

将 `wrangler.jsonc` 的 production name 改为 `paiban`。创建旧 Worker 专用配置，不声明 `d1_databases` 或 `assets`。跳转 Worker 用 `new URL(request.url)` 保留 `pathname` 和 `search`，替换主机后返回 `Response.redirect(target, 308)`。

- [ ] **Step 4: 确认测试通过**

Run: `uv run pytest tests/worker/test_worker_skeleton.py -q; node --test tests/worker/legacy-redirect.test.mjs`

Expected: 全部 PASS。

### Task 2: 新地址部署与验收

**Files:**
- Modify: Cloudflare Worker `paiban`
- Modify: Worker Secret `ADMIN_PASSWORD`

**Interfaces:**
- Consumes: production 环境配置、现有生产 D1、现有管理密码
- Produces: `https://paiban.2825157720.workers.dev/`

- [ ] **Step 1: 确认名称未占用并部署**

Run: `npx wrangler deployments status --name paiban`

Expected: 目标不存在；随后运行 `npx wrangler deploy --env production` 创建新 Worker。

- [ ] **Step 2: 安全写入 Secret**

从 `.migration` 下的临时忽略文件经标准输入运行 `npx wrangler secret put ADMIN_PASSWORD --env production`，命令完成后立即删除临时文件。

- [ ] **Step 3: API 与可逆写入验收**

检查 `/api/live`、`/api/storage-info` 和核心数据接口；创建唯一临时分组后删除，并确认最终分组数量恢复为 5；用错误密码调用重置接口应返回 403。

- [ ] **Step 4: 浏览器验收**

使用现有浏览器会话打开新地址，确认页面标题、已同步状态、备忘内容、无加载错误且前端源码不包含管理密码。

### Task 3: 旧地址跳转、文档与交付

**Files:**
- Modify: `README.md`
- Modify: `docs/cloudflare/cutover-record.md`
- Modify: `docs/cloudflare/operations-runbook.md`

**Interfaces:**
- Consumes: 已通过验收的新正式地址
- Produces: 旧地址的路径保持型 308 跳转、更新后的运维说明

- [ ] **Step 1: 部署旧地址跳转器**

Run: `npx wrangler deploy --config wrangler.legacy-redirect.jsonc`

Expected: `smart-scheduling-system-production` 更新成功且部署无 D1 绑定。

- [ ] **Step 2: 验证跳转**

请求旧根路径和 `/api/live?probe=1`，确认都返回 308，并保留路径与查询参数跳转至新主机。

- [ ] **Step 3: 更新文档**

将正式地址和 Worker 名称更新为新值，记录旧地址仅用于兼容跳转、部署与回退命令以及实际版本号。

- [ ] **Step 4: 完整验证**

Run: `uv run pytest -q; node --test tests/worker/legacy-redirect.test.mjs; npx wrangler deploy --env production --dry-run; npx wrangler deploy --config wrangler.legacy-redirect.jsonc --dry-run; git diff --check`

Expected: 所有测试通过，两个 dry-run 成功，Git 无空白错误。

- [ ] **Step 5: 提交并推送**

Run: `git add wrangler.jsonc wrangler.legacy-redirect.jsonc src/legacy-redirect.js tests/worker README.md docs/cloudflare docs/superpowers; git commit -m "feat: shorten production worker URL"; git push origin dev`

Expected: `dev` 推送成功且工作区干净。
