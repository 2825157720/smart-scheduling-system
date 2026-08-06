# 智能排班系统

当前正式系统运行在 Cloudflare Workers + D1：

- 正式地址：<https://ief666.top/>
- `www.ief666.top`：跳转至正式根域名。
- `paiban.2825157720.workers.dev`：仅作为故障诊断备用入口，不作为日常分享地址。
- 正式环境公开访问；整月重置和恢复仍需管理员密码。
- 预览环境由 Cloudflare Access 限制访问，数据与正式 D1 隔离。
- Worker secret、D1 数据和本地导出文件不得提交到仓库。

## 本地开发

日常开发只在 `C:\Codex\智能排班系统\.worktrees\dev` 的 `dev` 分支进行。正式工作区 `C:\Codex\智能排班系统` 的 `main` 不应被直接覆盖。

首次安装：

```powershell
cd 'C:\Codex\智能排班系统\.worktrees\dev'
uv sync --frozen
npm ci
npx --no-install playwright install chromium
```

如本地 D1 尚未初始化，仅对本地 preview 数据库执行：

```powershell
npx --no-install wrangler d1 migrations apply DB --local --env preview
```

启动本地 Worker：

```powershell
npm run dev
```

本地入口固定为 <http://127.0.0.1:3001/>。前端验收不再使用历史 Flask 或 `file://` 入口。

## 测试

```powershell
uv run pytest -q
node --test tests/worker/*.test.mjs
node --check src/index.js
node --check src/schedule-core.js
node --check src/import-off-days.js
npm run test:frontend
git diff --check
```

Playwright 使用固定的 14 人 × 31 天 fixture，并覆盖桌面、平板和手机视口。需要刷新经人工确认的截图基线时，显式执行 `npm run test:frontend:update`。

岗位管理中的“同步排班”只重算今天及未来日期：自动格直接跟随当前岗位设置，人工格保持不变；旧数据中无法确认来源的休假、替班和拆分格会先显示日期并要求再次确认。

## 发布边界

先执行 Preview dry-run 和部署：

```powershell
npx --no-install wrangler deploy --env preview --dry-run
npx --no-install wrangler deploy --env preview
```

必须在 Preview 完成浏览器视觉确认，并确保本地提交已全部推送到 `origin/dev`，才可发布正式环境。正式发布、只读验收、版本记录和回滚步骤见 [Cloudflare 运维手册](docs/cloudflare/operations-runbook.md)。

如本次包含 D1 migration，必须先备份目标 D1、应用 migration 并验证 schema，再部署读取新字段的 Worker。旧 Worker 可以忽略新增列仅表示页面和旧 API 能恢复，不代表它理解新字段的业务规则；例如回滚到不认识 `weekend_only` 或 `assignment_source` 的版本时，必须暂停当天排班、岗位同步、强制重排、自动替班及右键替班写操作，恢复新版后才能继续。已保存排班的只读查看不受影响。反向操作会让新版 Worker 在迁移前因缺少字段而失败。
