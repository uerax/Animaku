# Bug / 待办清单

## 📌 待处理清单 (Active TODOs)

*(暂无待处理项，所有已知问题已解决并归档)*

---

## 历史已解决归档 (Recently Resolved)

> 2026-08-19 及更早的 Bug 修复历史已归档至 [.claude/BUGS_ARCHIVE.md](BUGS_ARCHIVE.md)

### [2026-08-20]
1. **接入全新视频源 TvTFun (tvtfun.net) 专有适配器与 1080P MP4 原画直链 (P0)**
   - 解决：逆向探查前端 Next.js RSC 并绕过 `disable-devtool` 防调试；分析 RESTful JSON 架构与 `tvt-pt` / `X-Play-Ctx` 鉴权，实现 JIT 凭证抓取与 403 自愈机制；获取火山引擎 BytePlus / TopBuzz CDN 1080P MP4 原画直链，支持 HTTP 206 字节拖拽与 0 代理直连。
   - 文件：`apps/server/src/lib/tvtfun.ts`, `apps/server/src/rule-engine/index.ts`, `apps/web/src/data/default-plugins/tvtfun.json`, `apps/web/src/data/default-plugins/index.ts`, `apps/web/src/stores/plugins.ts`
