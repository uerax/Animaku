<div align="center">

  <p><a href="README.md">简体中文</a> · <a href="README.en.md">English</a></p>

  <h1>Animaku</h1>

  <img src="apps/web/public/android-chrome-512x512.png" width="160" alt="Animaku logo" />

  <p>
    <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
    <img src="https://img.shields.io/badge/Hono-API-E36002?style=for-the-badge&logo=hono&logoColor=white" alt="Hono" />
    <img src="https://img.shields.io/badge/WebGPU-Anime4K-9cf?style=for-the-badge&logo=webgpu&logoColor=white" alt="WebGPU" />
    <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  </p>

  <p>
    A modern self-hosted anime streaming web client: out-of-the-box high quality 1080P original stream sources,
    powered by <a href="https://bangumi.tv/">Bangumi</a> broadcast calendar & metadata,
    <b>Bilibili-grade proprietary high-precision danmaku engine</b>, <b>WebGPU Anime4K real-time upscaling</b>,
    <b>smart OP/ED skip</b>, and <b>Stats for Nerds HUD</b>.<br />
    Compatible with <a href="https://github.com/Predidit/KazumiRules">KazumiRules</a>, supporting multi-source concurrent search and rule store.
    Ultra-fast SQLite multi-tier persistent caching, pure local data storage, and light/dark dual-theme glassmorphism. Actively in development (～￣▽￣)～
  </p>

  <p>
    <img
      src="docs/screenshots/watch-player.png"
      alt="Animaku player page: danmaku, multi-source episode picker and player controls"
      width="900"
    />
  </p>

</div>

## What is this

**Animaku** is a modern self-hosted anime client built as a **React 19 SPA + lightweight local Hono API**.

| Dimension | Description |
|------|------|
| **Metadata & Calendar** | Bangumi weekly schedule / global search / details / staff & episodes; optional Token sync |
| **Multi-Source Playback** | Built-in TvTFun / Cycani / xifan-next 1080P streams; compatible with KazumiRules ecosystem |
| **Bilibili-Grade Danmaku** | DanDanPlay + Bilibili dual-library aggregation; physical clock + tiered drift filter + rVFC frame sync + heatmap |
| **Upscaling & Video Tech** | WebGPU real-time Anime4K upscaling (720p/1080p→4K), `bangumi-oped` smart OP/ED skip, M3U8 ad filter |
| **Streaming UX** | 3-color status source board, 50-episode pagination tabs, forward/reverse sort, one-click refresh, Stats for Nerds |
| **Speed & Local Privacy** | SQLite L1/L2 multi-tier persistent caching & Single-Flight concurrency; history/settings/rules stored 100% locally |

## Supported environments

- **Browsers**: modern Chromium / Firefox / Safari (playback, HLS streaming, WebGPU hardware-accelerated upscaling)
- **Deployment (recommended)**: Docker / Compose single container — **Docker only, no Node / pnpm required**
- **Local production / development**: Node.js ≥ 20 (LTS recommended) + pnpm **9.15.0**

## ✨ Core Features

- 🎬 **Flagship Playback & Video Enhancement**
  - **Anime4K WebGPU Real-time Upscaling**: Leverages client-side GPU shaders for instant 2× texture reconstruction and line antialiasing up to 4K.
  - **Smart OP/ED Skip**: Integrates the `bangumi-oped` community database, marking glowing OP/ED segments on the timeline with seamless one-click skipping.
  - **Context Menu & Stats for Nerds**: Right-click to inspect real-time resolution, frame drop rate (FPS), buffer health, bitrate; supports screenshot, mirror flip, and PiP.
  - **0ms Instant Response & Aspect Ratio**: Zero click latency for instant play/pause; press `W` to cycle through 16:9 (default), 4:3 (retro), Cover, and Fill.
  - **Web Fullscreen & Fullscreen**: Press `Shift+W` for Web Fullscreen (maximized viewport with page controls) and `F` for Native Fullscreen.

- 💬 **Bilibili-Grade Proprietary Danmaku Engine**
  - **Multi-Platform Aggregation**: Matches DanDanPlay + Bilibili libraries, supports custom keywords, episode binding, and local XML import.
  - **Pure Physical Clock + Tiered Drift Governance**: Displacements 100% driven by monotonic `performance.now()`, combined with Zero deadzone and EMA low-pass filter to eliminate jitter and rubber-banding.
  - **rVFC Hardware Frame Sync**: Synchronizes frame presentation via `requestVideoFrameCallback`; equipped with 1:1 Retina offscreen glyph bitmap cache pool.
  - **3-State Danmaku Cycle & Denoising**: Toggle between "Full → Lite (xN deduplication) → Off" with hotkey `D`; drops excessive density to prevent screen overcrowding.
  - **Standard 7.5s Screen Crossing Time**: Standard physical flying duration with dynamic phase re-anchoring on playback rate change.
  - **Seekbar Danmaku Heatmap**: Dynamically renders high-energy density wave graphs on the progress bar.

- 🔍 **Multi-Source Aggregation & Smart Streaming**
  - **Built-in 1080P Direct Sources**: Ships with TvTFun, Cycani, xifan-next 1080P MP4 direct streams with 0 server proxy bandwidth consumption.
  - **3-Color Glowing Status Board**: 🟢 Ready (pulsing green) / 🟡 Multi-match (amber accordion) / 🔴 Timeout or not found; 2-worker on-demand streaming probing pool.
  - **Episode Experience Upgrades**: One-click force refresh (`onRefreshChapters`); 50-episode smart range tabs for long anime; forward/reverse sort.
  - **Episode Normalization & Resume Inheritance**: Automatically aligns episode numbers and resumes playback second when switching between sources.
  - **M3U8 Intelligent Ad Filtering**: Multi-dimensional weighted scoring model removes interstitial ads; hybrid mode passes through direct CDN segments.
  - **SQLite L1+L2 Persistent Caching**: Server-side SQLite persistence with Single-Flight anti-stampede protection across search and chapters.

- 📅 **Broadcast Calendar & Watch Management**
  - **Multi-Section Home Exploration**: Continue Watching, Trending Anime, Anime Movies, OVA/Specials with 12-item auto-grid alignment.
  - **Daily Schedule**: Aggregates Bangumi weekly broadcast calendar with real-time airing times and episode status.
  - **Anime Wiki & Collections**: Official ratings, character cast, episode list, and 4-tier tracking (Wish/Watching/Watched/On Hold).

- 🎨 **Modern Aesthetics & Multi-Platform UX**
  - **Light/Dark Dual-Theme Glassmorphism**: Fresh Warm Slate light mode by default, and ColorsWall deep charcoal/cyan dark glassmorphic design system.
  - **Mobile Touch Gestures**: Double-tap anywhere to play/pause, long-press for 2.0x boost (smooth release recovery), seek delta HUD.

## Quick start

For most users, **installing Docker is all you need**; the pnpm instructions below are only for local production or development.

### One-click deployment with Docker (recommended)

```bash
git clone https://github.com/uerax/Animaku.git animaku
cd animaku

cp .env.example .env    # adjust PORT, PUBLIC_PROXY, etc. as needed
docker compose up -d --build
```

Open **http://localhost:$PORT** in your browser (default `8787`).  
A single container serves both the SPA and `/api/*` (same origin).

```bash
docker compose logs -f
docker compose down
```

```bash
# without compose
docker build -t animaku .
docker run --rm -p 8787:8787 --env-file .env -e PORT=8787 -e PUBLIC_PROXY=1 -v ./data:/app/data animaku
```

- Health check: `GET /api/health`
- `WEB_DIST=public` inside the image; process runs as non-root (`node`)
- Data persistence: SQLite cache database is stored in `./data`
- `PUBLIC_PROXY` is **enabled by default**; set `0` to restrict to local network
- `VITE_*` footer variables are build-time: changes require `docker compose up -d --build` to take effect

### Local Node production (no Docker)

A single process serves both `/api/*` and the SPA (same origin, no Vite proxy needed):

```bash
# Requires Node ≥ 20 + pnpm 9.15.0, run from the repo root
pnpm install
cp .env.example .env   # adjust as needed
pnpm start:prod
# equivalent: pnpm build && pnpm start
```

Open **http://localhost:$PORT** in your browser (default `8787`).  
`WEB_DIST` can point to a static directory (relative to process cwd); locally it may be omitted — `public` / `apps/web/dist` etc. are auto-detected.

### Local development (pnpm)

| Tool | Version |
|------|------|
| Node.js | ≥ 20 (LTS recommended) |
| pnpm | **9.15.0** (matches `packageManager` field) |

```bash
# Install pnpm (pick one)
npm install -g pnpm@9.15.0
# or: corepack enable && corepack prepare pnpm@9.15.0 --activate
```

Use pnpm from the **repo root**; do not install dependencies directly with npm / yarn.

```bash
pnpm install
cp .env.example .env   # adjust as needed

pnpm dev
```

| Process | Default address | Description |
|------|----------|------|
| Web (Vite) | http://localhost:5173 (`WEB_DEV_PORT`) | **Only open this in your browser** |
| API (Hono) | http://localhost:8787 (`PORT`) | Vite proxies `/api` to it |

```bash
pnpm dev:web       # frontend only
pnpm dev:server    # backend only
pnpm typecheck     # repo-wide tsc check
pnpm bump <ver>    # one-click semantic version bump across monorepo (e.g. pnpm bump 1.1.2)
```

## Usage Guide

1. **Access the app**: Docker / local production at `http://localhost:$PORT` · development at `http://localhost:$WEB_DEV_PORT`
2. **Follow list**: Go to **Settings → Bangumi Token** (optional, for syncing Bangumi favorites)
3. **Rules**: High quality mainstream rules are built-in; install from **Rule Store** or import custom JSON
4. **Playback**: Click on a source in the anime detail page to search episodes (1080P CDN direct connect)
5. **Danmaku & Settings**: Control bar provides dedicated Danmaku Settings (`[Dan+Gear]`) and Danmaku 3-State Switch (`[Dan/Slash]`) icons

### Playback Hotkeys

| Key | Action |
|----|------|
| `Space` / `K` | Play / pause (0ms instant response) |
| `←` / `→` | Rewind 5s / Fast forward 5s |
| `↑` / `↓` | Volume ±5% |
| `F` | Toggle player fullscreen |
| `Shift + W` | Toggle Web Fullscreen |
| `W` | Aspect ratio toggle (16:9 / 4:3 / Cover / Fill) |
| `D` | Danmaku 3-state cycle (Full → Lite → Off) |
| `Alt + M` | Open danmaku settings and search panel |
| `,` / `.` / `/` | Danmaku delay 0.5s / advance 0.5s / reset offset |
| `P` / `N` | Previous / next episode |
| Right Click | Open player context menu (Stats for Nerds, Screenshot, Mirror, PiP, Speed, Anime4K) |
| Drag & Drop | Drag local videos (MP4/MKV/WebM) to play; drag `.xml` to import bilibili danmaku |

### Mobile Touch Gestures

* **Double Tap Anywhere**: Toggle Play / Pause
* **Long Press Screen**: Triggers `2.0X ⚡ Fast Speed`, smoothly restores speed upon release
* **Scrub Seekbar**: Displays real-time delta time HUD at the center of the screen (e.g. `+00:15 (08:30)`)

## Environment variables

See [.env.example](.env.example) for the fully commented list. Server loads from repo root and `apps/server`; Vite reads the same root `.env`.

### Common Variables

| Variable | Default | Description |
|------|------|------|
| `PORT` / `HOST` | `8787` / `0.0.0.0` | API / production single-process listening |
| `WEB_DEV_PORT` / `WEB_HOST` | `5173` / `127.0.0.1` | **Local Vite only**; not used in Docker production |
| `DANDAN_APP_ID` / `DANDAN_APP_SECRET` | empty | When empty, built-in legacy client key is used |
| `BANGUMI_USER_AGENT` / `PRODUCT_USER_AGENT` | auto | Upstream API user agent |

### Public & Security Access

| Variable | Default | Description |
|------|------|------|
| `PUBLIC_PROXY` | `1` | **Default `1`**: allows clients to use proxy and rules. Set `0` for local / LAN only |
| `PROXY_TOKEN` | empty | Optional proxy password; unlock in settings or pass `X-Animaku-Proxy-Token` header |
| `CORS_ORIGINS` | empty | Additional allowed browser origins (comma-separated); localhost always works |

## Q&A

<details>
<summary>User Q&A</summary>

#### Q: Why do a few anime contain ads?

A: This project does not insert ads. Source-side ads may come from m3u8 segments; enable **Ad Filtering** in settings (multi-dimensional weighted scoring model).

#### Q: Why is playback choppy after enabling upscaling?

A: Anime4K runs on browser **WebGPU**. If GPU load is high, select the **Efficiency** preset in the context menu or settings; disable if WebGPU is unsupported.

#### Q: Why can some sources be found but not played?

A: Web client has no native WebView interception and relies on static extraction. If a source fails, simply switch to another high-quality built-in source (e.g. TvTFun, Cycani, xifan-next).

#### Q: Public URL opens but cannot search / play?

A: Check if `PUBLIC_PROXY` in `.env` is set to `0`. Default should be `1`. If `PROXY_TOKEN` is set, enter the password in settings to unlock.

#### Q: Danmaku shows "Not Configured"?

A: Leave `DANDAN_*` empty locally to use built-in keys. For production, registering an API key at [DanDanPlay Open Platform](https://www.dandanplay.com/) is recommended.

</details>

<details>
<summary>Ops & Dev Q&A</summary>

#### Q: Docker home page shows 404?

A: Ensure the image build includes the SPA; `WEB_DIST=public`, and verify `GET /api/health` returns 200.

#### Q: How to persist and backup data?

A: Server SQLite database is stored in `/app/data`. Mount `-v ./data:/app/data` when deploying with Docker.

#### Q: `pnpm: command not found` / `node_modules missing`?

A: Only local Node / development requires pnpm. Install pnpm 9.15.0 and run `pnpm install` in the **repo root**.

</details>

## Disclaimer

This software is provided "as is", without warranty of any kind. Use of this project must comply with local laws and regulations.

## Privacy

- No user telemetry; no analytics SDKs.
- Bangumi Token, rule JSON, history and settings are stored **only in browser local storage**.
- Server proxies requests according to user rules; please manage egress access appropriately.

## Acknowledgements

Special thanks to [Kazumi](https://github.com/Predidit/Kazumi) and [KazumiRules](https://github.com/Predidit/KazumiRules).

Special thanks to [agefans-enhance](https://github.com/IronKinoko/agefans-enhance) and [@ironkinoko/danmaku](https://github.com/IronKinoko/danmaku).

Special thanks to [DanDanPlay](https://www.dandanplay.com/) open platform.

Special thanks to [Bangumi](https://bangumi.tv/) open API.

Special thanks to [Anime4K](https://github.com/bloc97/Anime4K).

Special thanks to [bangumi-oped](https://github.com/uerax/bangumi-oped).

Thanks to [hls.js](https://github.com/video-dev/hls.js/), [Hono](https://hono.dev/), [Vite](https://vitejs.dev/), React ecosystem, and all contributors.
