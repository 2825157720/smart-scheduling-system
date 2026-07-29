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

## 2026-07-29 少量日期列回归与正式发布

- [x] 修复提交 `9b49be9 fix(frontend): keep visible schedule columns uniform` 已推送并与 `origin/dev` 同步。
- [x] 只显示 5 天时，岗位、默认人、工作量和日期列保持约定宽度，不再填满容器空余空间。
- [x] 普通格与同日拆分格同宽，上午、下午槽各占 50%。
- [x] 桌面、平板、手机均无页面级横向溢出，三个视口均保留 `hidden-five-days.png` 截图基线。
- [x] 自动化：Python `91 passed`；Worker `26 passed`；Playwright `10 passed / 2 skipped`；三项 Node 语法检查及 `git diff --check` 通过。
- [x] Preview version：`f2d7fc92-df41-4924-b749-706856aed2df`。
- [x] 发布前 Production version / 回滚目标：`532f24ae-8c3f-41e7-ac60-80483bb16237`。
- [x] 发布后 Production deployment：`f25bc534-37dd-46c9-b804-47352a10eb65`。
- [x] 发布后 Production version：`a023333b-8f46-4238-88af-5ed848367e4a`，控制面确认承载 100% 流量。
- [x] 正式页面当前显示 2026 年 7 月 27–31 日五列；同步状态为“✓ 已同步”，字体加载完成，页面根级横向溢出为 0，控制台无 `error`/`warn`。
- [x] 正式接口、14 名人员、20 个岗位、31 天排班、备忘录、字体与缓存头及 `www` 跳转均通过只读验收。
- [x] 未点击列设置“应用”，未执行 D1 migration、restore 或业务数据写入，D1 binding 保持 `smart-scheduling-production`。
- [x] Worker 异常时回滚到 `532f24ae-8c3f-41e7-ac60-80483bb16237`；Worker 回滚不会改变 D1 数据。

## 2026-07-29 完整姓名与拆分格 Preview

- [x] 实现提交 `549009c fix(frontend): keep schedule names fully visible` 已推送并与 `origin/dev` 同步。
- [x] 拆分格移除可见“上 / 下”，保持左上午、右下午；两侧只显示完整姓名或状态字，时段语义由完整 `title` 和读屏文本保留。
- [x] 日期列默认统一为 56px；按当前可见排班的最长姓名统一动态扩宽，隐藏最长姓名日期后统一回落，重新显示后统一恢复。
- [x] 普通替班与拆分姓名均不再主动截为两字，也不使用 `text-overflow: ellipsis`。
- [x] 浏览器回归覆盖四字姓名、保存后扩宽/改回后收窄、含 `& < > " '` 的姓名转义、隐藏列组合、根级无横向溢出。
- [x] 自动化：Python `92 passed`；Worker `26 passed`；Playwright `13 passed / 2 skipped`；三项 Worker Node 语法检查、前端测试语法检查和 `git diff --check` 通过。
- [x] `npm ci` 完成且报告 0 个漏洞；Preview dry-run 识别 268 个静态资源。
- [x] Preview version：`f0b2902f-c7de-4bf6-9d86-29b8bbb4af35`；deployment `1e8fe155-fc6f-4957-8f70-5056fc2e71fd`，控制面确认承载 100% 流量。
- [x] 用户已确认 Preview 的 56px 密度和左右时段辨识，允许发布 production。
- [x] 本次未修改 `/api/*`、D1 schema 或排班算法，未执行 D1 migration、restore 或业务数据写入。

## 2026-07-29 完整姓名与拆分格 Production

- [x] 发布前 Production version / Worker 回滚目标：`a023333b-8f46-4238-88af-5ed848367e4a`。
- [x] 发布后 Production deployment：`7bd47119-91cf-469e-946f-fb1b15620a04`。
- [x] 发布后 Production version：`e5e6cda7-21a7-4003-a785-5fc8c192ebcb`，控制面确认承载 100% 流量。
- [x] Production dry-run 识别 268 个静态资源，D1 binding 保持 `smart-scheduling-production`。
- [x] 正式接口返回 `ok=true`、`mode=d1`、`database_available=true`；人员 14 名、岗位 20 个、2026 年 7 月排班 31 天。
- [x] 正式页面当前显示 7 月 27–31 日五列，日期列均为 56px；拆分格完整显示“玉兰 / 爱萍”，无可见“上 / 下”、无省略号或裁切。
- [x] 正式浏览器字体状态为 `loaded`，根节点和 `body` 横向溢出均为 0，同步状态为“✓ 已同步”，控制台无 `error`/`warn`。
- [x] 首页、主题 CSS 和字体均返回 200；字体使用一年 `immutable`，主题 CSS 使用 `must-revalidate`。
- [x] `www` 对带路径和查询参数的请求返回 301，并完整跳转到正式根域名。
- [x] 回滚命令：`npx --no-install wrangler rollback a023333b-8f46-4238-88af-5ed848367e4a --config .\wrangler.jsonc --env production`；Worker 回滚不会改变 D1 数据。
