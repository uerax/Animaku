# TODO

## 视频源体系架构重构与流媒体级交互体验升级

### 1. 核心设计原则
- [x] **起播零等待**：默认仅请求首个高权重源（如稀饭 Next），毫秒级起播；正常播放期间对其他源 0 网络请求。
- [x] **按需流式探测**：仅当用户展开/操作视频源面板时，启动 2 并发轻量池流式探活各备用源（3s 熔断），各源独立返回、谁好谁先亮、用户点击即刻插队抢占。
- [x] **杜绝 429 风控**：规则静态化特性声明 + 宽词搜索 + 本地内存精筛打分，单个源单次请求即命中。
- [x] **条目绑定持久化**：客户端存储 `BangumiID <-> 目标源详情页` 映射（Zustand + `localStorage` + 1000条 LRU，~150KB），切源 0ms 直达跳过搜索。
- [x] **集数智能归一化与跨源进度继承**：切源时自动对齐第 N 集与当前播放秒数，告别手动重找。
- [x] **UI 纯粹自由 + 底层静默防污染**：用户可自由手动搜词，UI 零警告，弹幕不干预；相似度 $\ge 0.50$ 静默持久化，$< 0.50$ 仅作为当前内存临时播放，绝不污染长期数据。
- [x] **故障自愈（Self-Healing）**：持久化链接遇 404/失效时，静默清除旧绑定并穿透回源单次重搜。

---

### 2. UI / UX 视觉设计（对标 Netflix / Apple TV+ / Bilibili 主流流媒体美学）
- [x] **Dark Glassmorphism 暗场微光琉璃质感**：
  - 视频源面板采用 `bg-[#0f141e]/90` 深度暗场背景 + `border-white/10` 细微发光边框 + `backdrop-blur-xl` 磨砂玻璃质感；
  - 容器阴影采用弥散式软阴影（`shadow-2xl shadow-black/60`），与播放器暗场无缝融合。
- [x] **流媒体级三色动态微光状态指示器（Glowing Status Pill）**：
  - 🟢 **Emerald 极速就绪**：翠绿色呼吸微光圆点（`animate-pulse`）+ `全 12 话 · 1080P` + 右侧天青色 Accent「一键切换」胶囊；
  - 🟡 **Amber 待选条目**：琥珀黄状态点 + `搜到 2 条 · 点击选择` + 折叠式平滑展开条目卡片；
  - 🔴 **Rose / Slate 异常或未收录**：暗红/灰雾微光点 + `源站超时 (3s)` 或 `该源未收录此番剧`，低对比度灰显避免视觉噪音。
- [x] **卡片微交互动效**：
  - 悬浮时微位移与边框发光（`hover:border-sky-500/30 hover:bg-white/[0.04] transition-all duration-200`）；
  - 当前激活源带有天青色流光指示条与加粗高亮；
  - 切换源瞬间弹出流媒体风格的轻量半透明 HUD 胶囊提示（`已切换至 LIBVIO · 第 5 集 08:30`）。
- [x] **无感知骨架屏与过渡调度**：
  - 展开源面板时，未就绪源展示柔和的 Shimmer 骨架动画，配合 React 19 `startTransition` 保证 120Hz 丝滑交互。

---

### 3. 工程落地路线图 (Roadmap)

#### 阶段 1：数据持久化、集数对齐与切源继承（P0）
- [x] 在 `packages/shared/src/` 中实现 `parseEpisodeNumber(rawTitle)` 集数提取归一化算法；
- [x] 在 `apps/web/src/stores/` 中创建 `useSourceBindingStore`（支持 1000 条 LRU 淘汰与安全门禁）；
- [x] 重构 `use-watch-session.ts` 切源逻辑：通过 `SourceBindingStore` 实现 0ms 直达，并自动对齐当前 `episode` 与 `resumePosition`。

#### 阶段 2：按需流式聚合器与 3 色 UI 看板（P1）
- [x] 实现 `useSourceAggregator`（展开视频源面板时触发 2 并发流式探测 + 3s 超时熔断 + 用户点击插队抢占）；
- [x] 重构 `WatchPage` / `DesktopWatchLayout` 视频源列表为三色状态流媒体看板；
- [x] 接入跨源无缝切源 HUD 提示。

#### 阶段 3：故障自愈闭环与规则预处理完善（P2）
- [x] 完善 404 / 502 / 空分集时的静默自愈重搜机制；
- [x] 在内置源规则 JSON 中补齐简繁转换与特殊符号预处理声明。

---

## 历史完成记录

### [2026-08-18] 视频源关键字搜索偏好（日语标题优先）
- [x] 为 `apps/web/src/data/default-plugins/` 下对日语标题友好的三个源 JSON 加偏好字段：`xifan-next.json`、`libvio.json`、`omofun.json`；其余源维持中文名优先
- [x] 封装 `resolvePluginDefaultKeyword` 通用函数并在 `use-watch-session.ts` 中实现多源动态关键词与源级独立记忆
