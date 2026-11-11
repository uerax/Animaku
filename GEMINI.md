# 安全与执行权限规则 (Security & Permission Rules)

本项目已应用严格的 Agent 权限控制策略。所有交互和工具调用必须严格遵守以下规则：

## 1. 文件读取权限 (Read Policy)
- **允许 (Allow)**: 项目内正常源代码、文档及资源文件的读取。
- **禁止 (Deny)**: 
  - 严禁读取任何环境配置文件：`*.env`, `*.env.*`（如 `.env`, `.env.local`, `.env.production` 等）。
  - 严禁读取任何私钥与证书文件：`**/*.key`。

## 2. 文件编辑与修改 (Edit Policy)
- **严禁修改 (Deny)**:
  - 任何系统级配置文件（如 `/etc/**`）。
  - 用户 SSH 密钥与认证配置（如 `~/.ssh/**`）。
- **确认后执行 (Ask)**:
  - 对项目内任何文件的编辑（`edit_file`）或创建/覆盖（`write_file`），在执行前必须向用户清晰说明修改意图，并在涉及敏感或重大改动时征得用户确认。

## 3. 子任务与委派 (Task Policy)
- **禁止 (Deny)**: 
  - 禁止创建子任务、后台长期任务或派发子代理（即禁用 `invoke_subagent`, `manage_task`, `define_subagent`, `schedule` 等工具）。所有工作均在当前会话中直接执行。

## 4. 网络与搜索 (Web Policy)
- **网络搜索 (Allow)**: 允许使用 `search_web` 检索开发技术资料。
- **网络抓取 (Ask)**: 涉及外部 API 请求或网页抓取（WebFetch）时，应向用户说明并征得确认。

## 5. 终端命令执行权限 (Bash / Run Command Policy)
在调用终端命令工具（`run_command`）时，严格遵循以下白名单与黑名单机制：

### 绝对禁止执行 (Deny)
- `rm -rf /*`, `rm -rf /` 等根目录或整盘高危删除指令。
- `git reset --hard*` 等会导致未提交或提交历史丢失的硬重置指令。
- `git push --force*`, `git push -f*` 等强制覆盖远程仓库分支的指令。

### 允许免确认执行 (Allow)
- Git 只读查询指令：`git status`, `git diff`, `git log`, `git show`。
- 测试与代码检查指令：`npm test` / `pnpm test`, `npm run lint` / `pnpm run lint`。
- 构建指令：`npm run build` / `pnpm run build`。
- 只读目录与文件检索：`dir`, `ls`, `grep`, `findstr` 等。

### 必须向用户询问并确认后执行 (Ask)
- 版本提交与推送：`git commit *`, `git push *`。
- 包发布操作：`npm publish *`, `pnpm publish *`。
- 容器相关操作：`docker *`。
- **其他所有未在上述允许列表中列出的终端命令**，均需提示用户并确认后执行。
