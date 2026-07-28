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
- [ ] 已登录 Access 的浏览器视觉确认

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
- [x] 200% 等效 CSS 可视区：自动化确认主要操作和主表仍可达；正式浏览器 200% 观感待 Preview 视觉确认。
- [x] 字体加载失败：拦截全部本地字体后，系统字体回退仍保持主表和备忘录可见。
- [x] 粘性表头与横向滚动：桌面/平板滚动容器定位保持正确。
- [x] 侧栏标签、管理标签与键盘焦点状态完整。
- [x] 当天排班、导入排休、列设置、管理、小组、人员、岗位七类弹窗完整。
- [x] 右键菜单、拖动排班、拆分格、Toast、Loading 和同步状态保持原有行为。
- [x] `prefers-reduced-motion` 下无缩放、位移或轮询闪烁。

## Production 门禁

- [ ] 用户已确认 Preview 视觉。
- [ ] `dev` 所有提交已推送到 `origin/dev`。
- [ ] 已记录发布前 production version ID。
- [ ] production dry-run 通过。
- [ ] 正式环境仅做读取验收：首页、字体和缓存头、当前月份、人员、岗位、备忘录、同步状态、健康接口与 `www` 跳转。
- [ ] 已将版本、测试、发布和回滚证据只追加到根目录 `HANDOFF.md` 与 `MEMORY.md`。
