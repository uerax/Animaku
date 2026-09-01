<div align="center">

  <p><a href="README.md">简体中文</a> · <a href="README.en.md">English</a></p>

  <h1>Animaku</h1>

  <img src="apps/web/public/android-chrome-512x512.png" width="160" alt="Animaku logo" />

  <p>
    <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite 6" />
    <img src="https://img.shields.io/badge/Hono-API-E36002?style=for-the-badge&logo=hono&logoColor=white" alt="Hono API" />
    <img src="https://img.shields.io/badge/WebGPU-Anime4K-9cf?style=for-the-badge&logo=webgpu&logoColor=white" alt="WebGPU Anime4K" />
    <img src="https://img.shields.io/badge/AniBaka-anx--rule/2-10B981?style=for-the-badge" alt="AniBaka Rule" />
    <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker Ready" />
  </p>

  <p>
    A modern self-hosted anime streaming web client: out-of-the-box high quality 1080P original stream sources,
    powered by <a href="https://bangumi.tv/">Bangumi</a> broadcast calendar & wiki metadata,
    <b>flagship proprietary physical-clock danmaku engine</b>, <b>WebGPU Anime4K real-time 4K upscaling</b>,
    <b>smart OP/ED skip & community markers contribution</b>, <b>Bilibili-style anime recommendations</b>, and <b>desktop Widescreen mode</b>.<br />
    Supports dual rule ecosystems: <b>⭐ AniBaka (34+ modern direct sources)</b> and <b>📦 Kazumi</b>, with <b>HTML5 / touch drag-and-drop sorting</b> and <b>3-color glowing multi-source status board</b>.
    Ultra-fast SQLite multi-tier persistent caching, rate-limited anti-scraping, IndexNow real-time search indexing, 100% local privacy, and light/dark dual-theme glassmorphism. Actively in development (～￣▽￣)～
  </p>

  <p>
    <img
      src="docs/screenshots/watch-player.png"
      alt="Animaku player page: danmaku, widescreen mode, multi-source episode picker and recommendations"
      width="900"
    />
  </p>

</div>

## What is this

**Animaku** is a modern self-hosted anime client built as a **React 19 SPA + lightweight local Hono API**.

| Dimension | Description |
| :--- | :--- |
| **Broadcast & Wiki** | Bangumi weekly schedule / global search (mixed Anime + Live-Action / Cinema) / metadata / staff & episodes; optional Token sync |
| **Dual Rule Ecosystems** | Built-in 1080P MP4 direct streams; supports **AniBaka (`anx-rule/2` modern pipeline operator rules)** and **Kazumi legacy rules** with one-click install & update |
| **High-Precision Danmaku** | DanDanPlay + multi-source danmaku aggregation + local XML / Pakku import; pure physical clock + tiered drift filter + rVFC frame sync + seekbar heatmap |
| **Flagship Playback & Video** | WebGPU real-time Anime4K upscaling (720p/1080p→4K), `bangumi-oped` smart OP/ED skip with community contribution drawer, M3U8 multi-dimensional weighted ad filter |
| **Streaming UX & Design** | Bilibili-style 73.5%:26.5% golden ratio viewport, desktop "🖥️ Widescreen Mode" with single-screen conservation, 3-color glowing source board, smart recommendations |
| **Performance & Privacy** | SQLite native L1/L2 multi-tier persistent caching, 15s valid play statistics, micro-batched IP rate limiting, IndexNow search indexing; history & settings stored 100% locally |

## Supported environments

- **Browsers**: Modern Chromium-based browsers / Firefox / Safari (full support for playback, HLS streaming, WebGPU hardware-accelerated upscaling, and touch gestures)
- **Deployment (recommended)**: Docker / Docker Compose single container — **Docker only, no Node / pnpm required**
- **Local production / development**: Node.js ≥ 20 (LTS recommended) + pnpm **9.15.0**

## ✨ Core Features

- 🎬 **Flagship Playback Engine & Video Enhancement**
  - **Anime4K WebGPU Real-time Upscaling**: Leverages client GPU shaders for real-time 2× texture reconstruction and line antialiasing, elevating low-res anime to 4K crispness with Efficiency, Balanced, and Quality presets.
  - **Bilibili-Style Golden Viewport & Desktop Widescreen Mode**:
    - Desktop player bar integrates the display trinity: **"🖥️ Widescreen Mode"**, **"🔲 Web Fullscreen"**, and **"⛶ Native Fullscreen"**;
    - Widescreen spans 100% full-width header-to-controls, while standard mode matches Bilibili's **73.5% : 26.5% golden ratio** (dynamic `clamp(360px, 23vw, 420px)` sidebar);
    - Strictly adheres to **Single-Screen Conservation**: whether on a 13-inch laptop, 1080P, 2K, or 4K display, the player and controls fit 100% within the viewport with zero vertical scroll overflow; resets intelligently on anime switch.
  - **In-Place Seek State Machine & 4-Tier Event Interlock**: Decouples `playerKey` to eliminate violent DOM unmount/remount on late-hydrate history resume or episode switch; features authoritative duration resolver for 0ms instant playback.
  - **Safari / WebKit Native Optimization**:
    - Dynamically generates HTML5 `<source type="...">` to explicitly inject MIME hints, solving the WebKit AVFoundation bug where disguised `.mp3` 1080P MP4 streams were misclassified as audio-only blank screens;
    - 50ms micro-buffer optimistic playback eliminates MP4 gate double standards, preventing the 8-second hard-wait timeout caused by Safari energy-saving suspension.
  - **Smart OP/ED Skip & Open Source Contribution**:
    - Native integration with the `bangumi-oped` community database, displaying glowing OP/ED segments on the timeline with seamless one-click skipping;
    - Built-in **OP/ED Marker Drawer** supports high-precision timestamp tagging with one-click GitHub PR submission.
  - **Context Menu & Stats for Nerds**: Inspect real-time video/audio codecs, resolution, frame drop rate (FPS), buffer health, and chunk download bitrate; supports native screenshots, mirror flip, and Picture-in-Picture (PiP).
  - **0ms Instant Response & Aspect Ratio**: Zero click latency for instant play/pause; press `W` to cycle through 16:9 (default), 4:3 (retro), Cover, and Fill.

- 💬 **Proprietary High-Precision Physical-Clock Danmaku Engine**
  - **Multi-Platform Danmaku Aggregation**: Matches DanDanPlay and multi-source danmaku libraries, supports custom keywords, episode binding, and local XML / Pakku import.
  - **Pure Physical Clock + Tiered Drift Governance**: Displacements 100% driven by monotonic `performance.now()`, combined with Zero deadzone and EMA low-pass filtering to eliminate jitter and rubber-banding.
  - **rVFC Hardware Frame Sync**: Synchronizes frame presentation via `requestVideoFrameCallback`; equipped with 1:1 Retina offscreen glyph bitmap cache pool.
  - **3-State Danmaku Cycle & Denoising**: Toggle between "Full → Lite (xN deduplication) → Off" with hotkey `D`; drops excessive density to prevent screen overcrowding.
  - **Standard 7.5s Screen Crossing Time**: Standard physical flying duration with dynamic phase re-anchoring on playback rate change.
  - **Seekbar Danmaku Heatmap**: Dynamically renders blue-glowing density wave graphs on the progress bar for instant plot highlights.

- 🔌 **Dual Rule Ecosystems & Next-Gen Pipeline Engine (`anx-rule/2`)**
  - **AniBaka Pipeline Operator Interpreter**: Full support for 20+ core operators (Fetch, Follow, Template, Regex, Replace, Cheerio CSS, JSONPath, BaseN, AES-CBC/GCM, MD5, SHA1/SHA256, MacCMS/ECPlayer reverse decryption, multi-line episodes, and fallback branches).
  - **Built-in 1080P Direct Sources**: Ships with proprietary adapters including xifan-next, cycani, tvtfun, moonci, anime1, and omofun with 0 server proxy bandwidth consumption.
  - **Dual Rule Store Tabs**: Seamlessly switch between **⭐ AniBaka Rule Store (34+ modern direct sources)** and **📦 Kazumi Legacy Store** with favicons, rich feature badges, and one-click install/update.
  - **Visual Status Color & Badge System**:
    - Rule store visual cues: Emerald Green "Update", Neutral "Install", Muted Border "Installed";
    - Installed rules distinct badges: 🔵 **Built-in Direct**, 🟣 **Built-in Rule**, 🟢 **AniBaka**, 🟡 **Kazumi**, ⚪ **Custom**.
  - **HTML5 & Mobile Touch Drag-and-Drop Sorting**: Smooth drag glow effects, `⭐ Default Main Source` gold badge, iOS-style Switch toggles, and compact Pill indicators (40% height reduction).
  - **M3U8 Intelligent Ad Filtering**: Multi-dimensional weighted scoring model removes interstitial ads; hybrid mode passes through direct CDN segments.

- 📺 **Smart Playback Experience & Bilibili-Style Recommendations**
  - **Bilibili-Style Anime Recommendations (WatchRecommendations)**:
    - **Slot 0 Sequel Chain**: Sequential sequels and movies prioritized (marked 🟢`Sequel` / 🟣`Movie` / 🔵`Prequel`), with genuine metadata completion (year, rating, episodes) preventing fake "Airing" labels;
    - **Strict Country Tag Priority**: `Japan → China → Western → Korea` constraint + 2 thematic tags + multi-tier fallback, eliminating cross-country drift;
    - **Adaptive Multi-Quadrant Sampling Algorithm**: Broad cross-era exploration of 6.0~8.5 quality anime with dynamic 6-item fill;
    - **Bilibili-Standard 180×101 (16:9) Wide Posters**: Focused character closeups with one-click collapse/expand;
    - **Source Parameter Inheritance**: Clicking recommendations preserves the current active source (`?plugin=xxx`) with automatic first-visit search & episode selection.
  - **3-Color Glowing Status Board**: 🟢 Ready (pulsing green) / 🟡 Multi-match (amber accordion) / 🔴 Not found or error; 2-worker on-demand streaming probing pool with 100% session synchronization.
  - **Episode Experience Upgrades**: One-click force refresh (`onRefreshChapters`); 50-episode smart range tabs for long anime; forward/reverse sort; 5-column / 6-column episode grid.

- 📅 **Broadcast Calendar, Anime Wiki & Watch Tracking**
  - **Expanded Search Capabilities**: Seamlessly searches across Anime (type: 2) and Live-Action / Movies / TV Drama (type: 6).
  - **Multi-Section Home Exploration**: Continue Watching, Trending Anime, Anime Movies, OVA/Specials with 12-item auto-grid alignment.
  - **Daily Schedule**: Aggregates Bangumi weekly broadcast calendar with real-time airing times and episode status.
  - **Anime Wiki & Collections**: Official ratings, character cast, episode list, and 4-tier tracking (Wish/Watching/Watched/On Hold) with Bangumi Token authorization.

- ⚙️ **Modern Collapsible Settings Center & Multi-Device UX**
  - **Smart Collapsible Sections (CollapsibleSection)**: All 8 settings sections feature collapsed "Glanceable Status Chips" to view the entire configuration at zero clicks; includes one-click expand/collapse all and persistent state memory.
  - **Mobile Responsive Tuning**: Optimized for narrow screens (375px~430px), reclaiming 30px+ usable width with 2x2 touch-friendly danmaku toggles.
  - **Mobile Touch Gestures**: Double-tap anywhere to play/pause, long-press for 2.0x boost (smooth release recovery), seek delta HUD.
  - **Light/Dark Dual-Theme Glassmorphism**: Fresh Warm Slate light mode by default, and ColorsWall deep charcoal/cyan dark glassmorphic design system.

- 🚀 **Full-Stack Performance, Architecture & Security**
  - **SQLite L1+L2 Persistent Caching**: Server-side SQLite persistence with Single-Flight anti-stampede protection across search and chapters.
  - **Valid Playback Statistics (`anime_play_stats`)**: Reports after 15s of continuous play with 10-minute sliding window memory deduplication and atomic transactions.
  - **Global IP Access & Rate Limiting (`ip_access_logs`)**: `setImmediate` micro-batched writes (90% IO reduction), 1-second sliding window rate limits (standard API 30 req/s, heavy 10 req/s), auto-filtering loopback (`127.0.0.1`, `::1`) and health checks.
  - **IndexNow Search Engine Indexing**: Differential auto-submission to Bing, Yandex, Naver, with admin batch endpoints and `/subject/:id` lightweight server-side SSR prerendering.
  - **Full-Stack Route Preloading**: Idle preheating + mouse hover intent prefetching (`preloadRoute` / `preloadVideoPlayer`) + 24h server caching for instant page loads.

## Quick start

For most users, **installing Docker is all you need**; the pnpm instructions below are only for local production or development.

### One-click deployment with Docker (recommended)

```bash
git clone https://github.com/uerax/Animaku.git animaku
cd animaku

cp .env.example .env    # Adjust PORT, PUBLIC_PROXY, etc. as needed
docker compose up -d --build
```

Open **http://localhost:$PORT** in your browser (default `8787`).  
A single container serves both the SPA frontend and `/api/*` backend (same origin).

```bash
docker compose logs -f
docker compose down
```

```bash
# Without compose, single command
docker build -t animaku .
docker run -d --name animaku --restart unless-stopped -p 8787:8787 --env-file .env -v ./data:/app/data animaku
```

- **Health check**: `GET /api/health`
- **Data persistence**: SQLite database is stored in `/app/data` inside the container (mounted to `./data` on host)
- **Security & Proxy**: `PUBLIC_PROXY` is **enabled by default (1)**; on public servers, setting a `PROXY_TOKEN` is strongly recommended to protect outbound bandwidth
- **Footer customization**: `VITE_*` variables are build-time; changes require `docker compose up -d --build` to recompile

### Local Node production (no Docker)

A single process serves both `/api/*` and SPA static assets (same origin, no Vite proxy needed):

```bash
# Requires Node.js ≥ 20 + pnpm 9.15.0, run from the repo root
pnpm install
cp .env.example .env   # Adjust configuration
pnpm start:prod
# Equivalent to: pnpm build && pnpm start
```

Open **http://localhost:$PORT** in your browser (default `8787`).  
`WEB_DIST` can point to a static directory (relative to process cwd); locally omitted will auto-detect `public` / `apps/web/dist`.

### Local development (pnpm)

| Tool | Version |
| :--- | :--- |
| Node.js | ≥ 20 (LTS recommended) |
| pnpm | **9.15.0** (matches `packageManager` field) |

```bash
# Install pnpm (pick one)
npm install -g pnpm@9.15.0
# or: corepack enable && corepack prepare pnpm@9.15.0 --activate
```

Please run pnpm from the **repo root**; do not install dependencies directly with npm / yarn.

```bash
pnpm install
cp .env.example .env   # Adjust as needed

pnpm dev
```

| Process | Default address | Description |
| :--- | :--- | :--- |
| **Web (Vite)** | http://localhost:5173 (`WEB_DEV_PORT`) | **Open this in your browser for daily development** |
| **API (Hono)** | http://localhost:8787 (`PORT`) | Vite automatically proxies `/api` requests to it |

```bash
pnpm dev:web       # Frontend Vite only
pnpm dev:server    # Backend Hono only
pnpm typecheck     # Repo-wide TypeScript check
pnpm bump <ver>    # Semantic version bump (e.g. pnpm bump 1.1.3 or pnpm bump patch)
```

## Usage Guide

1. **Access**: Docker / local production at `http://localhost:$PORT` · development at `http://localhost:$WEB_DEV_PORT`
2. **Follow list**: Go to **Settings → Bangumi Account** (optional, enter Personal Access Token to sync collections)
3. **Rules**: High quality 1080P direct rules are built-in; go to **Settings → Rule Store** to install **AniBaka (34+ modern sources)** or **Kazumi rules**, or import custom JSON
4. **Playback**: Click any source on the detail page to search episodes (CDN direct connection by default)
5. **Widescreen & Danmaku**: Player bar provides one-click switching for "🖥️ Widescreen", "🔲 Web Fullscreen", and "⛶ Fullscreen", with dedicated icons for danmaku settings and 3-state toggle

### Playback Hotkeys

| Key | Action |
| :--- | :--- |
| `Space` / `K` | Play / pause (0ms instant response) |
| `←` / `→` | Rewind 5s / Fast forward 5s |
| `↑` / `↓` | Volume ±5% |
| `F` | Toggle player fullscreen |
| `Shift + W` | Toggle Web Fullscreen |
| `W` | Aspect ratio toggle (16:9 / 4:3 / Cover / Fill) |
| `D` | Danmaku 3-state cycle (Full → Lite xN deduplication → Off) |
| `Alt + M` | Open danmaku settings and search panel |
| `,` / `.` / `/` | Danmaku delay 0.5s / advance 0.5s / reset offset |
| `P` / `N` | Previous / next episode |
| Right Click | Open context menu (Stats for Nerds, Screenshot, Mirror, PiP, Speed, Anime4K upscaling) |
| Drag & Drop | Drag local videos (MP4/MKV/WebM) to play; drag `.xml` to import external / pakku danmaku |

### Mobile Touch Gestures

* **Double Tap Anywhere**: Toggle Play / Pause
* **Long Press Screen**: Triggers `2.0X ⚡ Fast Speed`, smoothly restores speed upon release
* **Scrub Seekbar**: Displays real-time delta time HUD at the center of the screen (e.g. `+00:15 (08:30)`)

## Environment Variables

See [.env.example](.env.example) for the fully commented list. Server loads from repo root and `apps/server`; Vite reads the same root `.env`.

### Core Base Configuration

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` / `HOST` | `8787` / `0.0.0.0` | API port / host binding (`0.0.0.0` public, `127.0.0.1` local/reverse-proxy only) |
| `DATA_DIR` / `SQLITE_PATH` | `./data` / `./data/animaku.db` | SQLite database persistence directory & file path |
| `WEB_DEV_PORT` / `WEB_HOST` | `5173` / `127.0.0.1` | **Local Vite only**; ignored in Docker production |
| `TZ` | `Asia/Shanghai` | Server log & daily reset timezone (IANA timezone strings) |
| `LOG_FORMAT` | `pretty` | Server log format: `pretty` (colorized single line) / `json` (single-line JSONL) |
| `DANDAN_APP_ID` / `DANDAN_APP_SECRET` | empty | When empty, built-in client keys are used |

### Public & Security Access

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PUBLIC_PROXY` | `1` | **Default `1`**: allows clients to use proxy and rules. Set `0` for local / LAN only |
| `PROXY_TOKEN` | empty | Admin proxy authorization token; unlock in settings or pass `X-Animaku-Proxy-Token` header |
| `ADMIN_SECRET` | empty | Admin secret for management endpoints (e.g. IndexNow manual push; falls back to `PROXY_TOKEN`) |
| `CORS_ORIGINS` | empty | Additional allowed browser origins (comma-separated); localhost always works |

### Bangumi & Cover Image Sources

| Variable | Default | Description |
| :--- | :--- | :--- |
| `BANGUMI_API` | `mirror` | Bangumi API source: `mirror` (proxy, default) / `official` (direct) / custom domain |
| `BANGUMI_IMAGE` | `mirror` | Anime cover image source: `mirror` (proxy, default) / `official` (direct) / custom domain |

### SEO, Sitemap & IndexNow

| Variable | Default | Description |
| :--- | :--- | :--- |
| `SITE_URL` | empty | Production public root URL (e.g. `https://anime.example.com`) for Sitemap & Canonical URLs |
| `VITE_SITE_URL` | empty | Frontend build-time root URL for OpenGraph meta tags |
| `INDEXNOW_ENABLED` | `0` | Enable IndexNow search engine instant indexing (`1` enable, `0` disable) |
| `INDEXNOW_KEY` | empty | IndexNow API Key (32-character hex string) |

### Footer Branding (Vite Build-time `VITE_*`)

Shown on non-watch pages. Changes require `pnpm build` or `docker compose up -d --build`.

| Variable | Description |
| :--- | :--- |
| `VITE_GITHUB_URL` | Source repository URL (default `https://github.com/uerax/Animaku`) |
| `VITE_MAINTAINER_NAME` / `VITE_MAINTAINER_URL` | Maintainer display name & profile URL |
| `VITE_HOMEPAGE_URL` / `VITE_CONTACT_EMAIL` | Extra homepage URL & contact email |
| `VITE_SITE_TAGLINE` / `VITE_FOOTER_NOTE` | Tagline and extra footer disclaimer note |

## Architecture & Maintenance Guides

For developers and production operators, Animaku provides comprehensive architecture and maintenance guides:

- 🗄️ [SQLite Database Maintenance & Docker Query Guide (`docs/database-maintenance.md`)](docs/database-maintenance.md): Schema dictionary, zero-install PV/stats queries via Docker, and timezone notes.
- 🛡️ [Cloudflare CDN, WAF Security & Edge Cache Guide (`docs/cloudflare-cdn-rules.md`)](docs/cloudflare-cdn-rules.md): DNS setup, industrial WAF expressions, multi-tier Cache Rules, and origin hardening.
- 🔌 [Video Source Integration & Adapter Guide (`docs/video-source-integration.md`)](docs/video-source-integration.md): Rule engine architecture, custom adapter SOP, versioning, and anti-hotlinking practices.
- ⚡ [Danmaku Rendering Engine Performance Report (`docs/danmaku-perf.md`)](docs/danmaku-perf.md): Physical clock algorithm, tiered drift filter, and rVFC benchmark analysis.

## Q&A

<details>
<summary><b>User Q&A</b></summary>

#### Q: Why do a few anime contain ads?

A: This project is 100% open source and will never insert ads. Source-side ads may come from third-party M3U8 segments; enable **Ad Filtering** in settings (multi-dimensional weighted scoring model). If the source lacks DISCONTINUITY tags or falls back to an iframe, it cannot be filtered.

#### Q: Why is playback choppy after enabling Anime4K upscaling?

A: Anime4K runs on browser **WebGPU** hardware compute shaders. If GPU load is high, select the **Efficiency** preset in the context menu or settings, or enable it only for 720P and lower resolutions; disable if WebGPU is unsupported.

#### Q: Why can some sources be found but not played?

A: Web clients are subject to browser CORS and anti-hotlinking restrictions and rely on static extraction. If a source encounters a Cloudflare challenge or captcha, switch to another available built-in or custom source in the status board.

#### Q: Public URL opens but cannot search or play?

A: Check if `PUBLIC_PROXY` in `.env` was set to `0` (default should be `1`). If `PROXY_TOKEN` is configured, enter the password in settings to unlock.

#### Q: Danmaku shows "Not Configured" or fails to load?

A: Leave `DANDAN_*` empty locally to use built-in keys. For production, registering an API key at [DanDanPlay Open Platform](https://www.dandanplay.com/) is recommended.

</details>

<details>
<summary><b>Ops & Dev Q&A</b></summary>

#### Q: Docker home page shows 404?

A: Ensure the image build includes the SPA compilation; `WEB_DIST=public`, and verify `GET /api/health` returns 200.

#### Q: How to persist and query database backups?

A: Server SQLite database is stored in `/app/data/animaku.db` inside the container (mounted to `./data` on the host). No SQLite CLI is required on the host; query directly via `docker compose exec animaku node -e '...'`, as detailed in [Database Maintenance Guide (docs/database-maintenance.md)](docs/database-maintenance.md).

#### Q: How to configure Cloudflare CDN acceleration and block malicious scans?

A: Animaku provides comprehensive WAF anti-scanning rules and multi-tier Edge Cache configurations in [Cloudflare CDN & WAF Rules Guide (docs/cloudflare-cdn-rules.md)](docs/cloudflare-cdn-rules.md).

#### Q: `pnpm: command not found` or `node_modules missing`?

A: Only local Node.js development requires pnpm. Install pnpm 9.15.0 and run `pnpm install` in the **repo root**. For deployment, Docker is recommended.

</details>

## Disclaimer

This software is provided "as is", without warranty of any kind. Use of this project must comply with local laws and regulations.

Default distribution only includes example rules; install additional sources from [AniBakaRule](https://github.com/AniBakaBaka/AniBakaRule) or [KazumiRules](https://github.com/Predidit/KazumiRules).

## Privacy

- **Zero Telemetry**: No user analytics or tracking SDKs.
- **Pure Local Storage**: Bangumi Token, rule JSON, history, and preferences are stored **strictly in browser local storage**.
- **Controlled Proxy**: Server proxies requests to third-party sources and CDNs only on user demand; `PUBLIC_PROXY` is on by default, with optional `PROXY_TOKEN` protection.

## Acknowledgements

Special thanks to the following open-source projects and platforms for their inspiration, algorithms, metadata, and ecosystem support:

- [AniBaka](https://github.com/AniBakaBaka/AniBaka) and [AniBakaRule](https://github.com/AniBakaBaka/AniBakaRule) — Modern pipeline rule engine (`anx-rule/2`) and high quality open source rule ecosystem.
- [Kazumi](https://github.com/Predidit/Kazumi) and [KazumiRules](https://github.com/Predidit/KazumiRules) — Rule models, source selection, and product design.
- [agefans-enhance](https://github.com/IronKinoko/agefans-enhance) and [@ironkinoko/danmaku](https://github.com/IronKinoko/danmaku) — Danmaku interaction and player UI.
- [Bangumi](https://bangumi.tv/) Open API — Comprehensive anime metadata and broadcast calendar.
- [DanDanPlay](https://www.dandanplay.com/) Open Platform — High-precision danmaku database.
- [Anime4K](https://github.com/bloc97/Anime4K) — Real-time anime video upscaling shaders.
- [bangumi-oped](https://github.com/uerax/bangumi-oped) — Open source anime OP/ED timestamp database.
- [hls.js](https://github.com/video-dev/hls.js/), [Hono](https://hono.dev/), [Vite](https://vitejs.dev/), and the [React](https://react.dev/) ecosystem.
