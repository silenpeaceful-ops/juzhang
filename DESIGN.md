---
name: 聚账
description: 白灰、简洁的个人消费账本
colors:
  primary: "#0068d9"
  primary-hover: "#005bbd"
  accent: "#eaf2fe"
  background: "#f5f5f7"
  card: "#fff"
  navigation: "#fbfbfc"
  secondary: "#ededf0"
  surface-secondary: "#f2f2f5"
  foreground: "#1d1d1f"
  ink-soft: "#4a4a4f"
  muted-foreground: "#636366"
  border: "#d9d9de"
  income: "#247a45"
  destructive: "#b42318"
  destructive-hover: "#941c13"
  danger-surface: "#fff0ee"
  danger-surface-hover: "#ffe1dc"
  outline-hover: "#f0f0f3"
  outline-hover-border: "#bfbfc6"
  review-surface: "#ececf0"
  selected-border: "#bed7fa"
  count-surface: "#e1e1e6"
  chart-bar: "#c6cbd3"
  chart-current: "#4b5666"
  chart-category-1: "#3f4a5a"
  chart-category-2: "#778394"
  chart-category-3: "#a7b0bd"
  chart-category-4: "#cbd0d8"
  chart-category-5: "#68717c"
  chart-category-6: "#9197a1"
typography:
  display:
    fontSize: "clamp(44px, 4.7vw, 60px)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-.035em"
  headline:
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-.025em"
  dialog:
    fontSize: "25px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-.025em"
  title:
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-.015em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"PingFang SC\", \"Helvetica Neue\", \"Microsoft YaHei\", sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontSize: "14px"
    fontWeight: 550
    lineHeight: 1.35
  label:
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  tag: "5px"
  inner: "8px"
  filter: "9px"
  control: "10px"
  stat: "14px"
  surface: "16px"
spacing:
  inline: "8px"
  compact: "12px"
  group: "16px"
  field: "20px"
  section: "24px"
  dialog: "28px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.card}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "11px 17px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "11px 17px"
  button-outline-hover:
    backgroundColor: "{colors.outline-hover}"
  button-danger:
    backgroundColor: "{colors.danger-surface}"
    textColor: "{colors.destructive}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "11px 17px"
  button-danger-hover:
    backgroundColor: "{colors.danger-surface-hover}"
  field:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
  navigation:
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.control}"
    padding: "0 14px"
  navigation-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.primary}"
  filter-chip:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.filter}"
    padding: "0 13px"
  filter-chip-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.primary}"
  panel:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.surface}"
    padding: "24px"
  transaction-row:
    textColor: "{colors.foreground}"
    padding: "18px 0"
---
# Design System: 聚账

## Overview

用户确认的方向是「苹果风格：白灰、简洁」。浅灰工作区承托白色内容面，系统字体和清楚的数字层级适合个人消费账本。已实现的界面以间距、对齐和中性色区分信息，用少量颜色表达操作与交易含义。操作蓝仅用于动作、选中与焦点，图表保持灰蓝色。

这份文档记录 `app/globals.css` 与 `app/ledger-client.tsx` 的实际设计。四页共用同一套控件与容器；手机以内容单列和底部导航为主，桌面保留侧栏。没有额外命名的视觉隐喻。

**Key Characteristics:**

- 白灰底色与白色分组容器。
- 系统字体、中文内容与等宽数字。
- 金额优先，辅助说明退后一级。
- 控件保留明确的焦点状态和足够的手机触点。

## Colors

主色是清晰的操作蓝，其余界面以中性色为主。前置 token 是颜色的规范来源；以下名称说明用途。

### Primary

- **操作蓝**（`primary`）：主按钮、文字动作、选中导航、选中筛选、开关和键盘焦点；悬停使用 `primary-hover`。
- **浅蓝选中面**（`accent`）：选中导航、待核对筛选和确认操作背景；选中筛选描边使用 `selected-border`。

### Neutral

- **工作区灰**（`background`）：页面底色与应用主题色。
- **内容白**（`card`）：卡片、输入和弹窗；**导航白灰**（`navigation`）：侧栏、顶栏和手机底栏。
- **控件灰**（`secondary`）与 **辅助面灰**（`surface-secondary`）：分段控制、图标底与说明面。
- **正文墨色**（`foreground`）、**次级墨色**（`ink-soft`）、**辅助灰**（`muted-foreground`）：金额和主标题、标签和说明、元信息的三级层次。
- **边界灰**（`border`）：输入描边、流水分隔与导航边界。容器在静止状态使用底色分组。
- `review-surface` 和 `count-surface` 仅用于待核对标记与小计数；`outline-hover` 与 `outline-hover-border` 属于次按钮悬停状态。

### Semantic colors

- **收入绿**（`income`）：收入金额与收入统计图标；不能替代普通选中状态。
- **删除红**（`destructive`）：删除动作、失败反馈和预算超额；删除确认悬停使用 `destructive-hover`。普通删除使用 `danger-surface`，悬停使用 `danger-surface-hover`。
- 支出趋势使用 `chart-bar` 与 `chart-current` 两档灰。分类圆环依次使用 `chart-category-1` 至 `chart-category-6`；预算常态使用 `chart-current`，超额使用 `destructive`。

**The 操作与含义 Rule.** 保持收入、删除与选中状态的颜色语义；不能依靠颜色单独表达状态，文字、金额符号或标签须同时存在。

## Typography

全界面使用 `body.fontFamily` 中的 Apple 系统字体栈，中文优先采用 PingFang SC；无独立展示字体或等宽字体。字号变化承担层级，金额、时间和百分比采用 `tabular-nums`。

### Hierarchy

- **Display**（`display`）：本月总支出。桌面为自适应字号；手机（≤760px）为 52px，小手机（≤420px）为 48px。
- **Headline**（`headline`）：页面标题；≤1000px 后为 30px。
- **Dialog**（`dialog`）：弹窗标题，保持与正文明显的层级差。
- **Title**（`title`）：普通分组标题；≤420px 后为 16px。接入引导等特定标题另有局部尺寸，不扩大为公共层级。
- **Body**（`body`）：默认正文 15px。清单正文为 14px、2 倍行高、最长 75ch；说明段落通常为 13px、1.8 倍行高。
- **Control**（`control`）：标准按钮 14px、550 字重。桌面字段 14px；手机字段为 16px，金额输入保留 44px。
- **Label**（`label`）：辅助信息以 12px 为下限，段落行高随实际上下文为 1.5–1.9；不用扩大字距的小型大写标签。

**The 数字清晰 Rule.** 金额、时间和百分比使用等宽数字；主金额保持深色与醒目的尺寸，来源和状态置于较低层级。

## Layout

默认桌面侧栏宽 232px，顶栏高 72px；内容最大宽 1184px，内边距 40px，分组间距取 `spacing.section`。概览主区与辅助区为 `minmax(0, 1fr) 290px`；趋势与分类为 1.2:1；每日清单与设置为主区加 326px。统计与渠道各为三列。

- **≤1200px**：侧栏缩为 208px，内容边距 28px，普通容器内边距 22px；概览辅助列 260px，每日设置列 300px，部分网格间距 20px。
- **≤1000px**：侧栏缩为 184px，内容边距 24px；统计改为两列，待核对统计占整行；概览上下分组、图表、每日清单和接入说明改为单列。
- **≤760px**：隐藏侧栏，顶栏改为 62px 的粘性栏；固定底部四项导航，每项最小 70×50px。内容左右边距 20px，底部预留 `90px + safe-area-inset-bottom`；分组间距改为 20px。统计保持两列，待核对占整行，渠道改为单列。预算概览隐藏，预算输入仍在每日清单设置中可用。
- **≤420px**：内容边距降至 16px，普通容器内边距降至 20px；流水改用更紧凑的列间距，保留金额与删除动作的独立位置。

手机流水将删除动作放在金额下方，待核对确认移到渠道图标下方；搜索独占工具栏首行，筛选可换行。长商户名与金额可换行；对话框在手机改为底部面板并考虑安全区。

**The 手机可操作 Rule.** 标准动作最小高度为 44px，表单输入最小高度为 46px；≤760px 的普通输入、选择和文本域使用 16px 字号。

## Elevation & Depth

普通卡片不使用阴影，以灰色工作区、白色容器和轻描边组织信息。阴影只存在于开关滑块、选中分段、提示条和弹窗：它们分别表达可移动的小部件、当前选项、暂时反馈与模态层。弹窗遮罩为半透明黑，避免把相同强度的浮层效果扩散到静止内容。

- **开关滑块**：`0 1px 3px #00000026`。
- **选中分段**：`0 2px 4px #0000000b`。
- **提示条**：`0 8px 26px #00000021`。
- **弹窗**：`0 20px 60px #00000025`。

普通按钮颜色过渡为 160ms ease-out，开关为 180ms ease-out，图表高度为 240ms ease-out；减少动态效果偏好下关闭过渡和动画。

**The 静止分组 Rule.** 普通内容容器保持平面；阴影只复用在已有的状态控件与浮层角色中。

## Shapes

标准按钮、导航与输入使用 `rounded.control`；容器与弹窗使用 `rounded.surface`。筛选使用 `rounded.filter`，标记使用 `rounded.tag`，分段内项使用 `rounded.inner`。开关和头像使用圆形，图表圆环沿用真实圆形；按钮没有额外胶囊化。

容器一般无描边，输入与次按钮使用 1px 边线；导入文件区使用虚线。手机弹窗仅上方两个角保留容器圆角，底边贴合屏幕。

## Components

### Buttons

清楚、紧凑且保留触点。标准按钮使用 `button-primary`、`button-outline` 或 `button-danger`，图标与文字间距 8px。次按钮用白色与灰描边；删除默认浅红面，确认删除改为实心删除红。悬停改变颜色，禁用时 opacity 为 0.45。按钮和链接的可见焦点为 3px 操作蓝描边、外移 3px。

### Inputs / Fields

白色字段与轻描边，沿用 `field`。文字和标签分开，字段组间距 20px，标签与字段间距 8px。输入焦点为 2px 操作蓝、外移 1px；搜索和金额复合输入将焦点放在整个容器上。文本域可纵向调整大小；手机普通字段使用 16px 字号。

### Navigation

桌面为有图标的纵向侧栏项，最小高度 48px；默认次级墨色，悬停控件灰，选中浅蓝面与操作蓝。手机改为底栏，图标在标签上方；选中仅改变图标和文字颜色。保持概览、账单、接入、每日清单四项。

### Chips / Tags

筛选为可点击的 `filter-chip`；选中同时改变背景、文字与边线。待核对标记和说明标签是辅助灰面，文字不低于 12px；不能将它们当作主按钮或新标题层级。

### Cards / Containers

白色、柔和圆角、无默认阴影；普通 `panel` 使用统一内边距与 17px 标题。金额卡、每日清单和渠道卡沿用相同材质，内部布局随信息量变化，不为每张卡新增颜色。

### Transaction rows

商户与来源在主列，金额右对齐，删除拥有独立触点。支出金额为深色，收入为收入绿，转账为辅助灰；待核对以文字标记并提供确认动作。最后一行不显示分隔线。手机删除在金额下方，保留金额与动作间的空间。

### Charts and settings

支出趋势采用中性柱形，当前日加深；分类圆环与图例使用六档有序灰蓝色，预算使用当前日的深灰，超额改为删除红。这些属于现有数据编码，不扩展为全界面装饰色。开关点击区域为 52×44px，视觉轨道高 30px；开启使用操作蓝，滑块横移 22px。

## Do's and Don'ts

### Do:

- **Do** 以白灰材质、间距和对齐建立分组。
- **Do** 保持金额、状态与来源的清晰层级，并使用等宽数字。
- **Do** 延续手机 16px 普通字段、至少 44px 动作与可见焦点。
- **Do** 用文字和控件状态同时说明颜色所表达的含义。

### Don't:

- **Don't** 为普通卡片增添浮层阴影或独立装饰色。
- **Don't** 把收入绿或删除红用于普通选中状态。
- **Don't** 将已有 12px 辅助文字继续缩小。
- **Don't** 让装饰标签、展示字体或渐变抢占金额与操作的层级。
