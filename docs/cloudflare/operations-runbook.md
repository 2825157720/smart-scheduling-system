# Cloudflare 运维手册

## 环境边界

| 环境 | Worker | D1 | 访问方式 |
| --- | --- | --- | --- |
| 正式 | `paiban`（`ief666.top`） | `smart-scheduling-production` | 应用登录；登录后可读写 |
| 预览 | `smart-scheduling-system-preview` | `smart-scheduling-preview` | Cloudflare Access + 应用登录 |
| 旧地址跳转 | `smart-scheduling-system-production` | 无 | 公开，仅返回到正式地址的 308 跳转 |
| 基础配置 | `smart-scheduling-system-base` | 无 | `workers.dev` 和 preview URL 均关闭 |

不得把 preview 的 D1 ID 改成 production D1 ID。不得直接在 Cloudflare Dashboard 编辑正式代码。

正式业务入口为 `https://ief666.top/`，`www.ief666.top` 必须跳转到根域名。`paiban.2825157720.workers.dev` 仅保留为诊断备用入口，不作为日常分享地址。

## 日常开发和发布

```powershell
cd 'C:\Codex\智能排班系统\.worktrees\dev'
git status --short --branch
uv sync --frozen
npm ci
uv run pytest -q
node --test tests/worker/*.test.mjs
node --check src/index.js
node --check src/auth.js
node --check src/schedule-core.js
node --check src/import-off-days.js
node --check static/login.js
npm run test:frontend
git diff --check
npx --no-install wrangler deploy --env preview --dry-run
npx --no-install wrangler deploy --env preview
```

本地前端入口固定为 `http://127.0.0.1:3001/`，测试 fixture 使用 `npm run dev:test` 启动；`npm run dev` 仅用于已自行配置本地认证 Secret 的环境。不得再用历史 Flask 入口或 `file://` 页面作为前端验收路径。

Preview 必须完成 Access 浏览器验收和视觉确认。发布 production 前，还必须满足：

1. `dev` 当前全部提交（包括此前未推送提交）均已推送到 `origin/dev`。
2. 重新读取并保存 production 当前 version ID，作为本次回滚目标。
3. 用户已明确确认 Preview 视觉。

满足门禁后：

```powershell
npx --no-install wrangler versions list --env production
npx --no-install wrangler deploy --env production --dry-run
npx --no-install wrangler deploy --env production
$base = 'https://ief666.top'
Invoke-RestMethod "$base/api/live"
curl.exe -sS -o NUL -w "%{http_code}`n" "$base/api/storage-info"
```

预期 `/api/live` 为 `200`，未登录的 `/api/storage-info` 为 `401`。正式验收先验证未登录跳转，再登录后只做读取：确认当前月份、人员、岗位、备忘录、同步状态和健康接口，不执行导入、保存、重置、恢复或任何 D1 写入。同时检查字体响应与缓存头，以及 `www.ief666.top` 到根域名的跳转。

## 正式写入维护门禁

production 正常运行时为 `AUTH_MODE=enabled`、`WRITE_MODE=enabled`：未登录业务 API 返回 `401`，登录后才允许读写。`WRITE_MODE=readonly` 是维护和事故止血开关；开启后即使已经登录，所有修改请求仍返回 `503`，历史整月保存接口永久返回 `410`。

进入数据维护或发现异常时，将生产配置改为 `WRITE_MODE=readonly` 并发布；恢复写入前必须完成当前 SQL 导出校验、Preview 同提交验收、回滚 version 记录和责任人复核。不得在 Dashboard 临时修改变量来绕过这条流程。

匿名暴露面也是发布门禁：正式环境只有 `/api/live` 可匿名返回业务 JSON，首页应跳转到 `/login`，业务 API 应返回 `401`；预览环境必须先跳转到 Access 登录页或拒绝访问。

```powershell
curl.exe -sS -o NUL -w "%{http_code}`n" 'https://ief666.top/api/live'
curl.exe -sS -o NUL -w "%{http_code} %{redirect_url}`n" --max-redirs 0 'https://smart-scheduling-system-preview.2825157720.workers.dev/api/live'
```

预期：正式健康接口为 `200`；预览不得为 `200`，应返回指向 `cloudflareaccess.com` 的跳转。若预览匿名返回业务 JSON，立即停止发布并恢复 Access 策略。

## 应用登录与凭据轮换

账号和密码不得写入 `wrangler.jsonc`、前端、测试、文档或命令参数。`AUTH_CREDENTIAL` 只保存 PBKDF2 派生签名，`AUTH_SESSION_SECRET` 使用独立随机值；Preview 与 Production 的会话密钥必须不同。登录 Cookie 为 `HttpOnly`、`Secure`、`SameSite=Strict`，有效期 12 小时；同一来源连续失败 5 次会冻结 15 分钟。

在交互式终端分别生成两个临时 Secret 文件（密码输入会显示为掩码）：

```powershell
npm run auth:generate -- --out="$env:TEMP\paiban-auth-preview.json"
npm run auth:generate -- --out="$env:TEMP\paiban-auth-production.json"
```

部署时使用 `--secrets-file` 原子写入对应环境；文件用完立即删除，不得加入 Git：

```powershell
npx --no-install wrangler deploy --env preview --secrets-file "$env:TEMP\paiban-auth-preview.json"
npx --no-install wrangler deploy --env production --secrets-file "$env:TEMP\paiban-auth-production.json"
Remove-Item -LiteralPath "$env:TEMP\paiban-auth-preview.json", "$env:TEMP\paiban-auth-production.json"
```

轮换密码会同时更换会话密钥，使现有登录立即失效。Secret 丢失不能从 Cloudflare 读回，只能生成新值并重新部署；因此无需备份明文密码或 Secret 文件。

## 短网址与旧地址兼容

正式业务只部署到 `paiban`。旧 Worker 使用独立配置 `wrangler.legacy-redirect.jsonc`，不得添加 D1、Assets 或业务 Secret。只有跳转逻辑变更时才单独部署旧 Worker：

```powershell
npx wrangler deploy --config wrangler.legacy-redirect.jsonc --dry-run
npx wrangler deploy --config wrangler.legacy-redirect.jsonc
```

发布后分别检查旧根路径和旧 `/api/live?probe=1`，最终地址必须位于正式业务域名，且路径及查询参数保持不变。普通业务发布不得重复部署跳转 Worker。

## D1 migration

新增 schema migration 后先在预览应用：

```powershell
npx --no-install wrangler d1 migrations apply smart-scheduling-preview --remote --env preview
npx --no-install wrangler deploy --env preview
```

预览通过后再应用正式库：

```powershell
npx --no-install wrangler d1 export smart-scheduling-production --remote --env production --output '.migration\before-migration.sql'
npx --no-install wrangler d1 migrations apply smart-scheduling-production --remote --env production
npx --no-install wrangler deploy --env production
```

## 备份

每周低峰导出一次，文件不得提交 Git：

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$path = ".migration\backups\smart-scheduling-production-$stamp.sql"
New-Item -ItemType Directory -Path (Split-Path $path) -Force | Out-Null
npx --no-install wrangler d1 export smart-scheduling-production --remote --env production --output $path
Get-FileHash -LiteralPath $path -Algorithm SHA256
```

将 SQL 和 SHA-256 一并复制到公司受控共享路径，至少保留最近 4 份。恢复前先导入 preview 或新的临时 D1 验证，不要直接覆盖正式库。

## D1 Time Travel

Workers Free 计划的 Time Travel 可恢复最近 7 天内任一分钟的数据状态；它始终开启，但不能代替长期 SQL 导出。恢复前先记录当前 bookmark：

```powershell
npx --no-install wrangler d1 time-travel info smart-scheduling-production --env production
npx --no-install wrangler d1 time-travel info smart-scheduling-production --env production --timestamp '2026-07-13T15:00:00Z'
```

确认恢复点后再执行以下破坏性命令，必须保存命令返回的“恢复前 bookmark”，以便撤销本次恢复：

```powershell
npx --no-install wrangler d1 time-travel restore smart-scheduling-production --env production --bookmark '<已核对的-bookmark>'
```

恢复会覆盖正式 D1 并中断进行中的查询；执行前必须确认 production 仍为 `WRITE_MODE=readonly` 并另做当前 SQL 导出。

## 代码回滚

```powershell
npx --no-install wrangler deployments status --env production
npx --no-install wrangler versions list --env production
npx --no-install wrangler rollback --env production
```

回滚目标必须是发布前记录的 production version。回滚后重新检查 `/api/live`、`/api/storage-info` 和浏览器首页。Worker 回滚恢复代码和静态资源，不改变 D1 binding，也不会自动还原 D1 数据。

若目标版本早于某个仍保留在 D1 中的业务字段，旧 Worker 能启动不等于旧算法理解该字段。特别是回滚到不认识 `staff.weekend_only` 的版本后，“仅周末替班”人员会被旧算法视为普通候选；在恢复支持该字段的版本前，必须暂停当天排班、强制重排、自动替班和右键替班写操作，只允许查看已保存排班及执行只读健康检查。

旧地址跳转器需要独立查看或回滚：

```powershell
npx wrangler deployments status --config wrangler.legacy-redirect.jsonc
npx wrangler versions list --config wrangler.legacy-redirect.jsonc
npx wrangler rollback --config wrangler.legacy-redirect.jsonc
```

## 故障处理

- 正式 API 失败但静态页正常：先检查 Worker 当前版本和 D1 binding，禁止在请求中临时建表。
- Wrangler 偶发提示无法解析 `api.cloudflare.com`：先用 `curl.exe -I https://api.cloudflare.com/client/v4/` 验证网络；恢复后重试同一只读或部署命令，不重复导入数据。
- 公司网络若把 `*.workers.dev` 解析到异常地址或重置连接：先用浏览器安全 DNS/其他网络交叉验证，不要修改 Worker 或重复迁移数据；若同事普遍受影响，长期方案应改用自有域名，而不是继续依赖 `workers.dev`。
- 数据异常：立即停止继续修改，先导出当前 D1，再比较表行数和业务样本。
- 需要恢复旧 Render：先确认 Cloudflare 上线后是否有新写入；有写入时必须先完成 D1 → Supabase 同步和校验。

## 访问策略

正式环境使用 Worker 应用登录，预览环境额外保持 Cloudflare Access `Restricted`；两个环境的版本 preview URL 都保持关闭。`AUTH_MODE=enabled` 时如果任一认证 Secret 缺失，Worker 必须 fail closed 返回 `503`，不得回退为匿名访问。

整月 reset/restore 使用 `ADMIN_PASSWORD` Worker secret；不得把密码写入 `wrangler.jsonc`、前端、测试或文档。轮换方式：

```powershell
npx wrangler secret put ADMIN_PASSWORD --env preview
npx wrangler secret put ADMIN_PASSWORD --env production
```
