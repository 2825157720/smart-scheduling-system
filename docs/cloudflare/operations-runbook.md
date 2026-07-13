# Cloudflare 运维手册

## 环境边界

| 环境 | Worker | D1 | 访问方式 |
| --- | --- | --- | --- |
| 正式 | `paiban` | `smart-scheduling-production` | 公开，无需登录 |
| 预览 | `smart-scheduling-system-preview` | `smart-scheduling-preview` | Cloudflare Access 限制 |
| 旧地址跳转 | `smart-scheduling-system-production` | 无 | 公开，仅返回到正式地址的 308 跳转 |
| 基础配置 | `smart-scheduling-system-base` | 无 | `workers.dev` 和 preview URL 均关闭 |

不得把 preview 的 D1 ID 改成 production D1 ID。不得直接在 Cloudflare Dashboard 编辑正式代码。

## 日常开发和发布

```powershell
cd 'C:\Codex\智能排班系统\.worktrees\dev'
git status --short --branch
uv sync --frozen
uv run pytest -q
node --check src/index.js
npx wrangler deploy --env preview --dry-run
npx wrangler deploy --env preview
```

预览环境验收后：

```powershell
npx wrangler deploy --env production --dry-run
npx wrangler deploy --env production
$base = 'https://paiban.2825157720.workers.dev'
Invoke-RestMethod "$base/api/live"
Invoke-RestMethod "$base/api/storage-info"
```

发布后必须打开正式首页，确认当前月份、人员、岗位、备忘录和“✓ 已同步”。

匿名暴露面也是发布门禁：正式环境必须返回 200，预览环境必须跳转到 Access 登录页或拒绝访问。

```powershell
curl.exe -sS -o NUL -w "%{http_code}`n" 'https://paiban.2825157720.workers.dev/api/live'
curl.exe -sS -o NUL -w "%{http_code} %{redirect_url}`n" --max-redirs 0 'https://smart-scheduling-system-preview.2825157720.workers.dev/api/live'
```

预期：正式为 `200`；预览不得为 `200`，应返回指向 `cloudflareaccess.com` 的跳转。若预览匿名返回业务 JSON，立即停止发布并恢复 Access 策略。

## 短网址与旧地址兼容

正式业务只部署到 `paiban`。旧 Worker 使用独立配置 `wrangler.legacy-redirect.jsonc`，不得添加 D1、Assets 或业务 Secret。只有跳转逻辑变更时才单独部署旧 Worker：

```powershell
npx wrangler deploy --config wrangler.legacy-redirect.jsonc --dry-run
npx wrangler deploy --config wrangler.legacy-redirect.jsonc
```

发布后分别检查旧根路径和旧 `/api/live?probe=1`，最终地址必须位于 `paiban.2825157720.workers.dev`，且路径及查询参数保持不变。普通业务发布无需重复部署跳转 Worker。

## D1 migration

新增 schema migration 后先在预览应用：

```powershell
npx wrangler d1 migrations apply smart-scheduling-preview --remote
npx wrangler deploy --env preview
```

预览通过后再应用正式库：

```powershell
npx wrangler d1 export smart-scheduling-production --remote --output '.migration\before-migration.sql'
npx wrangler d1 migrations apply smart-scheduling-production --remote
npx wrangler deploy --env production
```

## 备份

每周低峰导出一次，文件不得提交 Git：

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$path = ".migration\backups\smart-scheduling-production-$stamp.sql"
New-Item -ItemType Directory -Path (Split-Path $path) -Force | Out-Null
npx wrangler d1 export smart-scheduling-production --remote --output $path
Get-FileHash -LiteralPath $path -Algorithm SHA256
```

将 SQL 和 SHA-256 一并复制到公司受控共享路径，至少保留最近 4 份。恢复前先导入 preview 或新的临时 D1 验证，不要直接覆盖正式库。

## D1 Time Travel

Workers Free 计划的 Time Travel 可恢复最近 7 天内任一分钟的数据状态；它始终开启，但不能代替长期 SQL 导出。恢复前先记录当前 bookmark：

```powershell
npx wrangler d1 time-travel info smart-scheduling-production
npx wrangler d1 time-travel info smart-scheduling-production --timestamp '2026-07-13T15:00:00Z'
```

确认恢复点后再执行以下破坏性命令，必须保存命令返回的“恢复前 bookmark”，以便撤销本次恢复：

```powershell
npx wrangler d1 time-travel restore smart-scheduling-production --bookmark '<已核对的-bookmark>'
```

恢复会覆盖正式 D1 并中断进行中的查询；执行前必须暂停业务写入并另做当前 SQL 导出。

## 代码回滚

```powershell
npx wrangler deployments status --env production
npx wrangler versions list --env production
npx wrangler rollback --env production
```

回滚后重新检查 `/api/live`、`/api/storage-info` 和浏览器首页。代码回滚不会自动还原 D1 数据。

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

正式环境当前按用户确认设置为公开。预览环境必须保持 `Restricted`，两个环境的版本 preview URL 都保持关闭。若未来改回登录访问，应同时配置 Cloudflare Access 和 Worker 端 JWT 验证，防止仅靠边缘策略产生绕过风险。

整月 reset/restore 使用 `ADMIN_PASSWORD` Worker secret；不得把密码写入 `wrangler.jsonc`、前端、测试或文档。轮换方式：

```powershell
npx wrangler secret put ADMIN_PASSWORD --env preview
npx wrangler secret put ADMIN_PASSWORD --env production
```
