# TODO

## 视频源关键字搜索偏好（日语标题优先）
  - [ ] 为 `apps/web/src/data/default-plugins/` 下对日语标题友好的三个源 JSON 加偏好字段：`xifan-next.json`、`libvio.json`、`omofun.json`；其余源（anime1、age、mxdm、xifan、otage）维持中文名优先的默认行为
  - 现状默认关键词由 `defaultKeyword` 决定（`item.nameCn`（中文名）→ `item.name`（日语原名）），所有源共用同一关键词
  - `BangumiItem` 含 `nameCn`（中文）与 `name`（日语原名）双字段