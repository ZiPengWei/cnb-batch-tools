# AGENTS.md

本文件为 AI 编程助手（Claude Code、Codex 等）在本仓库中工作时提供指引。

## 常用命令

- 安装依赖：`pnpm install`
- 启动本地开发：`pnpm dev`
  - 会同时启动 Vite 渲染进程开发服务器和 Electron 应用。
- 构建应用：`pnpm build`
  - 依次执行 `vue-tsc`、构建渲染进程，并通过 `electron-builder` 打包 Electron 应用。
- 类型检查：`pnpm typecheck`
- 代码检查：`pnpm lint`
- 自动修复 lint 问题：`pnpm lint:fix`
- 运行单元测试：`pnpm test`
- 运行单个 Vitest 测试文件：`pnpm exec vitest run tests/mergeService.test.ts`
- 按名称运行单个 Vitest 测试：`pnpm exec vitest run tests/mergeService.test.ts -t "test name"`
- 运行默认校验流程：`pnpm check`
  - 等价于 `pnpm run typecheck && pnpm run test`
- 安装 Playwright 浏览器：`pnpm e2e:install`
- 运行 E2E 测试：`pnpm e2e`
- 运行单个 Playwright 用例：`pnpm exec playwright test e2e/app-scroll.spec.ts`
- 在不启动 Electron 的情况下调试 Playwright 使用的 Web 服务器：`VITE_E2E=1 pnpm vite --config vite.e2e.config.ts --port 4173 --strictPort`

## 高层架构

这是一个基于 Electron + Vue 3 的桌面应用，用于在 CNB (cnb.cool) 仓库中批量合并分支。

### 运行时分层

- `electron/main.ts`
  - 负责 Electron 应用与窗口生命周期。
  - 注册全部 IPC 处理器（`cnb:*` 与 `app:*` 前缀、`shell:open-external`）。
  - 合并进行中（`app:set-merge-running` 同步）时拦截退出：Windows 关窗先询问，Cmd+Q 等 before-quit 路径先确认。
  - 实例化主进程服务：`CnbClient`、`MergeService`。
- `electron/preload.ts`
  - 向渲染进程暴露一个最小化的 `window.ipcRenderer` 桥接层。
  - 内置监听器去重与引用计数逻辑；渲染进程与主进程的通信应继续通过这一边界完成。
- `src/main.ts`
  - Vue 渲染进程入口；挂载 `App.vue` 与 Pinia。
- `src/renderer/ipc/bridge.ts`
  - 渲染进程侧的 IPC 调用/事件封装。
  - 新增 IPC 能力时，优先扩展这里，而不是在组件或 store 中直接调用 `window.ipcRenderer`。

### 渲染进程结构

- `src/App.vue`
  - 主界面外壳，负责认证、仓库选择、源分支选择、目标分支选择以及对话框流程编排。
  - 三列列表的过滤输入统一用 `FilterInput` 组件（内部即时回显、对外防抖发值）：1200 仓库 / 900 分支全量渲染下，过滤按键不应触发 App 整体重渲染，新增输入类交互时沿用该组件。
  - 深色模式跟随系统：`matchMedia(prefers-color-scheme: dark)` 驱动 naive `darkTheme`。注意 App.vue 是 `n-config-provider` 的父级，其 `useThemeVars` 注入不到自身（始终是浅色默认值）——内联样式取主题变量时用 `isDark ? darkTheme.common : themeVars`，新增样式沿用该模式。
  - 注意 App.vue 是 n-config-provider 的父级这一结构是历史决定，若后续重构应把内容下沉为 provider 的子组件，让 `useThemeVars` 正常注入。
- Pinia stores 承担大部分渲染层状态：
  - `src/renderer/store/auth.ts` — CNB 认证（网页登录 Cookie / 访问令牌双模式，可切换账号、退出登录），本地持久化设置（localStorage key `cnb-auth`）、E2E 认证绕过；登录过期时经 `cnb:auth-expired` 事件弹出"是否重新登录"确认框，同意后自动弹出 CNB 登录窗口（`confirmRelogin` → 强制全新网页登录）。
  - `src/renderer/store/projects.ts` — 仓库列表、分支列表与选择状态（仓库以完整路径字符串 `org/repo` 标识，存于 `selectedRepo`），含仓库置顶状态与服务端双向同步；分支走"快速路径 + 后台排序"两段加载，`applySortedBranches` 接收主进程 `cnb:branches-sorted` 推送平滑更新；**上次会话现场持久化**（localStorage key `cnb-last-project`：repo/name/sourceBranch）——`loadProjects` 完成后自动恢复上次仓库（仓库仍在列表中才恢复）、分支加载后恢复上次源分支（`chooseSourceBranch` 统一记录源分支选择并持久化），配合 merge store 的目标分支记忆实现"关窗重开一切都在"。
  - `src/renderer/store/merge.ts` — 目标分支选择（按仓库记忆上次选择并持久化，切换仓库自动恢复；分支集合仅顺序变化时保留当前选择；**仓库切换时强制走恢复分支**，防止新旧仓库分支集合恰好相同时跳过恢复）、批量合并运行状态、流式日志、完成后系统通知（主窗口聚焦时跳过）、合并历史记录（localStorage key `cnb-merge-history`，最近 20 次，确认弹窗展示当前仓库的上次合并与最近记录）。
- 共享类型位于：
  - `src/shared/cnb/types.ts`
  - `src/renderer/ipc/types.ts`

### CNB 集成与合并编排

- `src/main/services/cnbClient.ts`
  - CNB Open API（https://api.cnb.cool/）HTTP 访问的唯一入口。
  - 认证方式：令牌模式用 `Authorization: Bearer <token>`；网页登录模式用 Cookie 会话（`setCookieAuth` 注入，置顶写回必须走 Cookie）。
  - 封装：用户信息（`GET /user`）、仓库列表（`GET /user/repos?role=Developer`，分页，含 `pinned`/`pinned_time`）、分支列表（`getBranchesFriendly` 为快速路径仅拉列表，按提交时间排序由 `getBranchesSortedByCommitTime` 后台完成）、分支比较（无变更预检）、PR 的创建/查询/合并/关闭（按源+目标查找已存在 open PR）、仓库置顶写回（`setRepoPinned`，走 `cnb.cool/user/dashboard/pinned-stars/` 网页接口）。
  - 仓库路径会逐段 URL 编码（支持多级组织 `a/b/c`）。
  - 内含重试/退避逻辑（429/5xx）；axios 实例统一 `Accept: application/json` 头与 `proxy: false`，勿移除。
  - 登录过期探测：响应拦截器捕获业务请求 401 → 延迟复核 `GET /user`，确认失效触发 `onAuthExpired`（一次过期只触发一次，set-auth 成功后重置）；带 `_authVerify` 标记的凭证校验请求自身 401 不触发（手动连接/静默重连属正常业务错误）。`getBranchesFriendly` 的权威诊断（/user 复核失败）也会直接触发。
- `src/main/services/updateChecker.ts`
  - 检查 GitHub `releases/latest` 是否有新版本（语义化版本比较；直连失败后走环境代理重试）。
  - 主进程启动 3 秒后首次检查，之后每 6 小时一次；结果经 `cnb:update-status` 推送渲染层，仅提示不强制更新。
- `src/main/services/updateInstaller.ts`
  - 应用内更新（手写轻量方案，不用 electron-updater：portable exe 不支持其自动替换、macOS 未签名不可用 Squirrel）。
  - 下载：按平台从 Release assets 匹配 `CNB-Tools.exe/.dmg`，axios stream 下载 + 进度推送（`cnb:update-download`），GitHub asset sha256 digest 校验完整性；Windows 优先下载到 exe 同目录（`PORTABLE_EXECUTABLE_DIR`），不可写降级下载目录。
  - 安装 Windows：生成纯 ASCII 替换脚本（`%~dp0` 引用自身目录规避中文路径编码问题）等旧进程退出后 move 覆盖 + 重启；目录不可写抛错由调用方降级。
  - 安装 macOS：`resolveMacInstallDir` 静默决策安装目录（原地可替换则原地；从 dmg 内/转译路径运行或目录不可写时自动搬装到 `/Applications`，失败退 `~/Applications`，全不可写才抛错）→ `hdiutil attach` → `replaceMacApp`（复制 .app 为临时名 → 双 rename 原子替换，目标无旧版跳过备份；旧版保留 `.old` 供回滚，换入失败自动回滚原位）→ 清 quarantine → 删 dmg → 延迟 `open` 新版；搬装成功经主进程发系统通知；启动时 `cleanupMacOldBundle` 清理上次备份。
- `src/main/services/mergeService.ts`
  - 很薄的一层入口，实际逻辑委托给 merge strategy。
- `src/main/services/mergeStrategies/merge.ts`
  - 批量合并的核心流程（每个目标分支独立处理，互不影响）：
    1. `source === target` 或比较无新提交 → 跳过（noop）。
    2. 为每个源/目标分支对创建 PR，或复用已存在的同源同目标 open PR。
    3. 轮询 PR 的 `mergeable_state` / `blocked_on`：
       - `mergeable` → 直接调用合并接口。
       - `conflict` / `blocked_on=code_conflict` / `no-merge-base` → **跳过该分支并关闭（取消）PR**，记入 conflicts。
       - `state=merged` → 视为成功（可能被手动合并）。
    4. 全部处理完后汇总日志与结果：merged / conflicts / noop / failures。
  - 结果 `MergeResult.ok` 仅在没有任何冲突与失败时为 true。

### 事件 / 数据流

典型流程如下：

1. Vue/Pinia 触发操作。
2. `src/renderer/ipc/bridge.ts` 发起 IPC 调用（`cnb:*`）。
3. `electron/main.ts` 将请求分发到主进程服务。
4. 服务调用 CNB Open API。
5. 主进程将进度事件（`cnb:batch-merge-log`）回传给渲染进程。另有主动推送：`cnb:branches-sorted`（后台分支排序完成）、`cnb:auth-expired`（登录过期）、`cnb:update-status`（更新检查）。
6. 渲染进程中的 store / 组件更新 UI（确认弹窗实时日志、结果弹窗分支明细）。

## 测试与 E2E 行为

- `vitest.config.ts` 使用 `jsdom`，并且只包含 `tests/**/*.test.ts`。
- `playwright.config.ts` 通过 `vite.e2e.config.ts` 启动一个普通的 Vite 服务，地址为 `http://127.0.0.1:4173`。
- E2E 模式是由 store 驱动的，不依赖真实 CNB：
  - `src/renderer/store/auth.ts`
  - `src/renderer/store/projects.ts`
  - `src/renderer/store/merge.ts`
- 当 `VITE_E2E=1` 或 `MODE=e2e` 时，这些 store 会用可预测的假数据和进度日志替代真实的认证 / 仓库 / 分支 / 合并行为。修改 store 逻辑时必须保留这些分支，否则 Playwright 覆盖会失效。

## 发版流程（触发词："发版"）

当用户说"发版"（可附带版本号，如"发版 1.1.0"；未附带时默认递增 patch 位）时，**先判断本次变更是否需要打包更新**，再走对应路径：

### 轻量路径：不需要打包更新

适用：变更仅为文档（README.md / AGENTS.md）、代码注释、纯格式化、不影响应用运行行为与打包产物的工程配置等。判断标准：已发布的 exe/dmg 是否因此过时——不会过时就走轻量路径。

直接执行，随后结束（不递增版本号、不打 tag、不打包、不更新 Release）：

1. 按惯例提交到 fix 分支并 `git push origin fix`。
2. `git checkout master && git merge fix --ff-only && git push origin master && git checkout fix`。
3. 向用户报告已同步 master。

### 完整路径：需要打包更新

适用：应用代码（主进程/渲染进程/服务）、依赖版本、影响产物的构建配置等任何会让已发布包过时的变更。按以下顺序执行：

1. **前置检查**：
   - `git status` 确认工作区干净；有未提交改动则先按惯例提交（fix 分支）。
   - `pnpm check`（typecheck + 全部测试）必须全绿，失败则中止发版并报告。
2. **检查 README**：对照本次版本的全部变更，判断是否需要更新 `README.md`：
   - **需要更新**：新增功能；用户可感知的功能调整或体验优化（如操作方式、界面布局、交互流程变化）；使用前提或依赖方式变化（如认证方式、打包产物形态）。
   - **不需要更新**：纯内部重构、性能优化（用户无感知）、测试与工程配置、依赖升级、文案微调。
   - 拿不准时倾向更新（README 面向使用者，宁可多说明一句）。需要更新则先改 README 并随本次发版提交一并入库，再继续后续步骤。
3. **递进版本号**：修改 `package.json` 的 `version`（唯一版本来源），提交（`chore: release v{X.Y.Z}`）。
4. **同步远程**：`git push origin fix` → `git checkout master && git merge fix --ff-only && git push origin master && git checkout fix`。
5. **打 tag**：annotated 标签 `v{X.Y.Z}`（附中文版本说明，列出主要功能与修复），`git push origin v{X.Y.Z}`。**若 tag 已存在，中止并询问用户，不得覆盖**。
6. **打包**：完整构建 mac dmg 与 Windows 便携 exe（单文件，无安装包）。沙盒环境下必须剥离钩子与代理变量：
   ```sh
   env -u CODEBUDDY_BROKERED_FS_HOOK_ENABLED -u NODE_OPTIONS -u BASH_ENV -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy -u ALL_PROXY -u all_proxy \
     ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
     sh -c 'pnpm build && npx electron-builder && npx electron-builder --win --x64'
   ```
   产物在 `release/{version}/`：`CNB-Tools.dmg`、`CNB-Tools.exe`（artifactName = `${productName}.${ext}`，不含平台/版本，版本体现在目录与 Release/tag 上）。
7. **创建/更新 Release 并上传**：
   - 令牌从项目根目录 `.env.local` 读取（`GITHUB_TOKEN`），仓库地址读 `GITHUB_REPO`。**不要在命令行参数、日志或对话中明文输出令牌**；用 `export GH_TOKEN=$(grep '^GITHUB_TOKEN=' .env.local | cut -d= -f2)` 方式载入。
   - 用 GitHub API 创建 Release（`POST /repos/{repo}/releases`，tag_name 对应版本）。**Release name 只用版本号本身（如 `v1.0.1`），不带工具名称**；body 用中文写功能/修复摘要。
   - 逐个 `POST https://uploads.github.com/repos/{repo}/releases/{id}/assets?name=...` 上传产物（`Content-Type: application/octet-stream`，`--data-binary @文件`）。
   - **同版本 Release 已存在时**：更新它——复用已有 release id，删除同名旧资产后重新上传，并追加更新说明。
   - 上传后调 `GET /repos/{repo}/releases/latest` 比对资产 `size` 与本地字节数，必须完全一致才算成功。
8. **收尾**：向用户报告 Release 链接（`https://github.com/{repo}/releases/tag/v{X.Y.Z}`）与资产清单；提醒可在 GitHub 设置中轮换令牌。

### 令牌文件 `.env.local`

- 位置：项目根目录 `.env.local`，**已被 `.gitignore` 忽略，严禁提交、严禁粘贴到对话或复制到其他文件**。
- 内容：`GITHUB_TOKEN=<GitHub fine-grained PAT>`（需 Contents 读写权限）、`GITHUB_REPO=<owner/repo>`。
- 令牌失效（API 返回 401/403）时，提示用户到 GitHub → Settings → Developer settings → Fine-grained tokens 重新生成并更新该文件，不要把新令牌写进代码或提交。
- 新同事/新环境：复制本文件格式自行创建，该文件不入库。

## 需要保留的仓库约定

- 该包使用 ESM（`"type": "module"`）。需要 CommonJS 的配置文件应保持 `.cjs` 形式，例如 `.eslintrc.cjs`。
- Naive UI 必须保持“原生”用法。测试已经在 Vue 模板层面强制此约束：
  - 不要直接给 `n-*` 组件添加 `class`、`style` 或 `size` 属性。
  - 不要在 `n-config-provider` 上设置 `theme-overrides`、`cls-prefix`、`namespace` 或 `breakpoints`。
  - 如需定制样式，使用外层包装元素与周边 CSS，而不是直接修改 Naive UI 组件。
- 继续统一从 `src/renderer/ui/naive.ts` 导入 Naive UI，不要把 `naive-ui` 的直接导入分散到各处。
- `App.vue` 已经较大。新增功能时，优先把逻辑下沉到 store、service 或更小的子组件中，不要继续往这个文件塞无关职责。
- 构建产物位于 `dist/` 和 `dist-electron/`。打包后的 Electron 主入口是 `dist-electron/main.js`。

## 历史迁移说明

- 本项目早期版本面向 GitLab（数字 projectId + PRIVATE-TOKEN），并内置冲突解决弹窗（ConflictDialog）与本地 git 冲突检测（localGitConflictService）。
- v2.1 起迁移到 CNB：仓库以路径字符串标识，认证改为 Bearer Token；应用内冲突解决流程已整体移除，改为“冲突 → 跳过并取消 PR”的独立处理策略。相关旧组件与测试已删除，不要恢复它们。
