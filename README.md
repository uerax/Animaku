<div align="center">

  <p><a href="README.md">简体中文</a> · <a href="README.en.md">English</a></p>

  <h1>Animaku</h1>

  <img src="apps/web/public/android-chrome-512x512.png" width="256" alt="Animaku logo" />

  <p>
    <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite 6" />
    <img src="https://img.shields.io/badge/Hono-API-E36002?style=for-the-badge&logo=hono&logoColor=white" alt="Hono API" />
    <img src="https://img.shields.io/badge/WebGPU-Anime4K-9cf?style=for-the-badge&logo=webgpu&logoColor=white" alt="WebGPU Anime4K" />
    <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker Ready" />
  </p>

  <p>现代化自托管二次元番剧流媒体客户端。开箱内置优质 1080P 直链源，集成 Bangumi 放送表、弹幕聚合、WebGPU 实时超分与智能跳过 OP/ED。专为追番设计 (～￣▽￣)～</p>

</div>

## 屏幕截图

<p align="center">
  <img src="docs/screenshots/watch-player.png" alt="Animaku 播放页" width="900" />
</p>

## 功能 / 开发计划

- [X]  1080P 直链播放
- [X]  WebGPU 实时超分 (Anime4K)
- [X]  弹幕播放与聚合 (弹弹play)
- [X]  本地弹幕导入 (.xml / Pakku)
- [X]  进度条高能弹幕热力图
- [X]  智能跳过片头片尾 (OP/ED)
- [X]  智能去广告切片
- [X]  多视频源支持与快捷换源
- [X]  视频源自定义排序与独立配置
- [X]  番剧周更时间表 (Bangumi)
- [X]  番剧搜索与详情浏览
- [X]  个人追番管理与 Bangumi 进度同步
- [X]  智能番剧推荐
- [X]  桌面宽屏模式 / 网页全屏 / 系统全屏
- [X]  画面比例切换 (16:9 / 4:3 / 铺满 / 拉伸)
- [X]  原画截图 / 画面翻转 / 画中画
- [X]  播放器信息统计 (Stats for Nerds)
- [X]  移动端触控手势操作
- [X]  播放历史记录
- [X]  深色 / 浅色模式
- [X]  Docker 一键部署
- [ ]  还有更多 (/・ω・＼)

## 部署与运行

推荐使用 **Docker Compose** 一键部署：

```bash
# 1. 克隆代码仓库
git clone https://github.com/uerax/Animaku.git animaku
cd animaku

# 2. 准备配置文件
cp .env.example .env

# 3. 启动容器
docker compose up -d
```

启动后使用浏览器访问 `http://localhost:8787` 即可。

<details>
<summary>本地开发与调试</summary>

```bash
# 环境要求：Node.js ≥ 20，推荐 pnpm
pnpm install
cp .env.example .env
pnpm dev
```

浏览器打开 `http://localhost:5173` 进行调试。
</details>

## 快捷键与手势

### 键盘快捷键

| 快捷键 | 功能 |
| :--- | :--- |
| `Space` / `K` | 播放 / 暂停 |
| `←` / `→` | 快退 5 秒 / 快进 5 秒 |
| `↑` / `↓` | 音量调整 ±5% |
| `F` | 系统全屏 |
| `Shift + W` | 网页全屏 |
| `W` | 切换画面比例 |
| `D` | 切换弹幕显示状态 |
| `Alt + M` | 打开弹幕设置面板 |
| `,` / `.` / `/` | 弹幕延后 / 提前 / 重置偏移 |
| `P` / `N` | 上一集 / 下一集 |
| `鼠标右键` | 高级菜单（信息统计 / 截图 / 镜像 / 超分） |

### 移动端手势

- **双击屏幕**：播放 / 暂停
- **长按屏幕**：2.0X 极速快进
- **横向滑动**：快速寻轨快进 / 快退

## Q&A

<details>
<summary>使用者 Q&A</summary>

#### Q: 为什么少数番剧播放时会有广告？
A: 本项目不包含任何广告。广告来自第三方切片源，可在设置中开启「广告过滤」，或在播放页右侧切换其他视频源。

#### Q: 为什么开启超分辨率 (Anime4K) 后播放卡顿？
A: 超分辨率依赖本地显卡算力 (WebGPU)。若硬件性能有限，建议在设置或右键菜单中选择「效率档」，或仅针对 720P 及以下分辨率开启。

#### Q: 为什么部分视频源无法播放或加载缓慢？
A: 部分第三方源可能存在临时网络波动或反爬限制，可在右侧源抽屉中一键切换其他线路。

#### Q: 弹幕获取失败或提示未配置？
A: 默认使用内置公共接口。如需更稳定体验，可在 [弹弹play 开放平台](https://www.dandanplay.com/) 免费申请专属 API 并配置到环境变量中。

</details>

## 免责声明

本软件仅供学习交流与自托管使用。本项目不存储、不分发任何音视频文件，所有视频均索引自互联网第三方公开源。使用本项目需遵守所在地法律法规，并尊重版权方的合法权益。

## 隐私政策

默认不收集任何用户数据，不内置任何商业追踪 SDK。播放历史与个人配置均仅保存在使用者浏览器本地。

## 致谢

- [Kazumi](https://github.com/Predidit/Kazumi) —— 优秀的设计与灵感来源
- [Bangumi 番组计划](https://bangumi.tv/) —— 番剧维基数据与更新日历
- [弹弹play](https://www.dandanplay.com/) —— 弹幕库支持
- [Anime4K](https://github.com/bloc97/Anime4K) —— 实时动画超分辨率算法
- [bangumi-oped](https://github.com/uerax/bangumi-oped) —— 片头片尾时间戳数据
