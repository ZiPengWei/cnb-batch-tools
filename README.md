# CNB 批量合并工具 (CNB Batch Merge Tool)

这是一个基于 **Electron** + **Vue 3** 构建的桌面应用程序，旨在帮助开发者高效地在 [CNB (cnb.cool)](https://cnb.cool) 仓库中执行多分支批量合并操作，简化发布流程中的分支管理。

## ✨ 主要特性

- **可视化操作界面**: 提供直观的源分支与目标分支选择界面，支持模糊搜索，快速定位分支。
- **网页账号登录（免令牌）**: 默认使用网页账号登录，应用内嵌 CNB 登录窗（自动唤起微信扫码），无需手动创建令牌；登录会话自动持久保存，下次启动免登录。
- **访问令牌（可选）**: 也支持 CNB 访问令牌（Access Token）鉴权，可在"网页登录 / 访问令牌"之间一键切换；支持切换账号与退出登录。
- **仓库置顶双向同步**: 仓库列表支持 📌 置顶/取消置顶，操作实时写回 CNB 服务端，与 CNB 网页端置顶状态自动同步。
- **源分支按提交时间排序**: 源分支列表按最近提交时间倒序排列，最新活跃分支一目了然。
- **智能分支管理**:
  - 自动识别并置顶核心环境分支（如 `dev`, `test`, `gray`）。
  - 支持多选目标分支、全选当前筛选结果与一键清空，一次性将代码合并到多个环境。
- **清晰的操作与结果反馈**:
  - 底部操作栏实时汇总当前仓库、源分支与目标分支，合并前可核对完整目标列表。
  - 合并结果按成功、冲突、失败、无变更分类汇总，重点展示冲突与失败，成功明细和日志可折叠查看。
- **独立批量合并**: 每个目标分支独立处理，互不影响：
  - 无变更 → 自动跳过。
  - **检测到冲突 → 跳过该分支并自动取消（关闭）对应 PR**。
  - 无冲突 → 直接合并。
  - 结束后汇总提示：哪些分支冲突、哪些分支成功合并。
- **实时日志反馈**: 在合并过程中实时展示操作日志，方便追踪进度和排查错误。
- **自动检查更新**: 应用启动后自动检查 GitHub 最新 Release，有新版本时版本号旁显示红点角标并提示下载地址；仅提示、不强制更新。

## 🛠️ 技术栈

本项目采用现代化的前端与桌面开发技术栈：

- **核心框架**: [Vue 3](https://vuejs.org/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)
- **桌面容器**: [Electron](https://www.electronjs.org/)
- **状态管理**: [Pinia](https://pinia.vuejs.org/)
- **单元测试**: [Vitest](https://vitest.dev/)

## 🚀 开发环境设置

### 前置要求

- **Node.js**: 建议版本 v18 或更高
- **包管理器**: 推荐使用 [pnpm](https://pnpm.io/) (本项目使用 `pnpm` 进行依赖管理)

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动开发模式

此命令将同时启动 Vite 开发服务器和 Electron 应用窗口，支持热更新。

```bash
pnpm dev
```

### 3. 构建应用

构建生产环境的发布包：macOS 为 `.dmg`，Windows 为**单文件便携 `.exe`**（无需安装，下载即用）。

```bash
pnpm build
```

产物输出至 `release/{version}/`：`CNB-Tools.dmg`、`CNB-Tools.exe`（文件名不含平台与版本号，版本体现在输出目录与 Release 上）。

### 4. 运行测试

运行单元测试以确保功能正常。

```bash
pnpm test
```

### 5. ESLint（Airbnb Base + Vue）

本项目使用 ESLint 做静态检查，规则集以 Airbnb JavaScript Base 为基础，并叠加 Vue 3 推荐规则与部分模板最佳实践规则。

```bash
pnpm lint
pnpm lint:fix
pnpm check
```

配置文件说明：

- 由于本项目 `package.json` 设置了 `"type": "module"`，ESLint 传统配置文件使用 `.eslintrc.cjs`（而不是 `.eslintrc.js`）以避免 ESM/CJS 加载冲突。

规则定制决策（与现有代码风格兼容）：

- `quotes` / `semi` 关闭：当前项目存在单双引号与分号风格混用，避免首次引入 ESLint 造成大面积改动。
- `import/no-unresolved` 关闭：在 TS + Vue SFC + bundler 模式下，解析 `.vue` 与部分构建期路径时更适合交给 TypeScript/Vite 处理，避免误报。
- `no-underscore-dangle` 关闭：Electron 主进程中使用 `__dirname` 等写法较常见。
- `vue/multi-word-component-names` 关闭：允许 `App` 等单词组件名。

IDE/编辑器建议（以 VS Code 为例）：

- 安装扩展：ESLint（dbaeumer.vscode-eslint）
- 启用保存自动修复（用户/工作区设置均可）：

```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.validate": ["javascript", "typescript", "vue"]
}
```

开发集成：

- `pnpm dev` 会通过 Vite 插件在开发过程中执行 ESLint 检查并输出问题（终端/覆盖层提示）。

## 📖 使用指南

1.  **登录 CNB 账号（默认网页登录）**: 启动应用后默认为"网页登录"模式，点击登录按钮会打开 CNB 登录窗（自动唤起微信扫码），登录成功后自动返回应用，会话自动记住。
2.  **选择仓库**: 从列表中选择您要操作的仓库（以完整路径展示，如 `org/repo`）。
3.  **置顶仓库（可选）**: 点击仓库行右侧的 📌 可置顶/取消置顶，操作会与 CNB 网页端双向同步。
4.  **选择源分支**: 在左侧面板选择包含新代码的源分支（Source Branch），列表按最近提交时间倒序排列。
5.  **选择目标分支**: 在右侧面板点击一个或多个需要合并到的目标分支（Target Branches），也可使用“全选当前”选择当前筛选结果，或点击“清空”重新选择。
6.  **执行合并**: 在底部操作栏核对仓库、源分支与目标分支摘要，点击“合并”按钮，并在确认弹窗中核对完整目标列表后执行。
7.  **查看结果**: 合并结束后会弹出结果窗口，顶部分类汇总数量，默认展开冲突与失败明细，成功、无变更明细及操作日志可展开查看：
    - ✓ 成功合并的分支
    - ✗ 存在冲突被跳过（PR 已自动取消）的分支
    - 失败/无变更的分支及原因

例如：`fix-1` 分支同时合并到 `dev` 和 `test`，若 `dev` 存在冲突，则跳过 `dev` 并取消其 PR，`test` 无冲突则直接合并；最终提示“存在冲突已跳过的分支: fix-1 -> dev”、“成功合并的分支: fix-1 -> test”。

### 访问令牌方式（可选）

若不便使用网页登录，可在认证卡的"访问令牌"页签改用令牌鉴权：登录 [cnb.cool](https://cnb.cool) → 个人设置 → 访问令牌，创建包含以下权限的令牌：

- `account-profile:r`（验证令牌）
- `account-engage:r`（获取仓库列表）
- `repo-code:r`（获取分支、比较差异）
- `repo-pr:rw`（创建/合并/取消 PR）

两种方式可在认证卡右上角随时切换；已连接令牌的用户默认展示令牌面板。也可在此切换账号（重新拉起登录窗，切换成功前不影响当前账号信息）或退出登录。

## 📂 项目结构

```text
├── electron/        # Electron 主进程代码 (Main Process)
├── src/
│   ├── main/        # 核心业务逻辑 (CNB Client, Merge Service)
│   ├── renderer/    # 渲染进程代码 (Vue Components, Stores)
│   ├── shared/      # 前后端共享的类型定义
│   └── ...
├── tests/           # 单元测试文件
└── ...
```

## 🔌 CNB Open API 说明

应用通过 [CNB Open API](https://api.cnb.cool/) 与 CNB 交互，主要接口映射：

| 功能 | API |
|---|---|
| 验证令牌 | `GET /user` |
| 仓库列表 | `GET /user/repos?role=Developer`（分页） |
| 分支列表 | `GET /{repo}/-/git/branches`（分页） |
| 无变更预检 | `GET /{repo}/-/git/compare/{base...head}` |
| 创建 PR | `POST /{repo}/-/pulls` |
| 查询 PR（含冲突状态） | `GET /{repo}/-/pulls/{number}` |
| 查询已存在 PR | `GET /{repo}/-/pulls?state=open&base_ref=...` |
| 合并 PR | `PUT /{repo}/-/pulls/{number}/merge` |
| 取消（关闭）PR | `PATCH /{repo}/-/pulls/{number}` `{state: closed}` |
| 仓库置顶（读） | `GET /user/repos` 返回 `pinned` / `pinned_time` 字段 |
| 仓库置顶（写回） | `POST/DELETE https://cnb.cool/user/dashboard/pinned-stars/{repo}`（需网页会话 Cookie 认证） |

冲突判定基于 PR 的 `mergeable_state`（`conflict`）与 `blocked_on`（`code_conflict`）字段。

## 🎨 UI 规范：Naive UI 组件保持原生

- 禁止通过 `theme-overrides` / `cls-prefix` / `namespace` 等全局配置改变组件样式或类名前缀。
- 禁止在任意 `n-*` 组件上使用 `class` / `style` / `size` 等会改变表现的属性。
- 如必须定制，仅允许使用 Naive UI 官方提供的 props 或主题配置，并确保视觉与交互保持原生一致。
- 自动检查：运行 `pnpm test`（或 `pnpm check`）会包含使用规范检查用例，确保没有遗漏。
- 代码审查要点：Review 时重点检查新增/修改的 `n-*` 组件是否引入了额外样式或非默认配置。

## 布局与排版（黄金比例基准）

- 以 φ=1.618 作为间距与圆角的比例基准，使用 9/15/24/39px 作为主要间距梯度。
- 主容器最大宽度约 1618px（≈ 1000 × φ），在大屏下保持视觉密度稳定。
- 列表类文本默认允许自动换行，不使用省略号；通过更大的行高与轻微字间距提升可读性。

## 🖼️ 对比截图获取方式（优化前/后）

- 本项目为 Electron 应用，截图需在本机 GUI 环境中完成。
- 建议流程：先在改动前启动应用并截取主界面；应用改动后再次截取相同窗口尺寸的主界面，用于对比。
- 启动命令：`pnpm dev`，macOS 可用系统截图工具或 `⌘ + Shift + 4` 获取指定区域截图。

## License

[MIT](LICENSE)
