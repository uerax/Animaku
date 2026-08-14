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
    A modern anime streaming web client: pick your source and play based on custom rules,
    powered by <a href="https://bangumi.tv/">Bangumi</a> calendar & metadata,
    <b>Bilibili-standard high-precision danmaku</b>, <b>WebGPU Anime4K real-time upscaling</b>, and <b>smart OP/ED skip</b>.<br />
    Compatible with <a href="https://github.com/Predidit/KazumiRules">KazumiRules</a>, supporting multi-source search and rule store.
    Local history / follow list, dark glassmorphic aesthetics. Actively in development (～￣▽￣)～
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

| Capability | Description |
|------|------|
| **Metadata & Calendar** | Bangumi weekly schedule / global search / details / staff & episodes; optional Token sync |
| **Multi-Source Playback** | Compatible with Kazumi rules (XPath / API); multi-source concurrent search and fast road switching |
| **High-Precision Danmaku** | DanDanPlay + Bilibili dual-library aggregation; local XML import; microsecond clock interpolation, anti-chase collision allocator & heatmap |
| **Upscaling & Smart Play** | WebGPU real-time Anime4K upscaling (720p/1080p→4K), `bangumi-oped` smart OP/ED skip, M3U8 ad filter |
| **Zero-Server Data Storage** | History, settings, follow list and rules all reside in the browser locally; server persists zero user data |

## Supported environments

- **Browsers**: modern Chromium / Firefox / Safari (playback, HLS streaming, WebGPU hardware-accelerated upscaling)
- **Deployment (recommended)**: Docker / Compose single container — **Docker only, no Node / pnpm required**
- **Local production / development**: Node.js ≥ 20 (LTS recommended) + pnpm **9.15.0**

## ✨ Core Features

- 🎬 **Flagship Playback & Video Enhancement**
  - **Anime4K WebGPU Real-time Upscaling**: Leverages client-side GPU shaders for instant 2× texture reconstruction and line antialiasing up to 4K.
  - **Smart OP/ED Skip**: Integrates the `bangumi-oped` community database, marking glowing OP/ED segments on the timeline with seamless one-click skipping.
  - **Flexible Aspect Ratio**: Press `W` to switch between 16:9 (default), 4:3 (retro), Cover (fullscreen zoom), and Fill (stretch).
  - **All Formats & Drag-and-Drop**: Supports HLS (m3u8), MP4 online streams, and dragging local video files directly into the player.

- 💬 **Bilibili-Grade Danmaku Ecosystem**
  - **Dual-Platform Aggregation**: Matches DanDanPlay + Bilibili libraries, supports custom keywords, episode binding, and local XML import.
  - **Microsecond Clock Interpolation**: Extrapolated via `performance.now()`, delivering 120Hz/144Hz full-frame subpixel smoothness without staircase jitter.
  - **Anti-Chase & Layered Pipeline**: Lookahead collision detection allocator with atomic Z-index rendering (scroll < bottom subtitle < top pinned).
  - **Speed Adaptive Timeline**: Standard 7.5s physical screen duration; danmaku maintains a comfortable reading speed even at 0.5x or 2.0x playback.
  - **Danmaku Density Heatmap**: Dynamically draws a gradient heatmap wave on the seekbar for instant high-energy scene spotting.

- 🔍 **Multi-Source Aggregation & Ad Filtering**
  - **Custom Rule Engine**: Compatible with Kazumi rules (XPath/API), supports multi-source concurrent search and online rule store.
  - **M3U8 Intelligent Ad Filtering**: Multi-dimensional weighted scoring model accurately detects and removes interstitial ads.
  - **Direct Connect & Media Proxy**: Prefers direct browser CDN connection, with automatic fallback to transparent media proxy.

- 📅 **Broadcast Calendar & Watch Management**
  - **Daily Schedule**: Aggregates Bangumi weekly broadcast calendar with real-time airing times and episode status.
  - **Anime Wiki & Collections**: Official ratings, character cast, episode list, and 4-tier tracking (Wish/Watching/Watched/On Hold).

- 🎨 **Modern Design & Multi-Platform UX**
  - **Dark Glassmorphism**: Deep frosted glass aesthetic, with all popovers and sheets fully adapting to light/dark themes.
  - **Touch Gestures & Hotkeys**: Mobile double-tap play/pause, long-press 2.0x boost (smooth release recovery), seek HUD; full desktop hotkeys.

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
docker run --rm -p 8787:8787 --env-file .env -e PORT=8787 -e PUBLIC_PROXY=1 animaku
```

- Health check: `GET /api/health`
- `WEB_DIST=public` inside the image; process runs as non-root (`node`)
- `PUBLIC_PROXY` is **enabled by default** (public internet can pick sources / use proxy); set `0` to restrict to local network
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
pnpm typecheck     # repo-wide tsc
```

Running `pnpm dev` without `pnpm install` first will fail with `tsx` / `node_modules missing`.  
For everyday development use `pnpm dev`, not the production `start` command.

## Usage Guide

1. **Access the app**: Docker / local production at `http://localhost:$PORT` · development at `http://localhost:$WEB_DEV_PORT`
2. **Follow list**: Go to **Settings → Bangumi Token** (optional, for syncing Bangumi favorites)
3. **Rules**: Mainstream rules are built-in; install from **Rule Store** or import custom JSON
4. **Playback**: Click on a source in the anime detail page to search episodes (direct CDN with automatic media proxy fallback)
5. **Danmaku & Settings**: Control bar provides dedicated Danmaku Settings (`[Dan+Gear]`) and Danmaku Switch (`[Dan/Slash]`) icons

### Playback Hotkeys

| Key | Action |
|----|------|
| `Space` / `K` | Play / pause |
| `←` / `→` | Rewind 5s / Fast forward 5s |
| `↑` / `↓` | Volume ±5% |
| `F` | Toggle player fullscreen |
| `W` | Aspect ratio toggle (16:9 / 4:3 / Cover / Fill) |
| `D` | Toggle danmaku on/off |
| `Alt+M` | Open danmaku settings and search panel |
| `,` / `.` / `/` | Danmaku delay 0.5s / advance 0.5s / reset offset |
| `P` / `N` | Previous / next episode |
| Drag & Drop | Drag local videos (MP4/MKV/WebM) to play; drag `.xml` to import bilibili danmaku |

### Mobile Touch Gestures

* **Double Tap Anywhere**: Toggle Play / Pause
* **Long Press Screen**: Triggers `2.0X ⚡ Fast Speed`, smoothly restores speed upon release
* **Scrub Seekbar**: Displays real-time delta time HUD at the center of the screen (e.g. `+00:15 (08:30)`)

## Environment variables

See [.env.example](.env.example) for the fully commented list. Server loads from repo root and `apps/server`; Vite reads the same root `.env`.

### Common

| Variable | Default | Description |
|------|------|------|
| `PORT` / `HOST` | `8787` / `0.0.0.0` | API / production single-process listening |
| `WEB_DEV_PORT` / `WEB_HOST` | `5173` / code default `127.0.0.1` | **Local Vite only**; not used in Docker production |
| `DANDAN_APP_ID` / `DANDAN_APP_SECRET` | empty | When empty, built-in legacy client key is used |
| `BANGUMI_USER_AGENT` / `PRODUCT_USER_AGENT` | `animaku/0.1` | Upstream user agent |

### Footer / promo (optional, Vite `VITE_*`)

| Variable | Description |
|------|------|
| `VITE_GITHUB_URL` | Source URL (default `https://github.com/uerax/Animaku`); `owner/repo` also works |
| `VITE_MAINTAINER_NAME` / `VITE_MAINTAINER_URL` | Maintainer display name and homepage link |
| `VITE_HOMEPAGE_URL` / `VITE_CONTACT_EMAIL` | Extra homepage, contact email |
| `VITE_SITE_TAGLINE` / `VITE_FOOTER_NOTE` | Tagline and additional note |

See [.env.example](.env.example) for the full list.

### SEO (optional)

| Variable | Description |
|------|------|
| `SITE_URL` | Runtime public origin (no trailing slash), written into sitemap / robots `Sitemap:` |
| `VITE_SITE_URL` | Written into client at build time for canonical / `og:url` |

### Public / proxy access (important)

| Variable | Description |
|------|------|
| `PUBLIC_PROXY` | **Default `1`**: any client may use media proxy and rules. Set `0` for local / LAN only |
| `PROXY_TOKEN` | Optional; allows access via `X-Animaku-Proxy-Token` header or `?proxyToken=` |
| `CORS_ORIGINS` | Additional allowed browser origins (comma-separated); localhost always works |

## Q&A

<details>
<summary>User Q&A</summary>

#### Q: Why do a few anime contain ads?

A: This project does not insert ads. Source-side ads may come from m3u8 segments; enable **Ad Filtering** in settings (multi-dimensional weighted scoring model).

#### Q: Why is playback choppy after enabling upscaling?

A: Anime4K runs on browser **WebGPU**. If GPU load is high, select the **Efficiency** preset or use it on lower-resolution sources; disable if WebGPU is unsupported.

#### Q: Why can some sources be found but not played?

A: Web client has no WebView interception and relies on static extraction. Source anti-scraping blocks can be worked around by switching rules / roads, or accepting iframe degradation.

#### Q: Public URL opens but cannot search / play?

A: Check if `PUBLIC_PROXY` in `.env` is set to `0`. Default should be `1`.

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
