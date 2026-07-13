# Cloudflare 迁移基线审计

审计日期：2026-07-13

## 工作区状态

- 正式工作区：`C:\Codex\智能排班系统`，分支 `main`，存在用户未提交改动；本迁移不修改、暂存、重置或清理这些内容。
- 开发工作区：`C:\Codex\智能排班系统\.worktrees\dev`，分支 `dev`，作为唯一实现位置。
- 迁移启动时开发工作区测试结果：44 项测试与 4 项 subtests 通过。

## 正式工作区已有改动的处置

| 文件 | 处置 | 原因 |
| --- | --- | --- |
| `agent.md` | 文档用途 | 仅保留为正式工作区运行约定，不复制到 Worker 实现。 |
| `db_json_store.py` | 迁移参考 | 其中的 PostgreSQL 文档键和故障语义用于导出/兼容分析；D1 不复用文件回退实现。 |
| `render.yaml` | 保留旧部署 | 保留作为 Render 回退服务配置，不作为 Cloudflare 的数据库来源。 |
| `server_runtime.py` | 迁移参考 | 迁移 API 契约和排班语义；不复制 Flask/Gunicorn 或文件启动逻辑。 |
| `tests/test_db_json_store.py` | 迁移参考 | 保留旧存储行为基线；新增 D1 测试在 `dev` 独立编写。 |
| `tests/test_render_config.py` | 保留旧部署 | 仅验证 Render blueprint，不进入 Worker 运行时。 |
| `HANDOFF.md` | 文档用途 | 提供线上部署与 Supabase 的已知事实。 |
| `MEMORY.md` | 文档用途 | 本地交接说明；不作为生产程序输入。 |

## 迁移卫生规则

- `.migration/`、`.dev.vars`、`.wrangler/` 已加入 `.gitignore`。
- 生产导出、数据库 URL、Access JWT、API Token 和 D1 导出文件不得提交。
- 所有新代码先在 `dev` 验证；旧系统在切换完成前继续运行。
