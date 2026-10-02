# dsh-plugin-topology（显示名：插件星图 / Plugin Star Map）

Web UI 插件星图：在 Harness 页面里实时展示插件之间的依赖关系、每个插件 fiber 的状态，并可点击查看详情。

> 包名 `dsh-plugin-topology` 是安装身份（`cordis.patch.yml` 里那一行的 `name` 必须与它一致），用户可见的名称由 `package.json` 的 `dsh.meta`、`locale/*.json` 与 `client.js` 的字典决定（面板标题「插件星图」、侧边栏「星图」）。

## 它显示什么

- **组成关系（一定会画出来）**：来自 `remote.pluginManager.listBundles()` / `listPlugins()`——和「插件页」用的是同一个接口，所以不依赖任何浏览器内部量：bundle 节点 → 它包含的插件行（点线），插件行带 Host fiber 阶段。
- **浏览器平面**：页面插件表的组成图。节点来自 `ctx.modules`（`window.__DSH_BOOT__` 的同一份清单）+ 页面 Loader 的实时 entry；边来自
  - 实线：`dsh.client.inject` / `dsh.client.external` 声明的包依赖（谁依赖谁）；
  - 虚线：`fiber.inject` 声明的服务依赖，解析到当前提供该服务的插件。
- **Host 平面**：`remote.pluginInventory` 报告的 Host 插件条目与 fiber 阶段，按网格排列。
- **fiber 状态**：直接读 Cordis `FiberState`（active / loading / pending / unloading / failed / disposed），`internal/status` 与 `internal/plugin` 事件触发重绘，因此是实时的，不是打开时的快照。
- **点击节点**：右侧详情面板给出 entry id、fiber uid、图修订号、Host 同包条目、提供的能力、依赖的能力（含“未解析”标记）、依赖的插件与被依赖的插件，均可点击跳转。
- **自检**：图里没有任何依赖边时，顶部显示黄色横幅说明是哪个数据源没读到；详情面板的「数据源自检」列出每个来源的读数（Loader 条目 / 有 fiber 的行 / 有 inject 的行 / 启动图行数 / Cordis 服务数 / 各类边数）。

## 取舍

插件数量多（本机 190+ 个 Host 条目、40+ 个 Web 插件行），因此：

1. 三个平面（组成 / 浏览器 / Host）各有开关，默认都打开；只看 Host 平面时它是一堆孤点，会自动排成网格。
2. 节点按依赖深度分列、列内用重心法减少交叉、不连通的部分各自成块，孤点自动排成网格。
3. 状态标签是**单选筛选**（不是复选框）：点 `已激活` 就只看已激活，点 `全部` 恢复；再点一次同一个标签也恢复。窗口标题处显示"显示 N / 共 M 个插件"，筛选生效时一眼可见。
4. 视图在**关系图 / 表格**之间切换，当前视图在分段控件里以实心片表示。
5. 选中节点时其余节点变暗、相连的边高亮，便于在密集图里追踪一条链路。

## 已知限制

- **拖动时的拖影**：视口已改为直写 DOM transform、图内容用 `React.memo` 隔离，但 canvas 未做合成层提升（`will-change: transform` / `contain: paint`），极快的拖动仍可能有轻微拖尾。
- **孤点默认不画**：没有任何依赖边的插件（多为 Host 侧条目）默认不进入画面，列在右侧「无依赖的插件」里，可用「孤立」开关打开。
- **Host 平面没有依赖边**：`pluginInventory` 只暴露 `moduleName` / `fiberPhase`，不含 `inject`，所以 Host 侧只呈现条目与状态，不画 Host 内部依赖。
- **状态标签只覆盖活着的插件**：被卸载的插件不在任何快照里，所以没有"已销毁"计数——它的语义是"条目消失"，不是计数变化。

## 文件

| 文件 | 作用 |
|---|---|
| `package.json` | bundle 清单：`dsh.bundle.patch`、`dsh.client`（platform web，`immediately`）、显示元数据与图标 |
| `cordis.patch.yml` | 插入 Host 行 `plugin-topology`（Host 半边不做别的事，它让 bundle 的浏览器半边进入启动图） |
| `index.js` | Host 半边：空 `apply`，仅为占位 |
| `client.js` | **唯一的浏览器半边模块**：模型（Loader / 启动图 / Host 清单 / 插件组成）、布局（分列 / 重心 / 分块 / 网格）、React 视图（工具栏 / SVG 关系图 / 表格 / 详情）、中英文字典、主面板与侧边栏注册，全部内联 |
| `icon.svg` | 插件图标 |
| `locale/*.json` | 与 `dsh.meta` 相同的显示文本，供按约定读取 `locale/<lang>.json` 的元数据读取器使用 |

> 为什么是单文件：页面模块表只按 `/plugins/<包名>/client.<name>.js` 这个形状提供包内 chunk，而**任何一个 chunk 取不到，面板就什么都渲染不出来**（只能停在「正在读取实时插件图…」）。所以模型、布局、视图全部内联进 `client.js`，把这条链路的风险降为零。`client.graph.js` / `client.view.js` / `graph.js` / `view.js` 是历史遗留文件，已清空为说明头，不参与构建。

## 数据来源与 API

全部使用已发布接口，未导入任何 Harness Client 包：

- `ctx.get('loader').entries()` → `{ id, options.name, disabled, fiber: { state, inject, uid } }`
- `ctx.get('modules').manifest` → `{ rev, modules: [{ id, inject, external }] }`（回退：`globalThis.__DSH_BOOT__`）
- `ctx.get('remote').pluginInventory.list()` → Host 每个条目的 `{ entryId, moduleName, meta, enabled, fiberPhase }`
- `ctx.get('remote').pluginManager.listBundles()` / `listPlugins()` → bundle → 插件行 的组成关系（**不依赖任何浏览器内部量**，保证一定有边）
- `ctx.get('locale')`、`ctx.get('layout')`、`ctx.get('remote').$on('plugin-manager/changed')`
- `ctx.reflect.store` → 服务名到实现 fiber 的映射，用于把服务依赖连成边

## 安装

### 本地目录（开发时）

```
dsh plugin add /绝对路径/to/dsh-plugin-topology
```

或在会话里让 Agent 用 `plugin_manager` 的 `install_bundle`，`target` 传**绝对路径**。

### 从 GitHub 安装

`install_bundle` 接受 pnpm 认得的所有包形式，git 仓库可以直接装（`github:` 简写、`https://github.com/<用户>/<仓库>` 都可以）：

```
dsh plugin add github:<你的用户名>/<仓库名>
```

**建议锁定提交，而不是跟踪分支**，否则你以后推送会让所有人被动升级：

```
dsh plugin add github:<你的用户名>/<仓库名>#<commit-sha>
```

> 注意：git 形式装的是**仓库根**的 `package.json`，所以**插件必须放在仓库根目录**（本仓库就是这种布局）。如果把插件放进子目录（monorepo），从 git 装就找不到它，需要改走 npm 发布或本地路径。

### 卸载

```
dsh plugin remove dsh-plugin-topology     # 名字以 package.json 的 name 为准
```

## 打包发布到 npm（可选）

想让人 `dsh plugin add dsh-plugin-topology` 直接装，才需要发布到 npm：

1. `name` 是 `dsh-plugin-topology`，发布前先确认它在 npm 上可用（`npm view dsh-plugin-topology version` 报 404 就是可用）；若已被占用，改成 `@<你的用户名>/dsh-plugin-topology` 这类带 scope 的名字，并同步改 `cordis.patch.yml` 里的 `name`；
2. 去掉 `"private": true`；
3. 确认 `files` 列表包含运行所需的全部文件（本包：`index.js`、`client.js`、`icon.svg`、`cordis.patch.yml`、`locale/*.json`）；
4. 登录并发布：

```
npm login
npm publish --access public
```

5. **注意**：改名后已装的 profile 仍按旧名索引，需要重新安装一次（`dsh plugin remove <旧名>` → `dsh plugin add <新名>`）。

### 版本兼容性（发布前必看）

安装时 DSH 会检查 `peerDependencies` 里所有 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` 的版本范围，**不满足就直接拒绝安装**。本包刻意不声明这类 peer 依赖（只依赖已发布的 Remote 与 Slot 接口），所以任何 DSH 版本都能装。

如果以后要声明，请用宽范围（例如 `">=0.2.0-rc.2"`）或 `workspace:*`，不要写死精确版本。

## 卸载与清理

卸载会移除 profile 里的 bundle 选择与依赖；插件产生的数据都在 profile 内，删除插件本身不会动你的会话记录。
