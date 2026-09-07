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
    A modern self-hosted anime streaming web client.<br />
    Comes with out-of-the-box 1080P original stream sources, natively integrated with <b>Bangumi broadcast calendar & wiki metadata</b>, 
    <b>smooth danmaku system</b>, <b>WebGPU real-time 4K upscaling</b>, <b>smart OP/ED skip</b>, 
    <b>desktop Widescreen mode</b>, and <b>anime recommendations</b>.<br />
    Supports <b>AniBaka & Kazumi dual rule ecosystems</b>, 100% local privacy, and light/dark glassmorphic design. Built for anime lovers.
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

**Animaku** is a modern self-hosted anime streaming web client built on **React 19 + lightweight Hono API**. You can deploy it on your personal NAS or a cloud VPS in seconds via Docker to enjoy a seamless, clean anime streaming experience.

| Dimension | Highlights |
| :--- | :--- |
| **🎬 Playback & Video** | Built-in 1080P direct streams, WebGPU 4K upscaling, smart OP/ED skip, M3U8 ad filter |
| **💬 Danmaku System** | DanDanPlay aggregation, local XML / Pakku import, anti-overlap noise reduction, high-energy heatmap |
| **🔌 Rules & Sources** | Supports **AniBaka (34+ modern direct sources)** and **Kazumi rules** with one-click install and live status board |
| **📅 Wiki & Tracking** | Bangumi weekly schedule, anime / cinema search, watchlist tracking with Bangumi Token sync |
| **🖥️ UX & Design** | Desktop Widescreen mode, recommendations, mobile touch gestures, light/dark dual-theme |
| **🔒 Privacy & Perf** | 100% stored locally in browser, zero tracking; ultra-lightweight memory footprint |

## ✨ Core Features

- 🎬 **Premium Playback & Visual Enhancement**
  - **Instant Playback**: Built-in 1080P original direct streams; client connects directly to CDN with minimal latency and zero proxy bandwidth overhead.
  - **WebGPU 4K Real-time Upscaling**: Leverages client GPU shaders via Anime4K to reconstruct anime line art in real time, elevating 720P/1080P anime to 4K clarity.
  - **Smart OP/ED Skip**: Native integration with community timestamps; automatically highlights intro/outro segments on the seekbar with seamless skipping.
  - **Clean & Ad-Free**: Built-in smart slice filter detects and removes 3rd-party inserted ad segments.
  - **Flexible Screen Modes**: Features **Widescreen Mode** (spans 100% width without vertical page scroll), **Web Fullscreen**, and **Full Screen**, supporting 16:9, 4:3, Cover, and Fill aspect ratios.
  - **Stats for Nerds**: Right-click to inspect real-time codecs, resolution, dropped frames, buffer health, and download rate; supports high-res screenshot capture, mirroring, and Picture-in-Picture.

- 💬 **Smooth Danmaku System**
  - **Multi-Source Aggregation**: Precise matching with DanDanPlay and other community danmaku databases.
  - **Local File Import**: Drag and drop external `.xml` or Pakku danmaku files directly into the player.
  - **Silky & Stable**: Monotonic time-driven scrolling eliminates jitter; includes density throttling and deduplication.
  - **High-Energy Heatmap**: Seekbar visually plots danmaku density waves so you never miss iconic scenes.

- 🔌 **Abundant Sources & Dual Rule Ecosystems**
  - **Dual Ecosystem Support**: One-click install from the **⭐ AniBaka Rule Repository (34+ modern direct sources)** or **📦 Kazumi Legacy Rules**, plus custom JSON rule imports.
  - **Intuitive Management**: Touch and mouse drag-and-drop rule reordering, primary source tagging, and colored state chips.
  - **Live Status Board**: 3-color indicator (🟢 Ready / 🟡 Standby / 🔴 Error) displays line availability at a glance.

- 📅 **Anime Wiki, Tracking & Recommendations**
  - **Daily Schedule**: Real-time sync with Bangumi weekly broadcast calendar to keep track of current season simulcasts.
  - **Comprehensive Search**: Mixed search across anime, movies, and live-action series with full staff, cast, and episode summaries.
  - **Watchlist Sync**: Mark anime as "Want to Watch / Watching / Watched" with optional Bangumi Token two-way progress synchronization.
  - **Smart Recommendations**: Curated sequels, movies, and top-rated similar titles directly beneath the player.

- 🖥️ **Modern Cross-Device Experience**
  - **Dual-Theme Design**: Warm Slate for daytime and deep charcoal glassmorphism for dark mode.
  - **Collapsible Settings**: Glanceable status chips display current configuration without unnecessary clicks.
  - **Mobile Touch Gestures**: Double-tap to play/pause, long-press for 2.0x turbo speed, and smooth horizontal slide to seek with time delta HUD.

- 🔒 **Private & Resource-Efficient**
  - **Zero Telemetry**: No tracking SDKs or commercial analytics. All history, bookmarks, and tokens stay in your browser.
  - **Ultra-Lightweight**: Minimal memory and CPU usage; runs effortlessly even on small 512MB RAM virtual machines.

## 🚀 Quick Start

Most users should deploy via **Docker Compose** without installing Node.js or build tools.

### Docker Deployment (Recommended)

```bash
# 1. Clone repository
git clone https://github.com/uerax/Animaku.git animaku
cd animaku

# 2. Configure environment
cp .env.example .env

# 3. Start container
docker compose up -d --build
```

Access the web interface at **`http://localhost:8787`**.

<details>
<summary><b>Additional Docker Commands</b></summary>

```bash
# View logs
docker compose logs -f

# Stop container
docker compose down

# Single command run (without docker compose)
docker build -t animaku .
docker run -d --name animaku --restart unless-stopped -p 8787:8787 --env-file .env -v ./data:/app/data animaku
```

- **Persistence**: Application data is saved in `./data` on the host.
- **Public Security**: If exposed to the internet, set `PROXY_TOKEN` in `.env` to protect VPS egress traffic.
</details>

---

### Local Development

For developers interested in contributing:

```bash
# Requirements: Node.js ≥ 20, pnpm 9.15.0 recommended
pnpm install
cp .env.example .env

# Start dev servers (Vite 5173 + Hono API 8787)
pnpm dev
```

Open `http://localhost:5173` in your browser.

## 🎮 Controls & Shortcuts

### Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Space` / `K` | Play / Pause |
| `←` / `→` | Seek backward 5s / forward 5s |
| `↑` / `↓` | Volume ±5% |
| `F` | Toggle player fullscreen |
| `Shift + W` | Toggle Web Fullscreen |
| `W` | Cycle aspect ratios (16:9 / 4:3 / Cover / Fill) |
| `D` | Cycle danmaku (On → Throttled → Off) |
| `Alt + M` | Open danmaku settings panel |
| `,` / `.` / `/` | Delay danmaku 0.5s / Advance 0.5s / Reset offset |
| `P` / `N` | Previous / Next episode |
| `Right Click` | Open contextual menu (Stats for Nerds / Screenshot / Mirror / PiP / Upscaling) |
| Drag & Drop | Drop video file (MP4/MKV/WebM) to play; drop `.xml` to load danmaku |

### Mobile Gestures

* **Double-tap**: Play / Pause
* **Long-press**: `2.0X ⚡` Turbo speed (restores upon release)
* **Horizontal swipe**: Seek with center HUD time delta display

## ⚙️ Key Environment Variables

For full configuration options, lifecycle semantics, and production presets, refer to 📖 **[Configuration Guide Wiki (`docs/wiki/Configuration-Guide.md`)](docs/wiki/Configuration-Guide.md)** and [.env.example](.env.example).

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `8787` | Service and Web access port |
| `HOST` | `0.0.0.0` | Listen host (`0.0.0.0` allows LAN/public, `127.0.0.1` restricts to localhost) |
| `DATA_DIR` | `./data` | Persistent SQLite storage directory |
| `PUBLIC_PROXY` | `1` | Allows client media proxying; set to `0` to allow local-only |
| `PROXY_TOKEN` | Empty | Auth token for proxy egress; unlockable in Web settings |
| `BANGUMI_API` | `mirror` | Bangumi API route (`mirror` proxy / `official` direct) |
| `BANGUMI_IMAGE` | `mirror` | Anime cover route (`mirror` proxy / `official` direct) |

## 📚 Technical & Architecture Guides

Deep technical designs and deployment playbooks are maintained in dedicated guides:

- ⚙️ [Configuration Options Guide Wiki (`docs/wiki/Configuration-Guide.md`)](docs/wiki/Configuration-Guide.md): Exhaustive environment dictionary, runtime vs. build-time lifecycles, security best practices, and templates.
- 🏛️ [System Architecture & Core Design (`docs/architecture.md`)](docs/architecture.md): In-place state machine, danmaku physical engine, pipeline rule models, and high-concurrency server architecture.
- ⚡ [Danmaku Performance Benchmark (`docs/danmaku-perf.md`)](docs/danmaku-perf.md): Clock drift filters and rVFC hardware frame sync benchmarks.
- 🔌 [Video Source Integration Guide (`docs/video-source-integration.md`)](docs/video-source-integration.md): Rule engine SOP, proprietary adapters, and anti-scraping guidelines.
- 🛡️ [Cloudflare CDN & WAF Rules (`docs/cloudflare-cdn-rules.md`)](docs/cloudflare-cdn-rules.md): Edge caching strategies, WAF rule expressions, and origin security.
- 🗄️ [Database Maintenance & Schema (`docs/database-maintenance.md`)](docs/database-maintenance.md): Table schemas and CLI-free query instructions via Docker.

## ❓ FAQ

<details>
<summary><b>Why do some anime episodes contain ads?</b></summary>
Animaku is open-source and contains zero ads. Ads originate from third-party source streams. You can enable "Ad Filter" in settings. If an ad slice is obfuscated by the provider, switch to another video source in the player sidebar.
</details>

<details>
<summary><b>Why does playback stutter with Anime4K enabled?</b></summary>
Anime4K relies on WebGPU shaders running on your local graphics card. If your GPU load is high, switch to the "Efficiency" preset in settings or right-click menu, or only enable it for 720P and lower resolutions.
</details>

<details>
<summary><b>Can access the site on public IP but cannot stream or pick sources?</b></summary>
Ensure `PUBLIC_PROXY` is set to `1` in `.env`. If `PROXY_TOKEN` is configured, enter the token in the web Settings page to unlock streaming.
</details>

<details>
<summary><b>Danmaku shows "Not configured" or fails to load?</b></summary>
By default, the client uses a shared built-in key. For maximum stability, register a free key on the [DanDanPlay Open Platform](https://www.dandanplay.com/) and configure it in `.env`.
</details>

## License & Acknowledgements

### Disclaimer
This software is provided "as is" for learning, personal self-hosting, and educational purposes. Animaku does not host or distribute any video media. All content is indexed from third-party public sources. Users are responsible for complying with applicable local laws and intellectual property rights.

### Privacy Protection
* **Zero Telemetry**: No usage analytics or commercial tracking scripts.
* **Local Storage**: All history, favorites, and settings remain 100% in your browser (`localStorage`).

### Acknowledgements
* [AniBaka](https://github.com/AniBakaBaka/AniBaka) & [AniBakaRule](https://github.com/AniBakaBaka/AniBakaRule)
* [Kazumi](https://github.com/Predidit/Kazumi) & [KazumiRules](https://github.com/Predidit/KazumiRules)
* [Bangumi 番组计划](https://bangumi.tv/)
* [弹弹play](https://www.dandanplay.com/)
* [Anime4K](https://github.com/bloc97/Anime4K)
* [bangumi-oped](https://github.com/uerax/bangumi-oped)
