# Cloudflare 迁移 API 契约

本文冻结当前浏览器前端已使用的 HTTP 接口，供 Flask 与 Cloudflare Worker 的兼容测试共同使用。迁移期间不得改变既有 URL、方法、成功字段、错误字段或空数据形状；如需变更，必须新建版本化接口。

## 通用规则

- 所有 `/api/*` 成功与业务失败响应为 `application/json`。
- 业务失败使用 `{ "success": false, "msg": "..." }`；参数错误通常为 `400`，认证口令错误为 `403`，不存在的资源为 `404`。
- 写操作成功使用 `{ "success": true, ... }`；读集合直接返回 JSON 数组，读排班直接返回 JSON 对象。
- `updated_at`、请求 ID 与主机 URL 属于动态字段；黄金响应比较仅规范化这三类字段，绝不忽略排班内容、状态码或业务 ID。
- 日期路径参数按 `Asia/Shanghai` 的业务日期解释；存储层时间戳使用 UTC ISO-8601。

## 名称与迁移安全规则

人员名称与小组名称全局唯一。现有旧系统历史上未强制这一规则，因此导出转换器必须先检查人员名与小组名的交集：一旦发现重名，停止导入，并输出不含敏感数据的冲突清单。不得静默改名、合并或猜测默认人员的主体类型。

该规则是 D1 导入门禁，不追溯改变仍在运行的旧 Flask API 行为；切换前必须通过导入校验。

## 已冻结路由

| 路由 | 方法 | 成功形状 | 失败形状 |
| --- | --- | --- | --- |
| `/api/groups` | GET / POST | 数组；或 `{success, group_id}` | `{success:false,msg}` |
| `/api/groups/:id` | PUT / DELETE | `{success:true}` | PUT 不存在时 `404` |
| `/api/staff` | GET / POST | 数组；或 `{success, staff_id}` | `{success:false,msg}` |
| `/api/staff/:id` | PUT / DELETE | `{success:true}` | PUT 不存在时 `404` |
| `/api/positions` | GET / POST | 数组；或 `{success, pos_id}` | `{success:false,msg}` |
| `/api/positions/:id` | PUT / DELETE | `{success:true, synced_days?}` | PUT 不存在时 `404` |
| `/api/positions/reorder` | POST | `{success:true}` | 保持 JSON 错误契约 |
| `/api/schedule/:year/:month` | GET / POST | 对象；或 `{success, schedule}` | `{success:false,msg}` |
| `/api/schedule/:year/:month/day` | POST | `{success, schedule, cleared_positions}` | `{success:false,msg}` |
| `/api/schedule/:year/:month/plan-day` | POST | `{success, day_data, assigned, failed}` | `{success:false,msg}` |
| `/api/schedule/:year/:month/import-off-days` | POST | 预览 `{success,changed_dates,ignored_dates,changes,plan_results,added_count,removed_count,matched_count,today,preview_token}`；确认额外返回 `{schedule,backup_time}` | `400` 数据错误、`403` 口令错误、`409` 预览过期 |
| `/api/schedule/:year/:month/reset` | POST | `{success, schedule, reset_dates}` | `403` 口令错误 |
| `/api/schedule/:year/:month/backup` | POST | `{success, backup_time}` | JSON 错误契约 |
| `/api/schedule/:year/:month/restore` | POST | `{success, schedule, backup_time}` | `403` 或 `404` |
| `/api/auto-substitute` | POST | `{success, person}` | 参数失败 `400`；无候选仍为 JSON |
| `/api/cascade-off` | POST | `{success, updated}` | `{success:false,msg}` |
| `/api/hidden-days/:year/:month` | GET / POST | 数组；或 `{success:true}` | JSON 错误契约 |
| `/api/memo`、`/api/memo/:year/:month` | GET / POST | `{content,updated_at}`；或 `{success,memo}` | JSON 错误契约 |

## 已知兼容细节

- 空月排班 GET 返回 `{}`；隐藏日期 GET 返回 `[]`；空备忘录返回 `{content:"", updated_at:""}`。
- 旧 Flask 对 POST `/api/schedule/:year/:month` 的 JSON 数组按空排班 `{}` 接受。Worker 首版保持此行为，后续只能通过版本化接口收紧。
- 小组 GET 必须包含 `member_names`，人员 GET 必须包含 `group_name`。
- `split` 排班单元使用 `am` 与 `pm` 两个 slot；slot 内的 workload 与人员分配不得在黄金比较中被省略。
- 重置排班只替换 `Asia/Shanghai` 业务日期严格晚于当天的日期；今天和历史日期原样保留，过去月份返回空 `reset_dates` 且不执行 D1 写入。

## 排休导入规则

- 浏览器在本地解析 `.xlsx`，服务端仅接收已匹配系统人员的 `{staff_id, off_days}`，不接收原始工作簿。
- 请求体 `action` 为 `preview` 或 `apply`；`apply` 必须同时提交现有管理员密码及最近一次预览返回的 `preview_token`。
- Excel 是已匹配人员的休假真值来源：`off_days` 中的日期设为休息，不在其中的日期取消原休息；未提交的系统人员保持不变。
- 只允许修改 `Asia/Shanghai` 业务日期严格晚于当天的日期。今天及过去日期即使存在差异也仅列入 `ignored_dates`。
- 每个休假名单实际变化的日期都调用全天智能排班；周五、周六、周日沿用散排默认值。
- `apply` 在一个 D1 `batch()` 事务中写入整月自动备份并仅替换变化日期；任一语句失败时整体回滚。
