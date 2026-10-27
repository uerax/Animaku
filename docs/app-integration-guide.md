# Animaku 原生 App 客户端全链路接入协议与 API 手册

> **阅读对象提示**：本文档专门面向**负责开发 Animaku 移动端/桌面端客户端（Flutter / 原生 Android / iOS 等）的大语言模型（LLM）与架构工程师**。
> 文档涵盖：客户端架构原则（零带宽直连）、官方受控源与规则引擎双模式、视频解析协议（含直链、Headers、统一字幕与字体包 Schema）、主流原生播放器内核（Flutter `media_kit`、Android `Media3`、iOS `AVPlayer` 等）的请求头注入与 ASS/VTT 外挂字幕挂载、全生态弹幕系统（弹弹play / B站 / DanmuBox）接入与去重、Bangumi 元数据与收藏交互、分集对齐规范（PlayableSlot）以及播放量指标上报。

---

## 一、 架构原则与核心设计理念

### 1. 核心铁律：零服务器代理流量（Zero Server Bandwidth Principle）
* **Web 端的局限性**：浏览器受制于 W3C 同源策略（CORS）与 Referer 伪造限制，无法向第三方源站发送自定义请求头（如 `Referer`、`Cookie`），因此网页端在部分受控源上被迫退化为服务端代理（通过 `/api/media/stream` 中转）。
* **App 端的原生特权**：移动端与桌面端 App 拥有完整的系统网络套接字权限，**不受浏览器的 CORS 和 Referer 沙箱限制**。
* **App 接入铁律**：**App 端在解析出视频地址后，必须直接使用源站原始播放地址（`playUrl`）配合源站请求头（`headers`）直连播放！严禁在正常情况下使用服务端的代理流地址（`proxyUrl`）！** 服务端仅负责解析算子计算、Token 握手与 API 调度，不承担 App 端的媒体流量。

### 2. 视频源平台隔离与可见性契约（`platforms`）
* 规则定义中包含 `platforms?: ('web' | 'app')[]` 字段：
  * **缺省未配置**：默认为全平台支持（`['web', 'app']`）。
  * **`platforms: ['app']`**：**App 专属源**（在 Web 网页端完全隐藏）。
* **专属源典型代表**：
  * **`sorani`（青空次元）**：1080P 超清 HLS 流。源站 CDN（`sorani-vids.xyz`）强校验 `Referer: https://www.sorani.net/`，Web 端无法伪造，但在 App 原生播放器中注入 Referer 即可零带宽直连秒播。
  * **`anime1`（Anime1）**：720P/1080P MP4 直链。源站强依赖动态短效 `Cookie: e=...`，Web 端因跨域 Cookie 限制无法直连，但在 App 端注入 Cookie 即可原生直连起播。

### 3. 双轨视频源交互模式：受控源 vs 规则引擎
Animaku 服务端提供两套并行的视频源调用接口体系：
* **官方受控源接口（`/api/source/*`，强烈推荐官方客户端首选）**：
  * 服务端固化内置高质量适配器（`neosek`, `tvtfun`, `cycani`, `sorani`, `xifan-next`, `anime1`, `moonci`, `animoe` 等）。
  * 客户端仅需传递源标识字符串（如 `"source": "neosekai"`）与目标关键字/URL，无需在客户端本地维护繁重复杂的 JSON 抓取规则，免受规则版本滞后影响。
  * 拥有严格的出站安全策略与端口白名单，稳定性极高。
* **动态规则引擎接口（`/api/plugin/*`，扩展模式）**：
  * 允许客户端随请求提交自定义 `rule`（兼容 Kazumi V1 XPath 规则与 AniBaka V2 算子规则）。
  * 适用于社区导入第三方源、用户自建规则等自定义场景。

---

## 二、 视频源与播放解析契约（Play & Resolve API）

客户端与服务端交互的标准三部曲为：**搜索（Search） ➔ 选集（Chapters） ➔ 播放直链解析（Resolve）**。

```
┌──────────────┐             ┌─────────────────────┐             ┌─────────────────────┐
│  Animaku App │             │  Animaku Backend    │             │  第三方视频源 / CDN  │
└──────┬───────┘             └──────────┬──────────┘             └──────────┬──────────┘
       │                                │                                   │
       │  1. POST /api/source/search    │                                   │
       ├───────────────────────────────>│ 抓取/解密三方搜索                 │
       │  { source, keyword }           ├──────────────────────────────────>│
       │                                │<──────────────────────────────────┤
       │<───────────────────────────────┤                                   │
       │  返回 SearchItem[] 列表        │                                   │
       │                                │                                   │
       │  2. POST /api/source/chapters  │                                   │
       ├───────────────────────────────>│ 抓取/解析分集列表                 │
       │  { source, url }               ├──────────────────────────────────>│
       │                                │<──────────────────────────────────┤
       │<───────────────────────────────┤                                   │
       │  返回 Road[] (线路与集数列表)  │                                   │
       │                                │                                   │
       │  3. POST /api/source/resolve   │                                   │
       ├───────────────────────────────>│ 逆向/Token握手/提取字幕           │
       │  { source, pageUrl }           ├──────────────────────────────────>│
       │                                │<──────────────────────────────────┤
       │<───────────────────────────────┤                                   │
       │  返回 ResolvePlayResult        │                                   │
       │  (playUrl, headers, subtitle)  │                                   │
       │                                │                                   │
       │  4. 原生播放器直连播放（零服务器代理带宽）                        │
       │     setDataSource(playUrl, headers: result.headers)                │
       │     setSubtitleTracks(result.subtitle?.subtitles)                  │
       ├───────────────────────────────────────────────────────────────────>│
       │<───────────────────────────────────────────────────────────────────┤
       │  HTTP 200/206 媒体数据流（HLS / MP4）                             │
```

---

### 1. 模式 A：官方固化受控源接口（推荐原生 App 使用）

#### 1.1 获取受控视频源列表：`GET /api/source/list`
* **端点**：`GET /api/source/list`
* **Response Body**：
```json
{
  "data": [
    {
      "id": "neosekai",
      "name": "neosek",
      "tier": "tier_a",
      "capabilities": { "allowedPorts": [80, 443, 2096, 8443] }
    },
    {
      "id": "tvtfun",
      "name": "tvtfun",
      "tier": "tier_a",
      "capabilities": { "allowedPorts": [80, 443] }
    },
    {
      "id": "sorani",
      "name": "sorani",
      "tier": "tier_a",
      "capabilities": { "allowedPorts": [80, 443] }
    }
  ]
}
```

#### 1.2 视频源搜索：`POST /api/source/search`
* **端点**：`POST /api/source/search`
* **Request Body**：
```json
{
  "source": "neosekai",
  "keyword": "葬送的芙莉莲"
}
```
* **Response Body**：
```json
{
  "data": {
    "pluginName": "neosek",
    "items": [
      {
        "name": "葬送的芙莉莲",
        "src": "https://neosek.ai/anime/0/828"
      }
    ],
    "diagnostics": ["Neosek 搜索成功: 命中 1 部番剧"]
  }
}
```

#### 1.3 视频源选集与线路：`POST /api/source/chapters`
* **端点**：`POST /api/source/chapters`
* **Request Body**：
```json
{
  "source": "neosekai",
  "url": "https://neosek.ai/anime/0/828"
}
```
* **Response Body**：
```json
{
  "data": {
    "pluginName": "neosek",
    "roads": [
      {
        "name": "默认线路",
        "identifier": ["第01集", "第02集", "第03集"],
        "data": [
          "https://neosek.ai/anime/0/828/episode/101",
          "https://neosek.ai/anime/0/828/episode/102",
          "https://neosek.ai/anime/0/828/episode/103"
        ]
      }
    ]
  }
}
```

#### 1.4 播放直链解析：`POST /api/source/resolve`
* **端点**：`POST /api/source/resolve`
* **Request Body**：
```json
{
  "source": "neosekai",
  "pageUrl": "https://neosek.ai/anime/0/828/episode/101"
}
```
* **Response Body**：见下文《播放解析结果契约（ResolvePlayResult）》。

---

### 2. 模式 B：动态规则引擎接口（第三方自定义规则模式）

当需要使用客户端本地导入的 JSON 规则时，调用 `/api/plugin/*` 端点：
* `POST /api/plugin/search`：`{ "rule": PluginRule, "keyword": "...", "bangumiId": 400602 }`
* `POST /api/plugin/chapters`：`{ "rule": PluginRule, "source": "..." }`
* `POST /api/plugin/resolve`：`{ "rule": PluginRule, "pageUrl": "..." }`

规则数据结构支持标准 `PluginRule`：
```typescript
export interface PluginRule {
  name: string
  version: string
  baseURL: string
  weight?: number                     // 排序权重，默认内置源为 50，第三方源为 0
  platforms?: ('web' | 'app')[]       // 适用平台，App 应加载包含 'app' 或缺省的规则
  oldAnimePriority?: boolean          // 5 年以上老番场景额外赋予 +12 权重加权
  titlePreference?: 'chinese' | 'chinese_compact' | 'original' | 'traditional'
  adBlockerMode?: 'none' | 'client' | 'server'
}
```

---

### 3. 播放解析结果契约（ResolvePlayResult 与 Subtitle 规范）

无论调用 `/api/source/resolve` 还是 `/api/plugin/resolve`，返回的解析数据均符合标准的 `ResolvePlayResult` 规范：

```json
{
  "data": {
    "playUrl": "https://media.neosek.ai/video/828_ep1_1080p.mp4",
    "proxyUrl": "/api/media/stream?url=...",
    "format": "mp4",
    "contentType": "video/mp4",
    "requiresProxy": false,
    "referer": "https://neosek.ai/",
    "headers": {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...",
      "Referer": "https://neosek.ai/"
    },
    "adBlockerMode": "none",
    "subtitle": {
      "subtitles": [
        {
          "id": "sub-0",
          "label": "简体中文 (ASS特效)",
          "url": "https://assets.neosek.ai/subs/828_ep1_zh.ass",
          "format": "ass",
          "default": true
        },
        {
          "id": "sub-1",
          "label": "繁体中文 (VTT)",
          "url": "https://assets.neosek.ai/subs/828_ep1_tc.vtt",
          "format": "vtt",
          "default": false
        }
      ],
      "fonts": [
        "https://assets.neosek.ai/fonts/SourceHanSansCN-Bold.woff2",
        "https://assets.neosek.ai/fonts/FZZhunYuan-M02S.ttf"
      ]
    },
    "subtitles": [
      {
        "id": "sub-0",
        "label": "简体中文 (ASS特效)",
        "url": "https://assets.neosek.ai/subs/828_ep1_zh.ass",
        "format": "ass",
        "default": true
      }
    ],
    "fonts": [
      "https://assets.neosek.ai/fonts/SourceHanSansCN-Bold.woff2"
    ],
    "diagnostics": ["成功解析 1080P MP4 原画直链并提取 2 条外挂字幕轨"]
  }
}
```

#### 关键字段行为契约说明：
| 字段名 | 类型 | App 客户端处理规范 |
| :--- | :--- | :--- |
| **`playUrl`** | `string` | **必须作为主媒体源输入播放器内核**。为源站直连播放地址（MP4 或 M3U8）。 |
| **`headers`** | `Record<string, string>` | **必须全量注入给播放器底层网络栈**。包含 `Referer`、`User-Agent`、`Cookie` 等防盗链关键凭据。漏传将导致 CDN 报 403 Forbidden！ |
| **`format`** | `'hls' \| 'mp4'` | 提示播放器内核所使用的解封装管道（`hls` 用于 HLS/M3U8，`mp4` 用于标准 MP4 渐进式流）。 |
| **`subtitle`** | `SubtitleBundle` | **统一外挂字幕与字体包资产**。包含 `subtitles` 字幕列表与 `fonts` 特效字体文件列表。 |
| **`subtitles`** | `SubtitleTrack[]` | 兼容旧版字段，与 `subtitle.subtitles` 一致。包含字幕的 URL、`format`（`'ass' \| 'vtt'`）与语言标签。 |
| **`fonts`** | `string[]` | 字体文件 URL 列表。用于挂载 ASS 特效字幕时提供字体包依赖，避免字幕由于缺失字体而退化为系统默认宋体/黑体。 |
| **`adBlockerMode`**| `'none' \| 'client' \| 'server'` | 广告清洗模式提示。`'client'` 提示该流为包含切片广告的源（如量子资源），客户端播放器应按断层标记自动跳过。 |
| **`requiresProxy`**| `boolean` | 对于 App 直连源，服务端已置为 `false`。App 端忽略服务端媒体代理。 |
| **`proxyUrl`** | `string` | 服务端反代地址，**仅供 Web 浏览器兜底使用，App 端禁止使用**。 |

---

## 三、 各平台播放器内核请求头（Headers）与外挂字幕挂载实现

### 1. Flutter (`media_kit` / `libmpv`) —— 【官方推荐首选方案】
`media_kit` 底层基于 `libmpv`，不仅原生支持通过 `http-header-fields` 注入自定义请求头，而且内置了业界最强大的 **`libass` 渲染引擎**，完美支持原生加载 ASS 特效字幕与自定义字体：

```dart
import 'dart:io';
import 'package:media_kit/media_kit.dart';

Future<void> startPlaybackWithSubtitles({
  required Player player,
  required String playUrl,
  Map<String, String>? headers,
  List<Map<String, dynamic>>? subtitleTracks,
  List<String>? fontUrls,
}) async {
  // 1. 组装请求头
  final Map<String, String> httpHeaders = {};
  if (headers != null) {
    headers.forEach((key, value) {
      if (value.isNotEmpty) {
        httpHeaders[key] = value;
      }
    });
  }

  // 2. 构造主媒体对象并挂载请求头
  final media = Media(
    playUrl,
    httpHeaders: httpHeaders,
  );

  await player.open(media, play: false);

  // 3. 挂载外挂字幕轨 (ASS / VTT)
  if (subtitleTracks != null && subtitleTracks.isNotEmpty) {
    for (final sub in subtitleTracks) {
      final subUrl = sub['url'] as String?;
      final subLabel = sub['label'] as String? ?? '外挂字幕';
      if (subUrl != null && subUrl.isNotEmpty) {
        // media_kit 支持直接添加外部 URL 字幕
        await player.setSubtitleTrack(
          SubtitleTrack.uri(
            subUrl,
            title: subLabel,
            language: 'zh',
          ),
        );
      }
    }
  }

  // 4. (可选进阶) 针对 ASS 字幕字体包处理：
  // 客户端可先在后台将 fonts 列表中的字体文件下载至本地临时目录
  // 然后通过 mpv 底层参数注入 --sub-fonts-dir
  // (player.platform as NativePlayer).setProperty('sub-fonts-dir', localFontDir.path);

  await player.play();
}
```

### 2. Android 原生 (`Media3` / `ExoPlayer`)
Android 原生通过 `DefaultHttpDataSource.Factory` 注入全量请求头，并通过 `MediaItem.SubtitleConfiguration` 外挂字幕：

```kotlin
import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory

fun playVideoWithSubtitles(
    player: ExoPlayer,
    playUrl: String,
    headers: Map<String, String>?,
    subtitleUrl: String?,
    subtitleFormat: String? // "vtt" 或 "ass"
) {
    // 1. 配置 HTTP 协议栈并注入防盗链请求头
    val httpDataSourceFactory = DefaultHttpDataSource.Factory()
        .setAllowCrossProtocolRedirects(true)

    headers?.forEach { (key, value) ->
        httpDataSourceFactory.setDefaultRequestProperties(mapOf(key to value))
    }

    // 2. 构造 MediaItem 并配置外部字幕轨
    val mediaItemBuilder = MediaItem.Builder().setUri(playUrl)

    if (!subtitleUrl.isNullOrEmpty()) {
        val mimeType = if (subtitleFormat.equals("ass", ignoreCase = true)) {
            MimeTypes.TEXT_SSA
        } else {
            MimeTypes.TEXT_VTT
        }

        val subtitleConfig = MediaItem.SubtitleConfiguration.Builder(Uri.parse(subtitleUrl))
            .setMimeType(mimeType)
            .setLanguage("zh")
            .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
            .build()

        mediaItemBuilder.setSubtitleConfigurations(listOf(subtitleConfig))
    }

    val mediaSourceFactory = DefaultMediaSourceFactory(httpDataSourceFactory)
    val mediaSource = mediaSourceFactory.createMediaSource(mediaItemBuilder.build())

    player.setMediaSource(mediaSource)
    player.prepare()
    player.play()
}
```

### 3. iOS 原生 (`AVPlayer` / `AVURLAsset`)
iOS 原生支持通过 `AVURLAssetHTTPHeaderFieldsKey` 注入直连 headers。对于 ASS 特效字幕，由于 iOS `AVPlayer` 仅原生支持 WebVTT 和 TTML，若需高保真呈现 ASS 特效字幕，推荐在 iOS 端集成基于 `libass` 的播放器框架（如基于 `libmpv` 的 `media_kit`、`VLCKit` 或 `MPVKit`）：

```swift
import AVFoundation

func playVideo(player: AVPlayer, playUrl: String, headers: [String: String]?) {
    guard let url = URL(string: playUrl) else { return }

    var options: [String: Any] = [:]
    if let headers = headers, !headers.isEmpty {
        options["AVURLAssetHTTPHeaderFieldsKey"] = headers
    }

    let asset = AVURLAsset(url: url, options: options)
    let playerItem = AVPlayerItem(asset: asset)

    player.replaceCurrentItem(with: playerItem)
    player.play()
}
```

### 4. React Native (`react-native-video`)
```tsx
import Video from 'react-native-video';

interface PlaybackProps {
  playUrl: string;
  headers?: Record<string, string>;
  subtitles?: Array<{ url: string; label: string; format: string }>;
}

export const NativePlayer: React.FC<PlaybackProps> = ({ playUrl, headers, subtitles }) => {
  return (
    <Video
      source={{
        uri: playUrl,
        headers: headers || {},
      }}
      selectedTextTrack={{
        type: 'index',
        value: 0,
      }}
      textTracks={subtitles?.map((s) => ({
        title: s.label,
        language: 'zh',
        type: s.format === 'ass' ? 'text/x-ssa' : 'text/vtt',
        uri: s.url,
      }))}
      style={{ width: '100%', height: '100%' }}
      controls={true}
      resizeMode="contain"
    />
  );
};
```

---

## 四、 特殊视频源直连特性与反爬适配避坑指南

### 1. `neosek` (neosek.ai - 1080P/原画 MP4 直链与 ASS 特效字幕)
* **画质特征**：支持 1080P 原画 MP4 直链，同时提取自带的 ASS/VTT 外挂字幕与独立字体包（`fonts`）。
* **【铁律】地区封锁政策（Ban Japan IP）**：
  * **源站明确禁用了日本地区 IP**。
  * **避坑要点**：若客户端直连播放或后端请求时使用了日本代理节点，源站会在 TLS 握手阶段直接 RST 断开或返回错误。直连播放时，**出站节点必须为非日本地区 IP（如中国大陆直连、香港、台湾、新加坡、欧美等节点均可正常起播）**。

### 2. `sorani` (青空次元 - 1080P HLS 专属源)
* **特征**：M3U8 播放列表包含 AES-128 加密 Key（`ts.key`）以及切片（`.ts`）。
* **安全门禁**：源站 CDN 强校验 `Referer: https://www.sorani.net/`。
* **现象与规避**：若未透传 Referer，播放器拉取 `ts.key` 或分片时会抛出 `HTTP 403 Forbidden`。
* **正确做法**：将 `result.headers` 注入播放器，底层网络栈在拉取 Key 和 TS 分片时会自动带上该 Referer，顺利解密播放。

### 3. `anime1` (Anime1 - 繁体 MP4 直链)
* **特征**：动态短效防刷 Cookie 鉴权。
* **安全门禁**：播放直链必须携带服务端实时握手拿到的 `Cookie: e=...` 以及 `Referer: https://anime1.me/`。
* **正确做法**：服务端已将鉴权 Cookie 写入 `result.headers.Cookie`，App 播放器直接设置请求头发起直连连接即可。

### 4. `tvtfun` (TvTFun - 1080P MP4 直链)
* **特征**：包含多条播放线路，通常返回 1080P MP4 直链。
* **避坑要点**：线路 1 为源站加速线路，支持原生快速 Seek 与断点续传。

### 5. `moonci` (月之祠 - 联通/移动云盘直链 MP4)
* **特征**：源站存储于联通/移动网盘 CDN（如 `pan.wo.cn`）。
* **安全门禁**：**携带错误的 Referer 会直接报 `400 Bad Request`**！源站支持 `no-referrer`。
* **正确做法**：服务端返回的 `result.headers.Referer` 为空或不包含 Referer，App 必须严格遵循接口返回的 `headers`，**切勿自行盲目追加默认 Referer**。

### 6. `xifan-next` (稀饭动漫 - 1080P MP4 竞速直链)
* **特征**：支持 1080P 高清 MP4 直链，无防盗链限制，起播延迟极低。

### 7. `lzizy` (量子资源 - 切片插播广告模式)
* **特征**：纯 HLS 直链，自带 3~5 秒切片广告。
* **避坑要点**：接口返回 `adBlockerMode: "client"`。客户端可根据 M3U8 中的 `#EXT-X-DISCONTINUITY` 标签以及切片时长序列，在播放器层自动跳过广告段落。

---

## 五、 全生态弹幕系统接入协议（Danmaku Ecosystem）

Animaku 提供了**全网聚合的高保真弹幕中台**，包含三个独立的弹幕源：**弹弹play 官方库、B 站官方弹幕反代、以及弹幕盒子 (DanmuBox) 历史归档库**。

```
                       客户端弹幕会话调度器 (Danmaku Session)
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
     弹弹play 权威弹幕         B 站番剧/视频弹幕         弹幕盒子历史归档
  GET /api/danmaku/comment/  GET /api/danmaku/bilibili  GET /api/danmaku/danmubox/
              │                       │                       │
              └───────────────────────┼───────────────────────┘
                                      ▼
                        客户端增量去重池化引擎
                        (senderHash + text 去重)
                                      ▼
                         120Hz 物理时钟渲染图层
```

---

### 1. 弹弹play 弹幕接入

#### 1.1 通过 Bangumi ID 查询弹弹条目与分集：`GET /api/danmaku/bangumi/bgmtv/:bgmId`
* **端点**：`GET /api/danmaku/bangumi/bgmtv/:bgmId`
* **Response Body**：
```json
{
  "data": {
    "bangumiId": 400602,
    "episodes": [
      { "episodeId": 1001, "episodeTitle": "第01话 冒险的结束" },
      { "episodeId": 1002, "episodeTitle": "第02话 并非魔法的魔法" }
    ]
  }
}
```

#### 1.2 拉取弹幕列表：`GET /api/danmaku/comment/:episodeId`
* **端点**：`GET /api/danmaku/comment/:episodeId?withRelated=true&chConvert=1`
* **Query 参数**：
  * `withRelated=true`：合并关联视频弹幕（极大扩充弹幕量）。
  * `chConvert=1`：统一转换为简体中文（`0` 保持原文）。
* **Response Body**：
```json
{
  "count": 1250,
  "data": [
    {
      "time": 12.35,
      "mode": "rtl",
      "style": { "color": "#ffffff" },
      "text": "前方高能！！！",
      "senderHash": "a1b2c3d4"
    },
    {
      "time": 45.12,
      "mode": "top",
      "style": { "color": "#ff0000" },
      "text": "名场面打卡",
      "senderHash": "e5f6g7h8"
    }
  ]
}
```
* **弹幕模式 `mode` 枚举**：
  * `'rtl'`：右往左滚动弹幕（默认）。
  * `'top'`：顶部居中固定弹幕。
  * `'bottom'`：底部居中固定弹幕。

---

### 2. B 站弹幕反代与跨站映射接入

Animaku 服务端内置了跨站条目映射表（`bangumi-data`），能够直接通过 Bangumi ID 和分集序号自动检索对应的 B 站番剧并抓取反代弹幕：

* **端点**：`GET /api/danmaku/bilibili`
* **推荐调用方式（按 Bangumi 条目查询）**：
  * `GET /api/danmaku/bilibili?bgm=400602&p=1`
* **按 B 站标识精确查询**：
  * `GET /api/danmaku/bilibili?bvid=BV1xx411c7xx&p=1`
  * `GET /api/danmaku/bilibili?ep=789123`
* **Response Body**：
```json
{
  "count": 3000,
  "data": [
    {
      "time": 5.4,
      "mode": "rtl",
      "style": { "color": "#ffffff" },
      "text": "芙莉莲我的芙莉莲！",
      "senderHash": "d82fe1a"
    }
  ],
  "meta": {
    "title": "葬送的芙莉莲",
    "part": "第1话 冒险的结束",
    "bvid": "BV1...",
    "cid": 123456789
  }
}
```

---

### 3. 弹幕盒子 (DanmuBox) 历史归档接入

对于 B 站下架或年代久远的老番，弹幕盒子提供了海量的历史归档弹幕（已解密并持久化解压）：

* **搜索归档**：`GET /api/danmaku/danmubox/search?keyword=凉宫春日的忧郁&ep=1`
* **拉取分集弹幕**：`GET /api/danmaku/danmubox/comments?repo=...&hash=...&ep=1`
* **Response Body**：返回标准统一的弹幕数组格式。

---

### 4. 客户端弹幕增量去重算法（O(1) 规范）

当同时开启多个弹幕源（如弹弹play + B站 + 弹幕盒子）时，为防止同一发送者的相同弹幕在屏幕上重叠刷屏，客户端必须实现增量去重算法：

```dart
/// 弹幕去重唯一特征 Key
String getDanmakuKey(DanmakuComment c) {
  // 结合发送者哈希与弹幕内容构建特征，若无 senderHash 则按时间秒数对齐
  final sender = c.senderHash ?? (c.time.toStringAsFixed(1));
  return '$sender:${c.text.trim()}';
}

/// 增量合并与去重
List<DanmakuComment> deduplicateDanmaku(List<DanmakuComment> existing, List<DanmakuComment> incoming) {
  final seenKeys = <String>{};
  final result = <DanmakuComment>[];

  for (final c in existing) {
    if (seenKeys.add(getDanmakuKey(c))) {
      result.add(c);
    }
  }

  for (final c in incoming) {
    if (seenKeys.add(getDanmakuKey(c))) {
      result.add(c);
    }
  }

  // 严格按出现时间戳升序排序
  result.sort((a, b) => a.time.compareTo(b.time));
  return result;
}
```

---

## 六、 Bangumi 元数据管线与用户中心（Metadata & User Sync）

Animaku 后端代理了 Bangumi OpenAPI，并为客户端提供高效聚合与 CDN 缓存优化：

### 1. 每日放送时间表：`GET /api/bangumi/calendar`
* **端点**：`GET /api/bangumi/calendar`
* **Response Body**：返回按周一至周日划分的番剧条目数组：
```json
{
  "data": [
    [
      {
        "id": 400602,
        "name": "葬送のフリーレン",
        "nameCn": "葬送的芙莉莲",
        "images": { "large": "https://lain.bgm.tv/pic/cover/l/..." },
        "rating": { "score": 8.8, "total": 15420 }
      }
    ]
  ]
}
```

### 2. 全网热门番剧：`GET /api/bangumi/trending`
* **端点**：`GET /api/bangumi/trending`
* **Response Body**：`{ "data": BangumiItem[] }`（返回当前季度最高热度的前 40 部番剧）。

### 3. 综合搜索：`POST /api/bangumi/search`
* **端点**：`POST /api/bangumi/search`
* **Request Body**：
```json
{
  "keyword": "无职转生"
}
```
* **Response Body**：`{ "data": BangumiItem[] }`

### 4. 番剧条目详情：`GET /api/bangumi/subjects/:id`
* **端点**：`GET /api/bangumi/subjects/:id`
* **Response Body**：包含番剧的完整剧情简介、放送日期、Staff 制作阵容、角色列表、标签与全尺寸海报图。

### 5. 官方分集列表：`GET /api/bangumi/subjects/:id/episodes`
* **端点**：`GET /api/bangumi/subjects/:id/episodes`
* **Response Body**：返回官方定义的每一集元数据（`sort`、`type`、`name`、`nameCn` 等）。

### 6. 智能关联推荐：`GET /api/bangumi/subjects/:id/recommendations`
* **端点**：`GET /api/bangumi/subjects/:id/recommendations`
* **Response Body**：返回基于深度协同过滤与题材相似度的推荐番剧列表。

### 7. 番剧吐槽区与长评：`GET /api/bangumi/subjects/:id/comments`
* **端点**：`GET /api/bangumi/subjects/:id/comments?page=1&limit=20`
* **Response Body**：包含用户的评分、吐槽内容、发布时间与用户头像。

### 8. 用户认证与收藏进度同步
客户端请求时携带 `Authorization: Bearer <bangumi_access_token>`：
* **获取当前登录用户**：`GET /api/bangumi/me`
* **查询条目收藏状态**：`GET /api/bangumi/collections/:subjectId`
* **更新条目收藏状态**：`PUT /api/bangumi/collections/:subjectId`
  * **Request Body**：
    ```json
    {
      "type": 3,
      "rate": 9,
      "comment": "神作不解释",
      "private": false
    }
    ```
  * `type` 枚举：`1` 想看 (Wish) / `2` 看过 (Collect) / `3` 在看 (Do) / `4` 搁置 (OnHold) / `5` 抛弃 (Dropped)。

---

## 七、 权威分集对齐规范与槽位引擎（PlayableSlot Engine）

在第三方视频源中，剧集标题往往千奇百怪（例如 `第10话`、`10`、`第十天恶魔`、`86`、`100万的命`），若客户端单纯使用正则表达式匹配数字，极易引发严重错乱。

Animaku 提出了 **`PlayableSlot` 双层对齐引擎**（源码位于 `packages/shared/src/episode-alignment.ts`）：

```typescript
export interface PlayableSlot {
  canonicalEp: number       // 标准集数序号 (0, 1, 2, ...)
  officialTitle: string     // 官方分集标题 (如 "冬之日", "序章")
  displayTitle: string      // 标准 UI 标题 (如 "第01话 冬之日")
  sourceIndex: number       // 对应第三方源线路数组中的实际索引 (road.data[sourceIndex])
  pageUrl: string           // 第三方源播放单集页面地址
  sourceTitle: string       // 第三方源原始标题 (如 "01 1080P修复")
  isLayer2?: boolean        // 是否为保底降级模式
}
```

### 对齐双层架构：
1. **第一层（Layer 1 权威 Bangumi 槽位驱动）**：
   * 严格以 Bangumi 官方 `type === 0`（正片）且按 `sort` 递增的分集列表为骨架。
   * 过滤掉第三方源中的明显非正片项（使用正则过滤 `PV`、`预告`、`OVA`、`OAD`、`SP`、`特别篇`、`总集篇`、`特典`、`NCED` 等）。
   * 将过滤后的纯正片列表按位置次序 1:1 嵌合入官方槽位。完全杜绝数字名番剧的解析错位！
2. **第二层（Layer 2 保守数字提取兜底）**：
   * 仅在 Bangumi 无分集数据或离线模式下生效，利用严格数字正则提取正片序号。

---

## 八、 播放量统计与指标上报（Telemetry & Play Count）

为保证全网热度排行的准确性，客户端在正片成功起播后，应触发一次播放统计上报：

* **端点**：`POST /api/stats/view`
* **Request Headers**：`Content-Type: application/json`
* **Request Body**：
```json
{
  "bangumiId": 400602,
  "episode": 1
}
```
* **Response Body**：
```json
{
  "success": true,
  "playCount": 182,
  "totalPlayCount": 24500,
  "deduped": false
}
```
* **服务端防刷契约**：服务端采用 `10分钟` IP + 条目 + 集数的滑动窗口防刷机制。10 分钟内重复上报同一集的播放，服务端返回 `"deduped": true` 且不增加计数器，无阻塞立即返回。

---

## 九、 故障排查与自愈决策树（Troubleshooting）

```
                     起播失败 (Playback Error)
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
          HTTP 403 Forbidden             HTTP 400 Bad Request
                 │                             │
    ┌────────────┴────────────┐                └─ 检查 Referer 是否违规追加
    ▼                         ▼                   (如月之祠源需保持空 Referer)
排查 Referer 是否漏传   排查 Cookie 是否漏传
(如 sorani 需 sorani.net) (如 anime1 需 e=...)
                 │
                 ▼
          TLS 握手中断 / RST
                 │
                 └─ 检查出站 IP 是否为日本地区
                    (如 neosek 明确禁用了日本地区 IP)
```

1. **若遇到 `403 Forbidden`**：
   * 打印 App 发出的 HTTP 抓包日志。
   * 99% 的原因是播放器未将 `result.headers` 注入到底层网络栈，或者仅在加载主 M3U8 时注入，未在加载分片/Key 时继承请求头。
2. **若遇到连接被阻断或 TLS 异常**：
   * 检查是否访问了 `neosek` 等启用了地区封锁（Ban Japan IP）的视频源，切换为非日本出站节点即可解决。
3. **断流自动自愈**：
   * 部分 CDN 的直链具有 1~2 小时动态有效期（带时间戳和加密签名）。若播放中途因鉴权超时断流，客户端应捕获错误并自动重新调用 `/api/source/resolve` 获取新鲜直链，然后平滑 Seek 到当前播放位置，实现用户无感知的连接自愈。
