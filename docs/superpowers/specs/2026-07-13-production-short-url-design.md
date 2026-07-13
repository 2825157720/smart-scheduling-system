# 生产短网址设计

## 目标

将正式访问地址从 `https://smart-scheduling-system-production.2825157720.workers.dev/` 缩短为 `https://paiban.2825157720.workers.dev/`，保留现有生产 D1 数据和公开访问方式。

## 方案审查后的设计

直接改名会让同事保存的旧链接失效；同时保留两个完整 Worker 又会产生两个可写入口，增加维护和故障排查成本。因此采用“新地址承载业务、旧地址只做跳转”的方案：

- 新 Worker 名称为 `paiban`，继续绑定现有 `smart-scheduling-production` D1。
- 旧 Worker `smart-scheduling-system-production` 改成无 D1、无静态资源的轻量跳转 Worker。
- 旧地址对所有路径和查询参数返回 `308 Permanent Redirect`，目标主机固定为 `paiban.2825157720.workers.dev`。
- 先验收新地址，再切换旧地址；切换失败时现有正式系统仍保持可用。

## 安全、恢复与维护

- 新 Worker 重新配置 `ADMIN_PASSWORD` Secret，不把密码写入仓库或日志。
- 旧跳转 Worker不绑定 D1，避免旧入口继续直接写生产数据。
- 生产 D1 ID 不变，无需数据导入、导出或停机。
- 旧书签自动跳转，用户无需统一修改收藏夹。
- 回退时可重新用生产配置部署旧 Worker 名称；D1 数据不受 URL 改名影响。

## 验收标准

- 新地址公开可访问，页面显示已同步，核心 API 返回现有生产数据。
- 新地址使用 `mode=database` 且 `database_available=true`。
- 临时写入后可删除，最终数据计数恢复原值。
- 错误管理密码被拒绝，证明新 Worker 已配置 Secret。
- 旧地址的根路径、API 路径和查询参数均跳转到新地址。
- 自动测试、Wrangler dry-run 和 Git 检查全部通过。
