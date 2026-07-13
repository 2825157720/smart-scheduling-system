# 智能排班系统

当前正式系统已迁移到 Cloudflare Workers + D1：

- 正式地址：<https://smart-scheduling-system-production.2825157720.workers.dev/>
- 正式环境：无需登录，获得网址的人均可查看和编辑。
- 整月重置和恢复仍需管理员密码；密码仅保存在 Cloudflare Worker secret 中，不在网页或仓库里。
- 预览环境：Cloudflare Access 限制访问，且版本预览 URL 已关闭。
- 旧 Render 服务：已暂停；Supabase 数据暂时保留作回滚依据。

## 本地维护

日常开发只在 `C:\Codex\智能排班系统\.worktrees\dev` 的 `dev` 分支进行，正式工作区 `C:\Codex\智能排班系统` 的 `main` 不应被直接覆盖。

```powershell
cd 'C:\Codex\智能排班系统\.worktrees\dev'
uv sync --frozen
uv run pytest -q
npx wrangler deploy --env preview
```

预览验收通过后再发布正式环境：

```powershell
npx wrangler deploy --env production --dry-run
npx wrangler deploy --env production
Invoke-RestMethod 'https://smart-scheduling-system-production.2825157720.workers.dev/api/storage-info'
```

完整的发布、备份和回滚步骤见 [Cloudflare 运维手册](docs/cloudflare/operations-runbook.md)，本次迁移证据见 [生产切换记录](docs/cloudflare/cutover-record.md)。
