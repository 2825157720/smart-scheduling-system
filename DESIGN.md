---
name: 智能排班系统
description: 面向高频排班操作的手绘纸张风界面
colors:
  paper: "#F6F0E4"
  paper-card: "#FFFDF7"
  paper-muted: "#F1E6D3"
  ink: "#252522"
  ink-muted: "#595750"
  marker-red: "#C7363E"
  pen-blue: "#2358A5"
  sticky-yellow: "#FFF1A8"
  status-on-bg: "#DDEEDC"
  status-on-fg: "#245C34"
  status-group-bg: "#DCEAF8"
  status-group-fg: "#204E7C"
  status-off-bg: "#F8DADB"
  status-off-fg: "#862831"
  status-sub-bg: "#F8E0B8"
  status-sub-fg: "#7A4312"
  status-pending-bg: "#E7DDF2"
  status-pending-fg: "#5A3B73"
  status-past-bg: "#E9E4DA"
  status-past-fg: "#5F5B54"
typography:
  display:
    fontFamily: "Kalam, LXGW WenKai Screen, STKaiti, KaiTi, cursive"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.2
  title:
    fontFamily: "Kalam, LXGW WenKai Screen, STKaiti, KaiTi, cursive"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.25
  note:
    fontFamily: "Patrick Hand, LXGW WenKai Screen, STKaiti, KaiTi, cursive"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Microsoft YaHei, PingFang SC, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, Segoe UI, Microsoft YaHei, PingFang SC, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.35
rounded:
  control: "8px"
  wobbly-1: "12px 8px 14px 7px / 8px 13px 7px 12px"
  wobbly-2: "8px 14px 7px 12px / 13px 8px 12px 7px"
  wobbly-3: "14px 7px 11px 9px / 7px 12px 8px 14px"
  wobbly-4: "9px 12px 8px 14px / 12px 7px 14px 9px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.status-on-bg}"
    textColor: "{colors.status-on-fg}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.paper-card}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
    height: "32px"
  paper-card:
    backgroundColor: "{colors.paper-card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.wobbly-1}"
    padding: "16px"
  field:
    backgroundColor: "{colors.paper-card}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "7px 9px"
    height: "32px"
---

# Design System: 智能排班系统

## Overview

**Creative North Star: "值班室里的手写排班册"**

界面像一本长期放在值班室桌面的排班册：米白纸、墨线、标记笔和便利贴带来真实手作感，高密度排班数据仍保持规整、清晰和可快速扫描。表达力集中在页面外壳、标题、备忘录、统计卡与弹窗；排班网格、姓名、日期、数字和表单控件服从操作效率。

装饰是信息层级的标点，不是独立内容。胶带、图钉、圆点纸和轻微倾斜只出现在静态纸卡；排班表、工具栏、弹窗、表单与右键菜单始终端正。

**Key Characteristics:**

- 手绘纸张外壳包裹稳定功能核心。
- 墨线和硬阴影提供触感，鲜色只标动作、状态与重点。
- 所有状态同时使用颜色与文字或符号，不只依赖颜色。

## Colors

色盘取自纸张与办公文具：温暖纸色承担大面积背景，墨色建立结构，红蓝黄只作为稀疏而明确的操作与提示。

### Primary

- **在班绿**：主要动作使用浅绿底和深绿文字，延续“可执行、已就绪”的业务语义。
- **标记笔红**：危险动作和关键提示使用，必须与卡纸白或深墨文字形成清晰对比。

### Secondary

- **钢笔蓝**：键盘焦点、信息操作和同步相关提示。

### Tertiary

- **便利贴黄**：备忘录、临时提醒和少量静态纸卡。

### Neutral

- **米白纸张**：页面底层与圆点纸背景。
- **卡纸白**：工具栏、排班表、弹窗和表单表面。
- **墨黑**：主要文字、轮廓与硬阴影。
- **次要墨色**：说明文字、分隔与弱化信息。

排班状态使用独立的浅色底和深色文字配对：在班、小组、休假、替班、待定、历史均保留文字或符号识别。

**The Ink First Rule.** 大面积背景保持纸张中性色；鲜色只用于动作、状态和少量标记，不把高密度界面染成彩色面板。

## Typography

**Display Font:** Kalam，中文回退至 LXGW WenKai Screen。

**Body Font:** 系统 UI 字体，中文优先使用 Microsoft YaHei 或 PingFang SC。

**Note Font:** Patrick Hand，中文回退至 LXGW WenKai Screen。

**Character:** 标题和静态说明呈现真实笔迹感；业务数据与交互文字保持中性、紧凑和高辨识度。所有字体均以固定版本自托管，加载时允许系统字体即时回退。

### Hierarchy

- **Display**（400，22px，1.2）：品牌标题和最上层页面识别。
- **Title**（400，18px，1.25）：纸卡、侧栏和弹窗标题，可使用克制的波浪下划线。
- **Note**（400，16px，1.45）：备忘录、短说明与静态便签。
- **Body**（400，14px，1.5）：普通说明和内容。
- **Label**（600，13px，1.35）：按钮、表单标签、日期、姓名和高密度表格。

**The Dense Data Rule.** 手写字体不得进入动态姓名、日期数字、输入值、按钮标签和排班表单元格；数据数字启用等宽数字。

## Layout

页面主体以排班表为第一视觉区，桌面端右侧配置 288px 侧栏；900–1199px 缩窄侧栏，900px 以下将统计和备忘录移到主表下方。640px 以下弹窗接近全屏，并取消旋转和多数装饰。

顶栏由品牌/年月、主要操作、工具操作三组构成。“当天排班”和“导入排休”始终优先显示；窄屏下次要工具保持单行横向滚动。除排班表自身的水平滚动容器外，页面不得产生横向溢出。

桌面控件最小高度为 32px，粗指针设备的可点击区域至少为 44×44px。页面圆点纸网格为 1px 圆点、20px 间距。

## Elevation & Depth

深度来自结构化的墨线和纯偏移硬阴影，不使用模糊、玻璃、噪点图或背景滤镜。高密度数据区域保持平面，只用规则线区分行列。

### Shadow Vocabulary

- **纸卡硬阴影**（`4px 4px 0` 墨黑）：大纸卡和侧栏容器。
- **控件硬阴影**（`2px 2px 0` 墨黑）：按钮与小型浮层。
- **数据区规则线**（1–2px 墨线）：输入框、排班表、拆分格和菜单。

**The Hard Shadow Rule.** 阴影只做纯偏移且无模糊；排班单元格、表头和表单字段不得使用纸卡硬阴影。

## Shapes

静态纸卡在四组固定 `wobbly` 圆角之间依序轮换，禁止运行时随机。静态便签可在 `-1.2°`、`+0.9°`、`-0.7°`、`+1.3°` 间轮换；排班表、工具栏、弹窗、表单和右键菜单保持 `0°`。

大纸卡使用 3px 墨线；按钮使用 2px 墨线；输入框和表格使用 1–2px 规则线。胶带约 52×14px，桌面最多三条、移动端最多一条；图钉最多两个，所有装饰均不接受指针事件。

## Components

### Buttons

- **Shape:** 规则小圆角与 2px 墨线，桌面至少 32px 高。
- **Primary:** 在班浅绿底、深绿文字与 2px 硬阴影。
- **Secondary:** 卡纸白或语义浅色底、墨色文字和同等轮廓。
- **Hover / Focus:** 悬停只允许轻微阴影变化；`:focus-visible` 使用统一钢笔蓝轮廓。`prefers-reduced-motion` 下取消缩放、位移和闪烁。

### Cards / Containers

- **Corner Style:** 四组固定不规则圆角轮换。
- **Background:** 卡纸白为主，便利贴黄只用于备忘录和提醒。
- **Shadow Strategy:** 大卡使用纸卡硬阴影；排班表容器的网格内容不旋转。
- **Border:** 3px 墨线。

### Inputs / Fields

- **Style:** 卡纸白底、1–2px 规则墨线、系统 UI 字体。
- **Focus:** 3px 钢笔蓝外轮廓并保留可见偏移。
- **Error / Disabled:** 使用文字说明和状态色，不只改变透明度或颜色。

### Navigation

侧栏与管理标签均为语义化按钮；激活态用标记笔色或便利贴色并保留文字。移动端工具操作是可横向滚动的单行工具条，不新增隐藏式“更多”菜单。

### Schedule Grid

31 天主表、粘性表头、姓名列和拆分格保持规则几何与 0° 旋转。状态底色必须配深色文字或符号；只有 `.schedule-wrap` 可以水平滚动，页面根节点不可横向溢出。

### Dialogs

弹窗使用端正的卡纸表面、3px 墨线与可读标题关联；关闭控件为带可读名称的按钮。640px 以下接近全屏，移除大阴影和非必要装饰。

## Do's and Don'ts

### Do:

- **Do** 让纸张、墨线和文具色服务于可读层级。
- **Do** 为键盘焦点、粗指针和减少动效偏好提供完整状态。
- **Do** 保持排班表、粘性表头和拆分格精确对齐。

### Don't:

- **Don't** 使用噪点图、手绘 SVG、滤镜、`backdrop-filter` 或逐单元格硬阴影。
- **Don't** 让胶带、图钉或旋转遮挡交互区域。
- **Don't** 通过主题改动 `/api/*`、排班算法或既有 DOM ID/handler 契约。
