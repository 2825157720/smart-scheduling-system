# Cloudflare 生产切换记录

切换日期：2026-07-13（Asia/Shanghai）

## 最终架构

- 前端和 API：Cloudflare Worker `smart-scheduling-system-production`
- 数据库：Cloudflare D1 `smart-scheduling-production`
- 正式地址：<https://smart-scheduling-system-production.2825157720.workers.dev/>
- 访问方式：公开访问，无需邮箱登录；这是用户明确确认的取舍。
- 高风险操作：整月 reset/restore 仍要求 `ADMIN_PASSWORD` Worker secret，网页和仓库不保存密码。
- 预览环境：`smart-scheduling-system-preview`，独立 D1，Cloudflare Access 限制访问，版本预览 URL 关闭。

正式环境公开意味着任何获得网址的人都能读取和修改排班数据。若后续需要收紧权限，应先确定公司邮箱域名或员工邮箱名单，再恢复 Cloudflare Access；不得只在前端隐藏编辑按钮。

## 数据迁移证据

- 唯一源：Supabase PostgreSQL `app_json_documents`
- 最终源快照 SHA-256：`88E6BC9E38A820AD2DD1A8509E94FFF348D2F0727F794A00C4D0BEEEA3EDA075`
- 最终源快照与切换前一次快照相同，迁移窗口内未发现源数据变化。
- 生产导入后 D1 大小：327,680 bytes

| 表 | 行数 |
| --- | ---: |
| groups | 5 |
| staff | 11 |
| positions | 20 |
| schedule_days | 56 |
| schedule_cells | 869 |
| schedule_slots | 36 |
| schedule_backups | 1 |
| hidden_days | 33 |
| memos | 1 |

上线后已导出 D1 SQL 到被 Git 忽略的 `.migration/d1-production-post-cutover-20260713.sql`：

- 字节数：211,813
- SHA-256：`FFECCC9B97EDB8E23643AA6FB7E6E46990295AB1BF70C319E627E364BF997511`

生产数据、导出 SQL 和连接信息均未提交到 Git。

## 部署与验收证据

- 正式 Worker 版本：`0a09aeb8-3d02-47e1-9fae-0e196e8bd97f`
- 预览 Worker 版本：`2d01f239-18e1-49e8-8e3b-961e87dabb70`
- 匿名 `GET /api/live`：200，`{"ok":true}`
- `GET /api/storage-info`：`mode=d1`、`database_available=true`、`staff_count=11`
- 浏览器首页：标题“智能排班系统”，显示 2026 年 7 月排班、备忘录和“✓ 已同步”
- 可逆写入冒烟：创建唯一临时小组、读取确认、删除、再次确认消失；最终小组数仍为 5
- 误建 Worker `smart-scheduling-system` 已删除，旧地址返回 404
- 旧 Render 服务 `smart-scheduling-system` 已暂停，避免新旧数据库同时写入
- Supabase 暂不删除，作为稳定期回滚依据

## 回滚边界

Worker 代码回滚与 D1 数据回滚是两件事：

1. 仅代码故障且 D1 数据正确：使用 `npx wrangler rollback --env production` 回退 Worker 版本。
2. D1 数据故障：先停止正式写入，保全当前 D1 导出，再从已校验 SQL 备份恢复到独立环境验证。
3. 如果 Cloudflare 上线后已有业务写入，不能直接恢复 Render 写入；必须先把 D1 的新增数据同步回 Supabase并完成数量、排班和备忘录核对，否则会丢数据。
