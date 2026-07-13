# 生产数据权威源确认

确认日期：2026-07-13

## 结论

本次迁移的唯一权威源是 **Supabase PostgreSQL**，由 Render 服务通过 `DATABASE_URL` 使用。Render 是应用运行平台，不是当前数据权威源。

## 证据

1. 项目交接文档明确写明“正式数据已改为 Supabase PostgreSQL 存储”。
2. 用户已明确说明“数据库托管在 Supabase，服务器在 Render”。
3. 切换前审计时，旧 Render 线上 `GET https://smart-scheduling-system-ty94.onrender.com/api/storage-info` 返回：

```json
{"database_available": true, "database_configured": true, "mode": "database"}
```

4. 开发分支的 `render.yaml` 没有 Render PostgreSQL binding。正式工作区未提交的 `render.yaml` 虽新增 Render PostgreSQL blueprint，但它不是已部署且已验证的数据源，不能用于本次导出。

> 生产切换完成后，旧 Render 服务已暂停；以上响应仅作为迁移前历史证据，不代表当前运行状态。

## 导出前检查

- 只从 Supabase 的 `app_json_documents` 导出全部 key，包含 `backup/*`。
- 导出脚本不得打印或写入连接串。
- 每个 key 记录 `updated_at`、规范化 JSON SHA-256、字节数和记录数。
- 当前开发环境不保存 `DATABASE_URL`；Task 9 将通过已授权的 Supabase 会话或运行环境变量执行只读导出。
- 若导出时发现 `app_json_documents` 不存在、重复 key 或与线上 API 的核心数据不一致，立即停止生产切换并保留 Render/Supabase 原状。
