# 任务与规划清单 (TODO)

> 本文档用于记录 **Animaku** 的规划中功能、架构优化设想与待办事项。  
> 历史已完成的特性与缺陷修复记录已完整收录于 [.claude/STATE.md](../.claude/STATE.md)。

---

## 📌 规划中特性与体验优化 (Upcoming Features)

### 1. 数据同步与跨端备份
- [ ] **历史与配置导出/导入**：支持一键导出包含观看历史、收藏、规则与设置的 JSON 备份包；
- [ ] **WebDAV / 云端同步探索**：评估通过 WebDAV 或轻量云同步协议实现多端进度自动无感漫游。

### 2. 视频源生态与规则中心
- [ ] **更多优质 1080P/4K 直链源适配**：持续跟踪主流番剧站点，接入更多支持 CDN 直连与多码率切换的专有适配器；
- [ ] **规则商店健康度探测**：在规则商店列表中展示各社区规则的最新可用状态与延迟探针结果。

### 3. 播放与交互体验进阶
- [ ] **PWA 安装与离线体验优化**：完善 Web App Manifest 与 Service Worker 静态资源离线缓存，提升全平台 PWA 沉浸感；
- [ ] **弹幕精细化过滤规则**：支持用户自定义正则表达式屏蔽词库与弹幕发送者屏蔽列表；
- [ ] **音轨与字幕外挂增强**：为支持多音轨/内嵌字幕的流媒体提供原生音轨与字幕选择切换菜单。

---

## 💡 架构演进与性能备忘 (Architectural Notes)

1. **DNS 与 CDN 延迟优化**：针对部分海外媒体源（如 Cloudflare R2 / AWS CloudFront），持续探索更优的 DNS 解析与直连路由策略；
2. **WebGPU 超分着色器调优**：持续跟进 Anime4K WebGPU 上游优化，在低功耗集显与移动端上实现更低的显存占用；
3. **SQLite 缓存生命周期治理**：定期维护 `plugin_search_cache` 与 `plugin_chapters_cache` 的 WAL 清理与过期索引压缩。

---

## 📜 历史完成记录索引

- 最新完成任务与详细设计变更：详见 [.claude/STATE.md](../.claude/STATE.md)
- 历史 Bug 修复归档：详见 [.claude/BUGS.md](../.claude/BUGS.md) 与 [.claude/BUGS_ARCHIVE.md](../.claude/BUGS_ARCHIVE.md)
