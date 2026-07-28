# 手绘纸张风前端验收清单

本文记录 `static/index.html` 与 `static/sketch-theme.css` 的可重复验收范围。自动化使用固定日期 `2026-08-15` 和 14 人 × 31 天 API fixture；人工验收不得写入 production 数据。

## 自动化门禁

- [x] `uv run pytest -q`
- [x] `node --test tests/worker/*.test.mjs`
- [x] `node --check src/index.js`
- [x] `node --check src/schedule-core.js`
- [x] `node --check src/import-off-days.js`
- [x] `npm ci`
- [x] `npm run test:frontend`
- [x] `git diff --check`
- [x] Preview `wrangler deploy --dry-run`
- [x] Preview 已部署（version `a4c9493a-ca60-4933-aa2b-4c48ca3c3a20`），匿名请求会进入 Cloudflare Access 登录页
- [x] 已登录 Access 的浏览器视觉确认，用户确认 Preview 视觉验收通过

Playwright 固定截图：

- `1440×900` 桌面：主表 + 288px 侧栏，桌面装饰不超过三条胶带和两个图钉。
- `1024×768` 平板：缩窄侧栏，主表仍为唯一允许水平滚动的页面区域。
- `390×844` 手机：统计与备忘录位于主表下方，弹窗接近全屏，最多保留一条胶带。

每个视口都检查：

- 本地字体完成加载，页面无外部字体或其他跨域运行时请求。
- 无资源 404、页面异常、浏览器控制台错误和页面级横向溢出。
- 14 名人员、31 天日期、全部状态色和拆分格可见。
- 顶栏主要操作持续可见，窄屏工具条可横向滚动。
- 弹窗可打开和关闭，关闭按钮具有可读名称。
- 右键菜单仍可打开，主表自身可以横向滚动。

## 人工浏览器验收

- [x] `1366×768`：自动化确认主表和侧栏并列、同步状态可见、工具条无溢出。
- [x] `320px`：自动化确认页面无横向溢出、工具条可滚动、侧栏位于主表下方。
- [x] 200% 等效 CSS 可视区：自动化确认主要操作和主表仍可达；Preview 视觉确认通过。
- [x] 字体加载失败：拦截全部本地字体后，系统字体回退仍保持主表和备忘录可见。
- [x] 粘性表头与横向滚动：桌面/平板滚动容器定位保持正确。
- [x] 侧栏标签、管理标签与键盘焦点状态完整。
- [x] 当天排班、导入排休、列设置、管理、小组、人员、岗位七类弹窗完整。
- [x] 右键菜单、拖动排班、拆分格、Toast、Loading 和同步状态保持原有行为。
- [x] `prefers-reduced-motion` 下无缩放、位移或轮询闪烁。

## Production 门禁

- [x] 用户已确认 Preview 视觉。
- [x] 主题发布提交 `f3f08ef`、`106ca46`、`6449122` 已在 production 发布前推送到 `origin/dev`。
- [x] 已记录发布前 production version：`249f699b-e621-4f22-9b66-b903d2c8392c`。
- [x] production dry-run 通过，共识别 268 个静态资源。
- [x] 正式环境仅做读取验收：首页、字体和缓存头、当前月份、人员、岗位、备忘录、同步状态、健康接口与 `www` 跳转。
- [x] 已将版本、测试、发布和回滚证据只追加到根目录 `HANDOFF.md` 与 `MEMORY.md`。

## 2026-07-28 Production 证据

- Production deployment：`17258c6a-9fb9-4bd7-89b2-fb119080a663`
- Production version：`532f24ae-8c3f-41e7-ac60-80483bb16237`，控制面确认 100% 流量
- Worker 回滚目标：`249f699b-e621-4f22-9b66-b903d2c8392c`
- 正式接口：`/api/live`、`/api/storage-info`、人员、岗位、当月排班和备忘录均通过只读验收
- 正式数据快照：14 名人员、20 个岗位、2026 年 7 月 31 天排班，备忘录更新时间未变化
- 正式页面：手绘主题生效，页面级横向溢出为 0，浏览器控制台无 `error`/`warn`，同步状态为“✓ 已同步”
- 静态资源：三组本地字体均返回 200；版本化 WOFF2 使用一年 `immutable`，HTML 与主题 CSS 使用重新验证缓存
- 域名：`www` 对带路径和查询参数的请求返回 301 到根域名
- 数据边界：未执行 D1 migration、restore 或数据写入
