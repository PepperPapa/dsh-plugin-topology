/**
 * Browser half of `dsh-plugin-topology`: the live plugin topology page.
 *
 * One self-contained module on purpose. The page's module table serves
 * package-local chunks only under `client.<name>.js` URLs it can resolve, and a
 * chunk that fails to arrive leaves the panel with nothing to render, so the
 * model, the layout, and the React view all live in this single bundle that the
 * boot graph already loads.
 *
 * The page owns two surfaces: a main-column panel registered under the
 * `topology` key, and the matching `sidebar.panellist` row that selects it. The
 * panel merges four sources into one snapshot — the live client Loader
 * (`ctx.loader`), the composed web-plugin graph (`ctx.modules` /
 * `__DSH_BOOT__`), the Host plugin inventory (`remote.pluginInventory`), and the
 * plugin manager's bundle -> row composition (`remote.pluginManager`) — and
 * republishes it whenever a fiber changes state, an entry is added or removed,
 * or the Host reports a composition change.
 */

window.__ModuleLoader__.load({
  id: 'dsh-plugin-topology',
  factory(require) {
    var React = require('react')
    var h = React.createElement
    var useEffect = React.useEffect
    var useMemo = React.useMemo
    var useRef = React.useRef
    var useState = React.useState
    var useSyncExternalStore = React.useSyncExternalStore

    /** Dictionary namespace owned by this plugin. */
    var NS = 'pluginTopology'

    /** Main panel key; also the `sidebar.panellist` row id. */
    var PANEL_ID = 'topology'

    /** Simplified Chinese dictionary. */
    var ZH = {
      'panel.title': '插件星图',
      'panel.label': '插件星图',
      'status.loading': '正在读取实时插件图…',
      'status.stalled': '数据还没准备好；点“刷新”重试，或打开插件页确认 Host 侧状态。',
      'status.failed': '读取插件图失败：{message}',
      'status.hostFailed': 'Host 插件清单读取失败，当前只展示浏览器平面。',
      'status.chunkFailed': '面板模块加载失败：{message}',
      'status.summary': '显示 {nodes} / 共 {total} 个插件 · {edges} 条依赖边 · 数据源 {source}',
      'search.placeholder': '按插件名或包名筛选',
      'view.graph': '关系图',
      'view.list': '表格',
      'view.label': '视图',
      'action.refresh': '刷新',
      'action.fit': '适应窗口',
      'action.zoomSelected': '聚焦',
      'action.zoomIn': '放大',
      'action.zoomOut': '缩小',
      'action.clear': '清除选择',
      'action.openPlugins': '插件页',
      'filter.hint': '显示或隐藏处于该状态的插件',
      'filter.all': '全部',
      'filter.allHint': '显示所有状态',
      'filter.onlyHint': '只看「{state}」',
      'legend.requires': '声明依赖',
      'legend.service': '提供能力',
      'legend.bundle': '包含插件行',
      'empty.title': '没有插件符合当前筛选条件',
      'empty.hint': '清空搜索框，或重新启用某个状态标签',
      'detail.empty': '选择一个插件',
      'detail.emptyHint': '点击关系图中的节点或表格中的行，查看该插件的 fiber、提供的能力与依赖关系。',
      'section.overview': '依赖图',
      'section.states': 'Fiber 状态',
      'section.sources': '数据源自检',
      'section.orphans': '无依赖的插件',
      'orphans.hint': '没有任何依赖边的插件（多为 Host 侧条目）。它们默认不画在图上，避免把组成关系压扁；点“孤立”开关可把它们画出来。',
      'section.host': 'Host 条目',
      'section.provides': '提供的能力',
      'section.requires': '依赖的能力',
      'section.dependsOn': '依赖的插件',
      'section.dependedBy': '被依赖的插件',
      'section.rows': '包含的插件行',
      'section.bundles': '所属 Bundle',
      'bundle.enabled': '已启用',
      'bundle.disabled': '已停用',
      'bundle.installed': '已安装',
      'bundle.optional': '可选包',
      'bundle.removable': '可移除',
      'bundle.error': '加载错误',
      'bundle.overrides': '覆盖了 {count} 个内置行',
      'bundle.expand': '展开 {count} 行',
      'bundle.collapse': '收起',
      'table.plugin': '插件',
      'table.state': '状态',
      'table.plane': '平面',
      'table.provides': '提供',
      'table.requires': '依赖',
      'table.consumers': '被依赖',
      'fact.state': 'Fiber 状态',
      'fact.plane': '所在平面',
      'fact.enabled': '已启用',
      'fact.fiber': 'Fiber uid',
      'fact.entry': 'Entry id',
      'fact.revision': '图修订号',
      'fact.graph': '图数据源',
      'fact.nodes': '节点',
      'fact.edges': '依赖边',
      'fact.declared': '已声明依赖项',
      'fact.entries': 'Loader 条目',
      'fact.fibers': '有 fiber',
      'fact.injections': '有 inject',
      'fact.moduleRows': '启动图行数',
      'fact.services': 'Cordis 服务数',
      'plane.label': '平面',
      'plane.hint': '显示或隐藏该平面上的插件',
      'plane.hide': '点击隐藏这个平面',
      'plane.show': '点击显示这个平面',
      'plane.browser': '浏览器',
      'plane.host': 'Host',
      'plane.bundle': '组成',
      'plane.orphan': '孤立',
      'node.module': '静态模块',
      'node.standalone': '独立',
      'node.bundle': '属于',
      'node.orphan': '无依赖',
      'node.unresolved': '{count} 项依赖未解析',
      'warn.noNodes': '没有读到任何插件条目：ctx.loader 与启动图都没有数据（图数据源 {source}）。',
      'warn.noEdges': '读到了插件，但没有读到任何依赖边。',
      'warn.noDeclarations': '插件行的依赖声明与组成关系都为空：启动图（ctx.modules / __DSH_BOOT__）读不到，页面 fiber 的 inject 也是空的（{modules} 行启动图 / {boot} 行 __DSH_BOOT__）。',
      'warn.unresolved': '读到 {declared} 项依赖声明，但依赖目标不在本次读到的插件集合里，所以没有画出边。',
      'warn.crossPlane': '读到 {rows} 条 bundle→插件行 关系，但没有画出来（内部不一致，请反馈）。',
      'state.active': '已激活',
      'state.loading': '加载中',
      'state.pending': '等待依赖',
      'state.unloading': '卸载中',
      'state.failed': '已失败',
      'state.disposed': '已销毁',
      'state.none': '无 fiber',
      'value.none': '无',
      'value.yes': '是',
      'value.no': '否',
      'value.absent': '—',
      'value.unresolved': '未解析',
    }

    /** English dictionary. */
    var EN = {
      'panel.title': 'Plugin Star Map',
      'panel.label': 'Star map',
      'status.loading': 'Reading the live plugin graph…',
      'status.stalled': 'The graph has not materialized yet; press Refresh, or open the Plugins page to check the Host side.',
      'status.failed': 'Reading the plugin graph failed: {message}',
      'status.hostFailed': 'The Host plugin inventory could not be read, so only the browser plane is shown.',
      'status.chunkFailed': 'The panel module failed to load: {message}',
      'status.summary': 'Showing {nodes} of {total} plugins · {edges} edges · source {source}',
      'search.placeholder': 'Filter by plugin or package name',
      'view.graph': 'Graph',
      'view.list': 'Table',
      'view.label': 'View',
      'action.refresh': 'Refresh',
      'action.fit': 'Fit',
      'action.zoomSelected': 'Focus',
      'action.zoomIn': 'Zoom in',
      'action.zoomOut': 'Zoom out',
      'action.clear': 'Clear selection',
      'action.openPlugins': 'Plugins page',
      'filter.hint': 'Show or hide plugins in this state',
      'filter.all': 'All',
      'filter.allHint': 'Show every state',
      'filter.onlyHint': 'Show only {state}',
      'legend.requires': 'declares the dependency',
      'legend.service': 'provides the service',
      'legend.bundle': 'contains the plugin row',
      'empty.title': 'No plugin matches the current filter',
      'empty.hint': 'Clear the search box or re-enable a state chip',
      'detail.empty': 'Select a plugin',
      'detail.emptyHint': "Click a node in the graph or a row in the table to inspect that plugin's fiber, services, and dependencies.",
      'section.overview': 'Graph',
      'section.states': 'Fiber states',
      'section.sources': 'Data-source self check',
      'section.orphans': 'Plugins without a dependency',
      'orphans.hint': 'Plugins with no dependency edge at all (mostly Host entries). They are kept off the drawing by default so the composition stays readable; turn on the "orphan" toggle to draw them.',
      'section.host': 'Host entry',
      'section.provides': 'Provides',
      'section.requires': 'Requires',
      'section.dependsOn': 'Depends on',
      'section.dependedBy': 'Depended on by',
      'section.rows': 'Plugin rows',
      'section.bundles': 'Bundles',
      'bundle.enabled': 'enabled',
      'bundle.disabled': 'disabled',
      'bundle.installed': 'Installed',
      'bundle.optional': 'Optional',
      'bundle.removable': 'Removable',
      'bundle.error': 'Load error',
      'bundle.overrides': 'Overrides {count} built-in row(s)',
      'bundle.expand': 'show {count} rows',
      'bundle.collapse': 'collapse',
      'table.plugin': 'Plugin',
      'table.state': 'State',
      'table.plane': 'Plane',
      'table.provides': 'Provides',
      'table.requires': 'Requires',
      'table.consumers': 'Consumers',
      'fact.state': 'Fiber state',
      'fact.plane': 'Plane',
      'fact.enabled': 'Enabled',
      'fact.fiber': 'Fiber uid',
      'fact.entry': 'Entry id',
      'fact.revision': 'Graph revision',
      'fact.graph': 'Graph source',
      'fact.nodes': 'Nodes',
      'fact.edges': 'Dependency edges',
      'fact.declared': 'Declared dependencies',
      'fact.entries': 'Loader entries',
      'fact.fibers': 'with fiber',
      'fact.injections': 'with inject',
      'fact.moduleRows': 'Boot graph rows',
      'fact.services': 'Cordis services',
      'plane.label': 'Plane',
      'plane.hint': 'Show or hide the plugins of this plane',
      'plane.hide': 'Hide this plane',
      'plane.show': 'Show this plane',
      'plane.browser': 'browser',
      'plane.host': 'host',
      'plane.bundle': 'composition',
      'plane.orphan': 'orphans',
      'node.module': 'static module',
      'node.standalone': 'standalone',
      'node.bundle': 'member of',
      'node.orphan': 'no edge',
      'node.unresolved': '{count} unresolved',
      'warn.noNodes': 'No plugin entry was read: neither ctx.loader nor the boot graph answered (graph source {source}).',
      'warn.noEdges': 'Plugins were read, but no dependency edge was.',
      'warn.noDeclarations': 'Neither a dependency declaration nor a bundle composition was read: the boot graph (ctx.modules / __DSH_BOOT__) did not answer and the page fibers carry no inject map ({modules} module rows / {boot} boot rows).',
      'warn.unresolved': '{declared} dependencies were declared, but no dependency target is inside the plugin set this read produced, so no edge could be drawn.',
      'warn.crossPlane': '{rows} bundle-to-row relations were read but not drawn (internal inconsistency; please report).',
      'state.active': 'active',
      'state.loading': 'loading',
      'state.pending': 'pending',
      'state.unloading': 'unloading',
      'state.failed': 'failed',
      'state.disposed': 'disposed',
      'state.none': 'no fiber',
      'value.none': 'None',
      'value.yes': 'Yes',
      'value.no': 'No',
      'value.absent': '—',
      'value.unresolved': 'unresolved',
    }

    // ---------------------------------------------------------------------
    // Model: the live plugin graph as plain JSON.
    // ---------------------------------------------------------------------

    /** Cordis `FiberState` is a const enum, so bundles mirror its numbers. */
    var FIBER_STATE = {
      0: 'pending',
      1: 'loading',
      2: 'active',
      3: 'failed',
      4: 'disposed',
      5: 'unloading',
    }

    /** Host `PluginFiberPhase` values that may arrive instead of a number. */
    var HOST_PHASE = {
      pending: 'pending',
      loading: 'loading',
      active: 'active',
      failed: 'failed',
      unloading: 'unloading',
      disposed: 'disposed',
    }

    /**
     * Narrow a specifier to the package root the boot graph rows use as their id.
     * @param spec - `pkg`, `pkg/sub`, `@scope/pkg`, `@scope/pkg/sub`, `cordis:x`.
     * @returns the package root, or undefined for a specifier that names no row.
     */
    function packageRoot(spec) {
      if (typeof spec !== 'string' || spec.length === 0) return undefined
      if (spec.indexOf(':') !== -1) return undefined
      if (spec.charAt(0) === '.') return undefined
      if (spec.charAt(0) === '@') {
        var parts = spec.split('/')
        return parts.length < 2 || parts[1] === '' ? undefined : parts[0] + '/' + parts[1]
      }
      return spec.split('/')[0]
    }

    /** Human label for one package name: the scope is noise at this width. */
    function shortLabel(packageName) {
      var slash = packageName.lastIndexOf('/')
      return slash === -1 ? packageName : packageName.slice(slash + 1)
    }

    /** Current phase of one Cordis fiber, or null when it has none. */
    function phaseOf(fiber) {
      if (fiber === undefined || fiber === null) return null
      return FIBER_STATE[fiber.state] === undefined ? null : FIBER_STATE[fiber.state]
    }

    /** Copy the string members of an untrusted array field. */
    function textList(value) {
      if (!Array.isArray(value)) return []
      var result = []
      for (var index = 0; index < value.length; index += 1) {
        if (typeof value[index] === 'string' && result.indexOf(value[index]) === -1) result.push(value[index])
      }
      return result
    }

    /** Resolve a localized metadata field to one display string. */
    function displayText(value) {
      if (typeof value === 'string') return value
      if (value === null || typeof value !== 'object') return ''
      var preferred = ['zh', 'en']
      for (var index = 0; index < preferred.length; index += 1) {
        if (typeof value[preferred[index]] === 'string') return value[preferred[index]]
      }
      var keys = Object.keys(value)
      return keys.length === 0 ? '' : String(value[keys[0]])
    }

    /** A blank node record; every field the view reads is present. */
    function newNode(id, plane, kind) {
      return {
        id: id,
        label: shortLabel(id),
        plane: plane,
        kind: kind,
        state: null,
        hasFiber: false,
        visible: true,
        uid: null,
        entryId: null,
        rev: null,
        modules: [],
        provides: [],
        services: [],
        providers: [],
        dependencies: [],
        reverseDependencies: [],
        host: null,
        bundle: null,
        moduleName: null,
        depth: null,
        component: null,
        hasEdge: false,
        tail: false,
        x: 0,
        y: 0,
        fiber: null,
      }
    }

    /**
     * Services one fiber currently provides, read off the live reflection store.
     * @param ctx - client or host root context.
     * @param fiber - the fiber to attribute.
     * @returns service keys whose implementation belongs to that fiber.
     */
    function providedServices(ctx, fiber) {
      var reflect = ctx.reflect
      var store = reflect === undefined || reflect === null ? undefined : reflect.store
      if (store === undefined || store === null || typeof store !== 'object') return []
      var services = []
      var keys
      try {
        keys = Reflect.ownKeys(store)
      } catch (error) {
        return services
      }
      for (var index = 0; index < keys.length; index += 1) {
        var impl = store[keys[index]]
        if (impl === undefined || impl === null || impl.fiber !== fiber) continue
        if (typeof impl.name !== 'string') continue
        services.push(impl.name)
      }
      return services
    }

    /** Services a fiber has declared and is still waiting for. */
    function injectedServices(fiber) {
      if (fiber === undefined || fiber === null) return []
      var inject = fiber.inject
      if (inject === undefined || inject === null || typeof inject !== 'object') return []
      return Object.keys(inject)
    }

    /**
     * Read the composed web-plugin graph. `ctx.modules` is the authoritative
     * in-memory manifest; the raw boot global is the fallback for a page whose
     * module system has not published its service. Both carry each row's
     * `inject` and `external` package names, which are the composition edges.
     * @param ctx - client root context.
     * @returns `{ rev, rows, source }`, or undefined when neither source answers.
     */
    function readBootGraph(ctx) {
      var modules = optionalService(ctx, 'modules')
      var manifest = modules === undefined || modules === null ? undefined : modules.manifest
      if (manifest !== undefined && manifest !== null && Array.isArray(manifest.modules)) {
        var rows = []
        for (var index = 0; index < manifest.modules.length; index += 1) {
          var row = manifest.modules[index]
          if (row === null || typeof row !== 'object' || typeof row.id !== 'string') continue
          rows.push({
            id: row.id,
            rev: typeof row.rev === 'string' ? row.rev : '',
            inject: textList(row.inject),
            external: textList(row.external),
          })
        }
        return { rev: typeof manifest.rev === 'string' ? manifest.rev : '', rows: rows, source: 'ctx.modules' }
      }
      var boot = bootGlobal()
      if (boot === undefined) return undefined
      var fallback = []
      for (var at = 0; at < boot.entries.length; at += 1) {
        var entry = boot.entries[at]
        if (entry === null || typeof entry !== 'object' || typeof entry.id !== 'string') continue
        fallback.push({
          id: entry.id,
          rev: typeof entry.rev === 'string' ? entry.rev : '',
          inject: textList(entry.inject),
          external: textList(entry.external),
        })
      }
      return { rev: typeof boot.rev === 'string' ? boot.rev : '', rows: fallback, source: '__DSH_BOOT__' }
    }

    /**
     * Read the boot Loader. It is declared in this plugin's `inject`, so
     * `ctx.loader` is the documented hard-dependency read once the plugin is
     * active; `ctx.get` stays as a fallback for a composition that provides the
     * key without the declaration.
     * @param ctx - client root context.
     * @returns the Loader, or undefined when this composition has none.
     */
    function clientLoader(ctx) {
      var declared
      try {
        declared = ctx.loader
      } catch (error) {
        declared = undefined
      }
      if (declared !== undefined && declared !== null && typeof declared.entries === 'function') return declared
      return optionalService(ctx, 'loader')
    }

    /**
     * Probe every source the model reads, so a graph without edges can say
     * which source went missing instead of looking merely empty.
     * @param ctx - client root context.
     * @returns plain-JSON facts about each source.
     */
    function probe(ctx) {
      var loader = clientLoader(ctx)
      var entryCount = 0
      var withFiber = 0
      var withInject = 0
      if (loader !== undefined && loader !== null && typeof loader.entries === 'function') {
        var iterator = loader.entries()
        for (var step = iterator.next(); step.done !== true; step = iterator.next()) {
          var entry = step.value
          if (entry === undefined || entry === null || !entry.options) continue
          entryCount += 1
          if (entry.fiber !== undefined && entry.fiber !== null) {
            withFiber += 1
            if (injectedServices(entry.fiber).length > 0) withInject += 1
          }
        }
      }
      var modules = optionalService(ctx, 'modules')
      var manifest = modules === undefined || modules === null ? undefined : modules.manifest
      var moduleRows = manifest !== undefined && manifest !== null && Array.isArray(manifest.modules)
        ? manifest.modules.length
        : 0
      var boot = bootGlobal()
      var bootRows = boot === undefined ? 0 : boot.entries.length
      var reflect = ctx.reflect
      var serviceCount = reflect !== undefined && reflect !== null
        && reflect.store !== undefined && reflect.store !== null
        ? Reflect.ownKeys(reflect.store).length
        : 0
      return {
        loaderAvailable: loader !== undefined && loader !== null,
        entryCount: entryCount,
        entriesWithFiber: withFiber,
        entriesWithInject: withInject,
        modulesAvailable: moduleRows > 0,
        moduleRows: moduleRows,
        bootRows: bootRows,
        serviceCount: serviceCount,
        inventoryAvailable: optionalService(ctx, 'remote.pluginInventory') !== undefined,
        managerAvailable: optionalService(ctx, 'remote.pluginManager') !== undefined,
      }
    }

    /**
     * Read the page's boot graph global defensively. It is injected as a head
     * script before the shell, so it is normally present; a page that mounted
     * the plugin outside the web shell simply has none.
     * @returns `{ entries }` when the global carries an entry array.
     */
    function bootGlobal() {
      var boot
      try {
        boot = globalThis.__DSH_BOOT__
      } catch (error) {
        return undefined
      }
      if (boot === null || typeof boot !== 'object' || !Array.isArray(boot.entries)) return undefined
      return boot
    }

    /**
     * Compose the topology model the view renders.
     *
     * Four sources meet here, and the model keeps whichever answered:
     * `ctx.modules` / `__DSH_BOOT__` give the web plane's declared package
     * edges, the live Loader gives each web plugin's fiber, the Host inventory
     * gives every Host entry's fiber phase, and the plugin manager gives the
     * bundle -> plugin-row composition the Plugins page itself is built on.
     * That last one needs nothing but the Remote, so the graph still shows real
     * edges on a page whose boot global and fiber inject maps are unavailable.
     *
     * @param ctx - client root context.
     * @param hostEntries - `remote.pluginInventory.list()` rows, or undefined.
     * @param composition - `{ bundles, plugins }` from the plugin manager, or undefined.
     * @returns a plain-JSON snapshot; every reference inside it is fresh.
     */
    function buildSnapshot(ctx, hostEntries, composition) {
      try {
        return composeSnapshot(ctx, hostEntries, composition)
      } catch (error) {
        // A throwing read must not leave the panel with nothing: publish an
        // empty snapshot that carries the reason, so the view can show it.
        var reason = error instanceof Error ? error.message : String(error)
        return {
          rev: 'failed',
          graphSource: 'failed',
          capturedAt: Date.now(),
          nodes: [],
          edges: [],
          counts: { active: 0, pending: 0, loading: 0, failed: 0, unloading: 0, disposed: 0, none: 0 },
          box: { width: 56, height: 56, nodeWidth: 176, nodeHeight: 42 },
          diagnostics: { nodeCount: 0, bundleRows: 0, bundles: 0, declaredDependencies: 0, moduleRows: 0, bootRows: 0, entryCount: 0, entriesWithFiber: 0, entriesWithInject: 0, serviceCount: 0, packageEdges: 0, serviceEdges: 0, bundleEdges: 0, loaderAvailable: false, modulesAvailable: false, inventoryAvailable: false, managerAvailable: false },
          failure: reason,
          browserRows: 0,
          hostRows: 0,
        }
      }
    }

    /**
     * Compose the topology model from the sources that answer.
     * @param ctx - client root context.
     * @param hostEntries - `remote.pluginInventory.list()` rows, or undefined.
     * @param composition - `{ bundles, plugins }` from the plugin manager, or undefined.
     * @returns a plain-JSON snapshot; every reference inside it is fresh.
     */
    function composeSnapshot(ctx, hostEntries, composition) {
      var graph = readBootGraph(ctx)
      var diagnostics = probe(ctx)
      var failures = []
      var nodes = []
      var byId = new Map()
      var add = function (node) {
        var existing = byId.get(node.id)
        if (existing !== undefined) return existing
        nodes.push(node)
        byId.set(node.id, node)
        return node
      }
      /**
       * Run one source section in isolation. A section that throws leaves the
       * sections that already answered intact and records itself, so a partial
       * read renders a partial graph instead of an empty panel.
       * @param name - section name reported in diagnostics.
       * @param run - section body.
       */
      var section = function (name, run) {
        try {
          return run()
        } catch (error) {
          var message = error instanceof Error ? error.message : String(error)
          failures.push(name + ': ' + message)
          return undefined
        }
      }

      // 1. Browser plane: one row per live Loader entry (the row that owns the fiber).
      var loader = clientLoader(ctx)
      var browserRows = 0
      section('loaderEntries', function () {
        if (loader === undefined || loader === null || typeof loader.entries !== 'function') return
        var iterator = loader.entries()
        var seen = new Set()
        for (var step = iterator.next(); step.done !== true; step = iterator.next()) {
          var entry = step.value
          if (entry === undefined || entry === null || !entry.options) continue
          var id = entry.options.name
          if (typeof id !== 'string' || seen.has(id)) continue
          seen.add(id)
          var fiber = entry.fiber === undefined ? null : entry.fiber
          var node = add(newNode(id, 'browser', 'plugin'))
          node.fiber = fiber
          node.hasFiber = fiber !== null
          node.state = phaseOf(fiber)
          node.visible = entry.disabled !== true
          node.uid = fiber !== null && typeof fiber.uid === 'number' ? fiber.uid : null
          node.entryId = typeof entry.id === 'string' ? entry.id : null
          node.provides = fiber === null ? [] : providedServices(ctx, fiber)
          node.services = injectedServices(fiber)
          browserRows += 1
        }
      })

      // 2. Browser plane: the composed boot graph adds rows the Loader has not
      //    created yet and, more importantly, the declared dependencies.
      var graphRows = graph === undefined ? [] : graph.rows
      section('bootGraph', function () {
        for (var rowIndex = 0; rowIndex < graphRows.length; rowIndex += 1) {
          var graphRow = graphRows[rowIndex]
          var existing = add(newNode(graphRow.id, 'browser', 'plugin'))
          existing.rev = graphRow.rev
          var specs = graphRow.inject.concat(graphRow.external)
          if (!Array.isArray(existing.modules)) existing.modules = []
          for (var specIndex = 0; specIndex < specs.length; specIndex += 1) {
            var root = packageRoot(specs[specIndex])
            if (root === undefined || root === graphRow.id) continue
            if (existing.modules.indexOf(specs[specIndex]) === -1) existing.modules.push(specs[specIndex])
          }
        }
      })

      // 3. Host plane: every entry the Host inventory reports. A row is matched
      //    to an existing node by Loader entry id, then by module name, so a
      //    web plugin and its Host half become one node carrying both phases.
      section('hostInventory', function () {
      if (Array.isArray(hostEntries)) {
        for (var hostIndex = 0; hostIndex < hostEntries.length; hostIndex += 1) {
          var hostRow = hostEntries[hostIndex]
          if (hostRow === null || typeof hostRow !== 'object' || typeof hostRow.moduleName !== 'string') continue
          var moduleName = hostRow.moduleName
          var bare = moduleName.endsWith('/client') ? moduleName.slice(0, -'/client'.length) : moduleName
          var entryIdOfRow = typeof hostRow.entryId === 'string' ? hostRow.entryId : null
          var target
          if (entryIdOfRow !== null) target = byId.get(entryIdOfRow)
          if (target === undefined) target = byId.get(moduleName)
          if (target === undefined) target = byId.get(bare)
          var phase = typeof hostRow.fiberPhase === 'string'
            ? HOST_PHASE[hostRow.fiberPhase] || null
            : FIBER_STATE[hostRow.fiberPhase] === undefined ? null : FIBER_STATE[hostRow.fiberPhase]
          var record = {
            entryId: entryIdOfRow,
            moduleName: moduleName,
            state: phase,
            enabled: hostRow.enabled !== false,
            title: displayText(hostRow.meta === undefined ? undefined : hostRow.meta.title),
            description: displayText(hostRow.meta === undefined ? undefined : hostRow.meta.description),
          }
          if (target === undefined) {
            target = add(newNode(moduleName, 'host', 'plugin'))
            target.moduleName = moduleName
            target.state = phase
            target.visible = hostRow.enabled !== false
            target.uid = null
            target.entryId = entryIdOfRow === null ? '\u0001host:' + moduleName : entryIdOfRow
          } else {
            if (target.plane === 'browser') target.kind = 'both'
            if (target.entryId === null || target.entryId.charAt(0) === '\u0001') target.entryId = entryIdOfRow
          }
          if (target.moduleName === undefined || target.moduleName === null) target.moduleName = moduleName
          if (!Array.isArray(target.host)) target.host = []
          // One record per module: the browser row and the bundle row can both
          // name the same Host module, and the detail panel lists rows, not
          // claims. An aspect record belongs to the Host half only.
          var recorded = false
          for (var recordIndex = 0; recordIndex < target.host.length; recordIndex += 1) {
            if (target.host[recordIndex].moduleName === moduleName) {
              recorded = true
              target.host[recordIndex] = record
              break
            }
          }
          if (!recorded) target.host.push(record)
        }
      }
      })

      // 4. Composition plane: the bundle -> plugin-row relation the Plugins page
      //    itself renders. It comes from the plugin manager Remote, so it needs
      //    neither the boot global nor a fiber inject map, and therefore draws
      //    real edges on a page where those two stay silent.
      var bundleRows = []
      if (composition !== undefined && composition !== null && Array.isArray(composition.bundles)) {
        for (var bundleIndex = 0; bundleIndex < composition.bundles.length; bundleIndex += 1) {
          var bundle = composition.bundles[bundleIndex]
          if (bundle === null || typeof bundle !== 'object' || typeof bundle.name !== 'string') continue
          var bundleId = '\u0001bundle:' + bundle.name
          var bundleNode = add(newNode(bundleId, 'bundle', 'bundle'))
          bundleNode.label = shortLabel(bundle.name)
          bundleNode.visible = bundle.enabled !== false
          bundleNode.bundle = {
            name: bundle.name,
            version: typeof bundle.version === 'string' ? bundle.version : null,
            installed: bundle.installed === true,
            optional: bundle.optional === true,
            removable: bundle.removable === true,
            description: typeof bundle.description === 'string' ? bundle.description : '',
            error: bundle.error !== undefined && bundle.error !== null && typeof bundle.error.code === 'string'
              ? bundle.error.code
              : null,
            rowCount: 0,
            overrideCount: Array.isArray(bundle.overrides) ? bundle.overrides.length : 0,
          }
          var declaredRows = Array.isArray(bundle.rows) ? bundle.rows : []
          for (var bundleRowIndex = 0; bundleRowIndex < declaredRows.length; bundleRowIndex += 1) {
            var bundleRow = declaredRows[bundleRowIndex]
            if (bundleRow === null || typeof bundleRow !== 'object' || typeof bundleRow.moduleName !== 'string') continue
            var rowId = typeof bundleRow.entryId === 'string' ? bundleRow.entryId : null
            var rowName = bundleRow.moduleName
            var rowNode = rowId === null ? undefined : byId.get(rowId)
            if (rowNode === undefined) {
              rowNode = add(newNode(rowId === null ? rowName : rowId, 'host', 'plugin'))
              rowNode.moduleName = rowName
              rowNode.visible = true
            }
            if (rowNode.plane === 'browser') rowNode.kind = 'both'
            if (!Array.isArray(rowNode.bundle)) rowNode.bundle = []
            if (rowNode.bundle.indexOf(bundle.name) === -1) rowNode.bundle.push(bundle.name)
            bundleNode.bundle.rowCount += 1
            bundleRows.push([bundleId, rowNode.id])
          }
        }
      }

      // 5. Host fiber phases for rows the inventory reports, including the rows
      //    step 4 created: the inventory carries `enabled` and `fiberPhase` for
      //    every live entry, which is what makes a composition node show a state.
      if (Array.isArray(hostEntries)) {
        for (var stateIndex = 0; stateIndex < hostEntries.length; stateIndex += 1) {
          var stateRow = hostEntries[stateIndex]
          if (stateRow === null || typeof stateRow !== 'object' || typeof stateRow.moduleName !== 'string') continue
          var stateTarget = byId.get(stateRow.moduleName)
          if (stateTarget === undefined || stateTarget.state !== null) continue
          stateTarget.state = typeof stateRow.fiberPhase === 'string'
            ? HOST_PHASE[stateRow.fiberPhase] || null
            : FIBER_STATE[stateRow.fiberPhase] === undefined ? null : FIBER_STATE[stateRow.fiberPhase]
          stateTarget.visible = stateRow.enabled !== false
        }
      }

      // 6. Edges. A browser row declares its package and static-table
      //    dependencies; a Host row only enriches an existing browser node, so
      //    the graph stays the composition graph plus the Host's own rows.
      var edges = []
      var edgeKeys = new Set()
      var addEdge = function (from, to, kind) {
        if (from === to) return
        var key = kind + '\u0000' + from + '\u0000' + to
        if (edgeKeys.has(key)) return
        edgeKeys.add(key)
        edges.push({ id: key, from: from, to: to, kind: kind })
      }

      for (var membershipIndex = 0; membershipIndex < bundleRows.length; membershipIndex += 1) {
        addEdge(bundleRows[membershipIndex][0], bundleRows[membershipIndex][1], 'bundle')
      }

      var reflect = ctx.reflect
      for (var scan = 0; scan < nodes.length; scan += 1) {
        var subject = nodes[scan]
        if (!Array.isArray(subject.modules)) subject.modules = []
        if (!Array.isArray(subject.providers)) subject.providers = []
        if (!Array.isArray(subject.provides)) subject.provides = []
        if (!Array.isArray(subject.services)) subject.services = []
        var unique = []
        for (var moduleIndex = 0; moduleIndex < subject.modules.length; moduleIndex += 1) {
          var dependency = packageRoot(subject.modules[moduleIndex])
          if (dependency === undefined) continue
          if (byId.get(dependency) === undefined) continue
          if (unique.indexOf(dependency) !== -1) continue
          unique.push(dependency)
          addEdge(dependency, subject.id, 'package')
        }
        subject.modules = unique

        // A declared service whose implementation is live becomes a real
        // binding edge; one nobody provides stays a reported gap.
        for (var serviceIndex = 0; serviceIndex < subject.services.length; serviceIndex += 1) {
          var service = subject.services[serviceIndex]
          var impl = reflect !== undefined && reflect !== null && typeof reflect.getImpl === 'function'
            ? reflect.getImpl(service)
            : undefined
          var owner = impl === undefined || impl === null ? undefined : nodeOfFiber(nodes, impl.fiber)
          if (owner === undefined || owner === subject) continue
          if (subject.providers.indexOf(service) === -1) subject.providers.push(service)
          if (owner.provides.indexOf(service) === -1) owner.provides.push(service)
          addEdge(owner.id, subject.id, 'service')
        }
      }

      for (var edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
        var edge = edges[edgeIndex]
        var fromNode = byId.get(edge.from)
        var toNode = byId.get(edge.to)
        if (fromNode === undefined || toNode === undefined) continue
        if (!Array.isArray(fromNode.reverseDependencies)) fromNode.reverseDependencies = []
        if (!Array.isArray(toNode.dependencies)) toNode.dependencies = []
        fromNode.reverseDependencies.push(edge.to)
        toNode.dependencies.push(edge.from)
      }

      var counts = { active: 0, pending: 0, loading: 0, failed: 0, unloading: 0, disposed: 0, none: 0 }
      for (var count = 0; count < nodes.length; count += 1) {
        var state = nodes[count].state
        if (state === null || counts[state] === undefined) counts.none += 1
        else counts[state] += 1
      }

      var edgeCounts = { package: 0, service: 0, bundle: 0 }
      for (var kindIndex = 0; kindIndex < edges.length; kindIndex += 1) {
        if (edgeCounts[edges[kindIndex].kind] === undefined) edgeCounts[edges[kindIndex].kind] = 0
        edgeCounts[edges[kindIndex].kind] += 1
      }
      diagnostics.packageEdges = edgeCounts.package === undefined ? 0 : edgeCounts.package
      diagnostics.serviceEdges = edgeCounts.service === undefined ? 0 : edgeCounts.service
      diagnostics.bundleEdges = edgeCounts.bundle === undefined ? 0 : edgeCounts.bundle
      diagnostics.nodeCount = nodes.length
      diagnostics.declaredDependencies = 0
      diagnostics.bundleRows = bundleRows.length
      diagnostics.bundles = 0
      for (var declaredIndex = 0; declaredIndex < nodes.length; declaredIndex += 1) {
        diagnostics.declaredDependencies += nodes[declaredIndex].modules.length
        if (nodes[declaredIndex].plane === 'bundle') diagnostics.bundles += 1
      }

      var box = layout(nodes, edges)

      return {
        rev: (graph === undefined ? 'no-graph' : graph.rev) + '|' + (Array.isArray(hostEntries) ? hostEntries.length : 0),
        graphSource: graph === undefined ? 'unavailable' : graph.source,
        capturedAt: Date.now(),
        nodes: nodes,
        edges: edges,
        counts: counts,
        box: box,
        diagnostics: diagnostics,
        failure: failures.length === 0 ? null : failures.join(' | '),
        browserRows: browserRows,
        hostRows: Array.isArray(hostEntries) ? hostEntries.length : 0,
      }
    }

    /** The node whose fiber is `fiber`, or undefined when no node owns it. */
    function nodeOfFiber(nodes, fiber) {
      if (fiber === undefined || fiber === null) return undefined
      for (var index = 0; index < nodes.length; index += 1) {
        if (nodes[index].fiber === fiber) return nodes[index]
      }
      return undefined
    }

    /**
     * Lay the graph out left-to-right by dependency depth: a column per longest
     * dependency path, ordering inside each column refined by the barycenter of
     * neighbours so edges cross as little as possible, and disconnected
     * components stacked as separate blocks so unrelated plugin families never
     * interleave.
     * @param nodes - mutable node list; `depth`, `x`, `y`, `component` are written.
     * @param edges - graph edges.
     * @returns the drawing box.
     */
    function layout(nodes, edges) {
      var NODE_WIDTH = 176
      var NODE_HEIGHT = 42
      var COLUMN_GAP = 76
      var ROW_GAP = 16
      var BLOCK_GAP = 40
      var MARGIN = 28
      var empty = { width: MARGIN * 2, height: MARGIN * 2, nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT }
      if (nodes.length === 0) return empty

      var byId = new Map()
      for (var index = 0; index < nodes.length; index += 1) byId.set(nodes[index].id, nodes[index])

      var outgoing = new Map()
      var incoming = new Map()
      for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
        outgoing.set(nodes[nodeIndex].id, [])
        incoming.set(nodes[nodeIndex].id, [])
      }
      for (var edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
        var edge = edges[edgeIndex]
        if (!byId.has(edge.from) || !byId.has(edge.to)) continue
        outgoing.get(edge.from).push(edge.to)
        incoming.get(edge.to).push(edge.from)
      }

      // Layering: one column per longest dependency path, computed on the DAG
      // that remains after peeling nodes whose dependencies are already placed.
      // A node still left when nothing can be peeled sits on a cycle; it joins
      // the deepest column, which keeps the drawing finite. This must not be a
      // relaxation pass — one increment per iteration on a cyclic graph is how
      // the drawing grew to eighty-four columns.
      var depth = new Map()
      var pending = new Map()
      var queue = []
      for (var scan = 0; scan < nodes.length; scan += 1) {
        var node = nodes[scan]
        var parents = incoming.get(node.id)
        pending.set(node.id, parents.length)
        if (parents.length === 0) {
          depth.set(node.id, 0)
          queue.push(node.id)
        }
      }
      var head = 0
      while (head < queue.length) {
        var current = queue[head]
        head += 1
        var placedDepth = depth.get(current)
        var children = outgoing.get(current)
        for (var childIndex = 0; childIndex < children.length; childIndex += 1) {
          var child = children[childIndex]
          var next = placedDepth + 1
          if (!depth.has(child) || depth.get(child) < next) depth.set(child, next)
          pending.set(child, pending.get(child) - 1)
          if (pending.get(child) <= 0) queue.push(child)
        }
      }
      // Whatever never became ready is on (or behind) a cycle: give it a column
      // of its own at the end rather than counting upwards until the loop ends.
      var cycleDepth = 0
      for (var settled = 0; settled < nodes.length; settled += 1) {
        var settledDepth = depth.get(nodes[settled].id)
        if (settledDepth !== undefined && settledDepth > cycleDepth) cycleDepth = settledDepth
      }
      cycleDepth += 1
      for (var stuck = 0; stuck < nodes.length; stuck += 1) {
        if (depth.has(nodes[stuck].id)) continue
        // A cyclic node still respects the deepest dependency that IS placed.
        var deepest = -1
        var stuckParents = incoming.get(nodes[stuck].id)
        for (var stuckParent = 0; stuckParent < stuckParents.length; stuckParent += 1) {
          var parentDepth = depth.get(stuckParents[stuckParent])
          if (parentDepth !== undefined && parentDepth > deepest) deepest = parentDepth
        }
        depth.set(nodes[stuck].id, deepest >= 0 ? Math.min(deepest + 1, cycleDepth) : cycleDepth)
      }

      // A real dependency graph can legitimately be deep, and an unbounded
      // column count is what makes the drawing unusable: a hundred columns of
      // one node each. Past a readable budget the intermediate columns are
      // compressed, which keeps every node and every edge on screen.
      var MAX_DEPTH = 16
      var deepestDepth = 0
      for (var deepIndex = 0; deepIndex < nodes.length; deepIndex += 1) {
        var deepValue = depth.get(nodes[deepIndex].id)
        if (typeof deepValue === 'number' && deepValue > deepestDepth) deepestDepth = deepValue
      }
      if (deepestDepth > MAX_DEPTH) {
        var compress = MAX_DEPTH / deepestDepth
        for (var compressIndex = 0; compressIndex < nodes.length; compressIndex += 1) {
          var compressId = nodes[compressIndex].id
          var compressValue = depth.get(compressId)
          if (typeof compressValue !== 'number') continue
          depth.set(compressId, Math.round(compressValue * compress))
        }
      }

      var layers = []
      for (var fill = 0; fill < nodes.length; fill += 1) {
        var placed = nodes[fill]
        var at = depth.get(placed.id)
        // `depth` keys are integers, but a Map lookup must not be trusted to
        // hand back one: a missing value would become a string array index.
        if (typeof at !== 'number' || !isFinite(at) || at < 0) at = 0
        if (!Array.isArray(layers[at])) layers[at] = []
        layers[at].push(placed)
        placed.depth = at
      }

      // Seed the within-column order by name so the first pass is deterministic.
      for (var seed = 0; seed < layers.length; seed += 1) {
        if (layers[seed] === undefined) continue
        layers[seed].sort(compareId)
      }
      var position = new Map()
      var recordPositions = function () {
        for (var layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
          var row = layers[layerIndex]
          if (row === undefined) continue
          for (var item = 0; item < row.length; item += 1) position.set(row[item].id, item)
        }
      }
      recordPositions()
      for (var sweep = 0; sweep < 8; sweep += 1) {
        var forward = sweep % 2 === 0
        var order = []
        for (var layerIndex = 0; layerIndex < layers.length; layerIndex += 1) order.push(layerIndex)
        if (!forward) order.reverse()
        for (var pass = 0; pass < order.length; pass += 1) {
          var row = layers[order[pass]]
          if (row === undefined || row.length < 2) continue
          var neighbours = forward ? incoming : outgoing
          var keys = new Map()
          for (var item = 0; item < row.length; item += 1) {
            var list = neighbours.get(row[item].id)
            var total = 0
            var counted = 0
            if (list !== undefined) {
              for (var link = 0; link < list.length; link += 1) {
                var positionOf = position.get(list[link])
                if (positionOf === undefined) continue
                total += positionOf
                counted += 1
              }
            }
            keys.set(row[item].id, counted === 0 ? position.get(row[item].id) : total / counted)
          }
          row.sort(function (left, right) {
            var leftKey = keys.get(left.id)
            var rightKey = keys.get(right.id)
            if (leftKey !== rightKey) return leftKey - rightKey
            return compareId(left, right)
          })
          recordPositions()
        }
      }

      // Weakly connected components: each is drawn as its own block.
      var componentOf = new Map()
      var components = []
      for (var walk = 0; walk < nodes.length; walk += 1) {
        var rootId = nodes[walk].id
        if (componentOf.has(rootId)) continue
        var componentMembers = []
        var stack = [rootId]
        componentOf.set(rootId, components.length)
        while (stack.length > 0) {
          var currentId = stack.pop()
          componentMembers.push(byId.get(currentId))
          var links = outgoing.get(currentId).concat(incoming.get(currentId))
          for (var linkIndex = 0; linkIndex < links.length; linkIndex += 1) {
            if (componentOf.has(links[linkIndex])) continue
            componentOf.set(links[linkIndex], components.length)
            stack.push(links[linkIndex])
          }
        }
        components.push(componentMembers)
      }
      components.sort(function (left, right) {
        if (right.length !== left.length) return right.length - left.length
        return compareId(left[0], right[0])
      })

      // Nodes with no edge at all are kept out of the composition blocks: a
      // flat list of orphans would otherwise dominate the drawing box and
      // squeeze every real dependency into one unreadable column. They are
      // packed into their own grid below the composition, which the view hides
      // by default.
      var linked = []
      var orphans = []
      for (var split = 0; split < components.length; split += 1) {
        if (components[split].length === 1) orphans.push(components[split][0])
        else linked.push(components[split])
      }

      // Column height budget: a layer holds every node at one dependency depth,
      // and the Host plane puts hundreds at depth zero. Left as one column that
      // becomes a 14000-pixel strip and the whole drawing shrinks to nothing, so
      // an over-full layer wraps into sub-columns read left to right.
      var MAX_COLUMN_ROWS = 12

      var cursorY = MARGIN
      for (var block = 0; block < linked.length; block += 1) {
        var blockMembers = linked[block]
        var ownLayers = new Map()
        for (var memberIndex = 0; memberIndex < blockMembers.length; memberIndex += 1) {
          var member = blockMembers[memberIndex]
          var layerNumber = depth.get(member.id)
          if (ownLayers.get(layerNumber) === undefined) ownLayers.set(layerNumber, [])
          ownLayers.get(layerNumber).push(member)
        }
        var numbers = Array.from(ownLayers.keys()).sort(function (left, right) { return left - right })
        var tallest = 0
        for (var numberIndex = 0; numberIndex < numbers.length; numberIndex += 1) {
          var ownRow = ownLayers.get(numbers[numberIndex])
          if (ownRow.length > tallest) tallest = ownRow.length
        }
        var blockHeight = Math.min(tallest, MAX_COLUMN_ROWS) * NODE_HEIGHT
          + Math.max(Math.min(tallest, MAX_COLUMN_ROWS) - 1, 0) * ROW_GAP
        var top = cursorY
        var columnCursor = 0
        for (var columnIndex = 0; columnIndex < numbers.length; columnIndex += 1) {
          var column = ownLayers.get(numbers[columnIndex])
          var subColumns = Math.max(1, Math.ceil(column.length / MAX_COLUMN_ROWS))
          for (var sub = 0; sub < subColumns; sub += 1) {
            var subRows = Math.min(MAX_COLUMN_ROWS, column.length - sub * MAX_COLUMN_ROWS)
            var subHeight = subRows * NODE_HEIGHT + Math.max(subRows - 1, 0) * ROW_GAP
            var subTop = top + (blockHeight - subHeight) / 2
            for (var rowIndex = 0; rowIndex < subRows; rowIndex += 1) {
              var target = column[sub * MAX_COLUMN_ROWS + rowIndex]
              target.x = MARGIN + columnCursor * (NODE_WIDTH + COLUMN_GAP)
              target.y = subTop + rowIndex * (NODE_HEIGHT + ROW_GAP)
              target.component = block
              target.hasEdge = true
            }
            columnCursor += 1
          }
        }
        cursorY = top + blockHeight + BLOCK_GAP
      }

      // The drawing box covers the composition only; the orphan grid is drawn
      // outside it so the default view stays tight around real dependencies.
      var contentWidth = MARGIN
      var contentHeight = MARGIN
      var measure = function (list) {
        for (var index = 0; index < list.length; index += 1) {
          var measured = list[index]
          if (measured.x + NODE_WIDTH + MARGIN > contentWidth) contentWidth = measured.x + NODE_WIDTH + MARGIN
          if (measured.y + NODE_HEIGHT + MARGIN > contentHeight) contentHeight = measured.y + NODE_HEIGHT + MARGIN
        }
      }
      for (var linkedIndex = 0; linkedIndex < linked.length; linkedIndex += 1) measure(linked[linkedIndex])

      // A square-ish grid for the orphans, packed beside the content so their
      // area grows with the square root of their count instead of their count.
      var gridTop = contentHeight + BLOCK_GAP * 2
      var gridWidth = 0
      if (orphans.length > 0) {
        var columns = Math.max(1, Math.ceil(Math.sqrt(orphans.length * 2)))
        var rows = Math.ceil(orphans.length / columns)
        gridWidth = columns * NODE_WIDTH + Math.max(columns - 1, 0) * COLUMN_GAP + MARGIN * 2
        for (var orphanIndex = 0; orphanIndex < orphans.length; orphanIndex += 1) {
          var orphan = orphans[orphanIndex]
          orphan.x = MARGIN + (orphanIndex % columns) * (NODE_WIDTH + COLUMN_GAP)
          orphan.y = gridTop + Math.floor(orphanIndex / columns) * (NODE_HEIGHT + ROW_GAP)
          orphan.component = linked.length + orphanIndex
          orphan.hasEdge = false
          orphan.tail = true
        }
      }

      var orphanHeight = orphans.length === 0
        ? 0
        : gridTop + Math.ceil(orphans.length / Math.max(1, Math.ceil(Math.sqrt(orphans.length * 2))))
          * (NODE_HEIGHT + ROW_GAP) + MARGIN

      return {
        width: Math.max(contentWidth, MARGIN * 2),
        height: Math.max(contentHeight, MARGIN * 2),
        orphanWidth: Math.max(gridWidth, MARGIN * 2),
        orphanHeight: Math.max(orphanHeight, MARGIN * 2),
        orphanTop: gridTop,
        orphanCount: orphans.length,
        nodeWidth: NODE_WIDTH,
        nodeHeight: NODE_HEIGHT,
        components: linked.length,
        blocks: linked.length,
      }
    }

    /** Stable name ordering used by every sort tie-break. */
    function compareId(left, right) {
      if (left.id < right.id) return -1
      if (left.id > right.id) return 1
      return 0
    }

    // ---------------------------------------------------------------------
    // View: toolbar, SVG graph, table, and the selected plugin's detail.
    // ---------------------------------------------------------------------

    var CLASS_PREFIX = 'dpt'

    /**
     * Zoom floor for the automatic fit. Below this a node stops being
     * readable, so the view stays here and leaves the rest of the drawing to
     * panning instead of shrinking the whole graph into noise.
     */
    var MIN_READABLE_SCALE = 0.5

    /** Zoom ceiling for the automatic fit; a small graph is framed, not magnified. */
    var MAX_FIT_SCALE = 1

    /** Absolute zoom bounds for user input. */
    var MIN_SCALE = 0.05
    var MAX_SCALE = 6

    /** Keep a user or automatic zoom inside the supported range. */
    function clampScale(scale) {
      if (!isFinite(scale) || scale <= 0) return 1
      return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale))
    }

    /**
     * The CSS custom property carrying one fiber state's tone. The HTML dots
     * (chips, legend, detail rows) paint it through `background`; an SVG shape
     * needs `fill` instead, which is why the graph dots take it as a fill.
     * @param state - fiber state key, or `none`.
     * @returns the var() reference, resolving per theme at paint time.
     */
    function stateFill(state) {
      if (state === 'active') return 'var(--dsw-alias-state-success-primary)'
      if (state === 'failed') return 'var(--dsw-alias-state-error-primary)'
      if (state === 'loading' || state === 'pending' || state === 'unloading') return 'var(--dsw-alias-state-warn-primary)'
      return 'var(--dsw-alias-state-idle-primary)'
    }

    /**
     * State tones the chips filter by. `unloading` and `disposed` are omitted
     * on purpose: a live snapshot cannot contain a disposed entry, and unloading
     * lasts a frame or two, so both chips sat at zero forever and claimed a
     * signal the data does not carry.
     */
    var STATE_ORDER = ['active', 'loading', 'pending', 'failed']

    /** State keys a node can carry, including "no fiber". */
    var STATE_KEYS = STATE_ORDER.concat(['none'])

    var STYLES = [
      '.' + CLASS_PREFIX + '-root{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px}',
      '.' + CLASS_PREFIX + '-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:14px 18px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.' + CLASS_PREFIX + '-title{margin:0;font-size:15px;font-weight:600;letter-spacing:.01em}',
      '.' + CLASS_PREFIX + '-muted{color:var(--dsw-alias-label-secondary)}',
      '.' + CLASS_PREFIX + '-caption{color:var(--dsw-alias-label-caption);font-size:12px}',
      '.' + CLASS_PREFIX + '-spacer{flex:1 1 auto}',
      '.' + CLASS_PREFIX + '-chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px}',
      '.' + CLASS_PREFIX + '-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;white-space:nowrap}',
      // Toggle chips read as checkboxes: a box that is empty when the facet is
      // hidden and filled with a tick when it is shown. The earlier design only
      // tinted the chip, which left "selected" and "not selected" looking alike.
      '.' + CLASS_PREFIX + '-chip[data-clickable=true]{cursor:pointer}',
      '.' + CLASS_PREFIX + '-chip[data-clickable=true]:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.' + CLASS_PREFIX + '-check{display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;flex:none;border:1px solid var(--dsw-alias-border-l2);border-radius:3px;font-size:10px;line-height:1;color:transparent}',
      '.' + CLASS_PREFIX + '-chip[data-on=true]{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);color:var(--dsw-alias-label-primary)}',
      '.' + CLASS_PREFIX + '-chip[data-on=true] .' + CLASS_PREFIX + '-check{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground)}',
      '.' + CLASS_PREFIX + '-chip[data-on=false]{color:var(--dsw-alias-label-tertiary)}',
      // `!important` on purpose: the per-state opacity rules below are equally
      // specific, and a dimmed facet must win regardless of which state it
      // stands for.
      '.' + CLASS_PREFIX + '-chip[data-on=false] .' + CLASS_PREFIX + '-dot{opacity:.35 !important}',
      '.' + CLASS_PREFIX + '-chip[data-on=false] .' + CLASS_PREFIX + '-count{text-decoration:line-through}',
      '.' + CLASS_PREFIX + '-count{font-variant-numeric:tabular-nums;opacity:.75}',
      '.' + CLASS_PREFIX + '-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex:none}',
      // HTML dots are spans, so the state tone arrives as `background`. The SVG
      // dots in the graph take the same tone as an inline `fill` (see the node
      // builder): a `background` declaration does not apply to an SVG shape.
      '[data-state=active] .' + CLASS_PREFIX + '-dot{background:var(--dsw-alias-state-success-primary)}',
      '[data-state=loading] .' + CLASS_PREFIX + '-dot{background:var(--dsw-alias-state-warn-primary)}',
      '[data-state=pending] .' + CLASS_PREFIX + '-dot{background:var(--dsw-alias-state-warn-primary);opacity:.6}',
      '[data-state=unloading] .' + CLASS_PREFIX + '-dot{background:var(--dsw-alias-state-warn-primary);opacity:.85}',
      '[data-state=failed] .' + CLASS_PREFIX + '-dot{background:var(--dsw-alias-state-error-primary)}',
      '.' + CLASS_PREFIX + '-btn{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}',
      '.' + CLASS_PREFIX + '-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.' + CLASS_PREFIX + '-btn[data-on=true]{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent);font-weight:600}',
      '.' + CLASS_PREFIX + '-segmented{display:inline-flex;gap:2px;padding:2px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-2)}',
      '.' + CLASS_PREFIX + '-segmented .' + CLASS_PREFIX + '-btn{height:24px;border-color:transparent;background:none}',
      '.' + CLASS_PREFIX + '-segmented .' + CLASS_PREFIX + '-btn[data-on=true]{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,transparent);background:var(--dsw-alias-bg-layer-1);font-weight:600}',
      '.' + CLASS_PREFIX + '-btn[data-on=false]{color:var(--dsw-alias-label-secondary)}',
      '.' + CLASS_PREFIX + '-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.' + CLASS_PREFIX + '-field{height:28px;min-width:190px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}',
      '.' + CLASS_PREFIX + '-field::placeholder{color:var(--dsw-alias-label-caption)}',
      '.' + CLASS_PREFIX + '-field:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}',
      '.' + CLASS_PREFIX + '-body{flex:1 1 auto;display:flex;min-height:0}',
      '.' + CLASS_PREFIX + '-canvas{position:relative;flex:1 1 auto;min-width:0;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}',
      '.' + CLASS_PREFIX + '-canvas[data-dragging=true]{cursor:grabbing}',
      '.' + CLASS_PREFIX + '-canvas:not([data-dragging=true]){cursor:grab}',
      '.' + CLASS_PREFIX + '-grid{position:absolute;inset:0;background-image:radial-gradient(circle at 1px 1px,var(--dsw-alias-border-l1) 1px,transparent 0);background-size:22px 22px;opacity:.5;pointer-events:none}',
      '.' + CLASS_PREFIX + '-orphans{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:4px;max-height:240px;overflow:auto;padding-right:2px}',
      '.' + CLASS_PREFIX + '-orphan{display:flex;align-items:center;gap:6px;width:100%;padding:4px 6px;border:1px solid transparent;border-radius:6px;background:none;color:inherit;font:inherit;font-size:12px;text-align:left;cursor:pointer}',
      '.' + CLASS_PREFIX + '-orphan:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.' + CLASS_PREFIX + '-orphan[data-selected=true]{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,transparent)}',
      '.' + CLASS_PREFIX + '-orphan-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.' + CLASS_PREFIX + '-svg{position:relative;display:block}',
      '.' + CLASS_PREFIX + '-node{pointer-events:all}',
      '.' + CLASS_PREFIX + '-node[data-bundle=true]{cursor:pointer}',
      '.' + CLASS_PREFIX + '-node[data-bundle=true] rect{fill:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,var(--dsw-alias-bg-layer-2))}',
      '.' + CLASS_PREFIX + '-node[data-bundle=true] .' + CLASS_PREFIX + '-node-title{font-weight:700}',
      // Semantic zoom: far out, the map carries structure (state colors and
      // edges) instead of unreadable 3px text.
      '.' + CLASS_PREFIX + '-svg[data-detail=false] .' + CLASS_PREFIX + '-node-title,'
        + '.' + CLASS_PREFIX + '-svg[data-detail=false] .' + CLASS_PREFIX + '-node-sub,'
        + '.' + CLASS_PREFIX + '-svg[data-detail=false] .' + CLASS_PREFIX + '-node-badge{display:none}',
      '.' + CLASS_PREFIX + '-node rect{fill:var(--dsw-alias-bg-layer-2);stroke:var(--dsw-alias-border-l2);stroke-width:1.1}',
      '.' + CLASS_PREFIX + '-node[data-plane=host] rect{fill:var(--dsw-alias-bg-layer-1)}',
      '.' + CLASS_PREFIX + '-node[data-plane=bundle] rect{fill:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,var(--dsw-alias-bg-layer-2))}',
      '.' + CLASS_PREFIX + '-node[data-state=active] rect{stroke:color-mix(in srgb,var(--dsw-alias-state-success-primary) 55%,transparent)}',
      '.' + CLASS_PREFIX + '-node[data-state=failed] rect{fill:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,var(--dsw-alias-bg-layer-2));stroke:var(--dsw-alias-state-error-primary)}',
      '.' + CLASS_PREFIX + '-node[data-state=loading] rect,.' + CLASS_PREFIX + '-node[data-state=pending] rect{stroke:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 65%,transparent)}',
      '.' + CLASS_PREFIX + '-node:hover rect{stroke:var(--dsw-alias-brand-primary)}',
      '.' + CLASS_PREFIX + '-node[data-selected=true] rect{stroke:var(--dsw-alias-brand-primary);stroke-width:1.8}',
      '.' + CLASS_PREFIX + '-node[data-selected=true] .' + CLASS_PREFIX + '-node-title{fill:var(--dsw-alias-brand-primary)}',
      '.' + CLASS_PREFIX + '-node[data-dim=true]{opacity:.32}',
      '.' + CLASS_PREFIX + '-node[data-hidden=true]{display:none}',
      '.' + CLASS_PREFIX + '-node-title{fill:var(--dsw-alias-label-primary);font-size:12.5px;font-weight:600}',
      '.' + CLASS_PREFIX + '-node-sub{fill:var(--dsw-alias-label-caption);font-size:10.5px}',
      '.' + CLASS_PREFIX + '-node-badge{fill:var(--dsw-alias-label-secondary);font-size:9.5px;font-weight:600;letter-spacing:.03em}',
      '.' + CLASS_PREFIX + '-edge{fill:none;stroke:var(--dsw-alias-border-l2);stroke-width:1.4}',
      '.' + CLASS_PREFIX + '-edge[data-kind=service]{stroke-dasharray:4 3;stroke:color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,var(--dsw-alias-border-l2))}',
      '.' + CLASS_PREFIX + '-edge[data-agg=true]{stroke-dasharray:1 4;stroke-width:1.8;stroke:color-mix(in srgb,var(--dsw-alias-brand-primary) 30%,var(--dsw-alias-border-l2))}',
      '.' + CLASS_PREFIX + '-edge[data-hot=true]{stroke:var(--dsw-alias-brand-primary);stroke-width:2}',
      '.' + CLASS_PREFIX + '-edge[data-dim=true]{opacity:.15}',
      '.' + CLASS_PREFIX + '-arrow{fill:var(--dsw-alias-border-l2)}',
      '.' + CLASS_PREFIX + '-arrow[data-hot=true]{fill:var(--dsw-alias-brand-primary)}',
      '.' + CLASS_PREFIX + '-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--dsw-alias-label-secondary);text-align:center;padding:24px}',
      '.' + CLASS_PREFIX + '-hud{position:absolute;right:12px;bottom:12px;display:flex;align-items:center;gap:6px}',
      '.' + CLASS_PREFIX + '-zoom{min-width:44px;text-align:center;font-size:11px;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums}',
      '.' + CLASS_PREFIX + '-btn:disabled{opacity:.4;cursor:default}',
      '.' + CLASS_PREFIX + '-subhead{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:8px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}',
      '.' + CLASS_PREFIX + '-warn{display:flex;align-items:flex-start;gap:8px;padding:8px 18px;border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary) 35%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent);color:var(--dsw-alias-state-warn-label);font-size:12px;line-height:1.5}',
      '.' + CLASS_PREFIX + '-legend{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.' + CLASS_PREFIX + '-legend>span{display:inline-flex;align-items:center;gap:5px}',
      '.' + CLASS_PREFIX + '-line{width:18px;height:0;border-top:1.5px solid var(--dsw-alias-border-l2)}',
      '.' + CLASS_PREFIX + '-line[data-dashed=true]{border-top-style:dashed;border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,transparent)}',
      '.' + CLASS_PREFIX + '-line[data-kind=bundle]{border-top-style:dotted;border-color:var(--dsw-alias-label-caption)}',
      '.' + CLASS_PREFIX + '-detail{flex:0 0 356px;min-width:0;display:flex;flex-direction:column;border-left:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);overflow:auto}',
      '.' + CLASS_PREFIX + '-detail-head{position:sticky;top:0;display:flex;align-items:flex-start;gap:8px;padding:14px 16px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}',
      '.' + CLASS_PREFIX + '-detail-name{margin:0;font-size:14px;font-weight:600;word-break:break-all}',
      '.' + CLASS_PREFIX + '-detail-id{margin-top:2px;font-size:11px;color:var(--dsw-alias-label-caption);word-break:break-all}',
      '.' + CLASS_PREFIX + '-section{padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.' + CLASS_PREFIX + '-section:last-child{border-bottom:none}',
      '.' + CLASS_PREFIX + '-section h4{margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-caption)}',
      '.' + CLASS_PREFIX + '-facts{display:grid;grid-template-columns:88px 1fr;gap:5px 10px;font-size:12px;margin:0}',
      '.' + CLASS_PREFIX + '-facts dt{color:var(--dsw-alias-label-secondary)}',
      '.' + CLASS_PREFIX + '-facts dd{margin:0;word-break:break-all}',
      '.' + CLASS_PREFIX + '-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px}',
      '.' + CLASS_PREFIX + '-list{display:flex;flex-direction:column;gap:4px}',
      '.' + CLASS_PREFIX + '-row{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:1px solid transparent;border-radius:8px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}',
      '.' + CLASS_PREFIX + '-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.' + CLASS_PREFIX + '-row[data-static=true]{cursor:default}',
      '.' + CLASS_PREFIX + '-row-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.' + CLASS_PREFIX + '-tag{flex:none;padding:1px 6px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.' + CLASS_PREFIX + '-gap{color:var(--dsw-alias-state-warn-label)}',
      '.' + CLASS_PREFIX + '-table{flex:1 1 auto;overflow:auto;min-height:0}',
      '.' + CLASS_PREFIX + '-table table{border-collapse:collapse;width:100%;font-size:12.5px}',
      '.' + CLASS_PREFIX + '-table th{position:sticky;top:0;z-index:1;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-caption);font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;text-align:left;white-space:nowrap}',
      '.' + CLASS_PREFIX + '-table td{padding:7px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);vertical-align:middle}',
      '.' + CLASS_PREFIX + '-table tbody tr{cursor:pointer}',
      '.' + CLASS_PREFIX + '-table tbody tr:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.' + CLASS_PREFIX + '-table tbody tr[data-selected=true]{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,transparent)}',
      '.' + CLASS_PREFIX + '-num{text-align:right;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}',
    ].join('\n')

    /** No-op subscription used when a store is missing. */
    function neverSubscribe() {
      return function () {}
    }

    /** Permanent empty snapshot used when a store is missing. */
    function emptySnapshot() {
      return null
    }

    /** Read the topology snapshot the entry injected, tolerating an absent store. */
    function useSnapshot(store) {
      var subscribe = store === undefined ? neverSubscribe : store.subscribe
      var getSnapshot = store === undefined ? emptySnapshot : store.getSnapshot
      return useSyncExternalStore(subscribe, getSnapshot)
    }

    /**
     * Whether a node survives the plane filter, the state filter, and the text
     * search. `state` is either null (every state) or the one state asked for.
     */
    function matches(node, query, state, planes) {
      // A collapsed bundle stands in for its rows, so its members leave the
      // drawing even when their own plane is on.
      if (planes.collapsed !== undefined && planes.collapsed.has(node.id)) return false
      // Nodes with no edge at all are the "orphan" facet, and they default off:
      // they are a flat inventory, not topology, and drawing them shrinks every
      // real dependency to an unreadable size.
      if (node.hasEdge === true) {
        if (planes[node.plane] !== true) return false
      } else if (planes.orphan !== true) return false
      if (state !== null && (node.state === null ? 'none' : node.state) !== state) return false
      if (query === '') return true
      if (node.id.toLowerCase().indexOf(query) !== -1) return true
      if (node.label.toLowerCase().indexOf(query) !== -1) return true
      if (node.moduleName !== null && node.moduleName !== undefined
        && node.moduleName.toLowerCase().indexOf(query) !== -1) return true
      if (node.host !== null) {
        for (var index = 0; index < node.host.length; index += 1) {
          var row = node.host[index]
          if (row.moduleName.toLowerCase().indexOf(query) !== -1) return true
          if ((row.title || '').toLowerCase().indexOf(query) !== -1) return true
        }
      }
      return false
    }

    /** Text shown on a node's secondary line: unresolved services first, then edges. */
    function nodeSubtitle(node, t) {
      if (node.tail === true) return t('node.orphan')
      if (node.plane === 'bundle') {
        var bundle = node.bundle
        var rows = bundle === null || bundle === undefined ? 0 : bundle.rowCount
        return '\u2192' + String(rows) + (bundle !== null && bundle !== undefined && bundle.version !== null
          ? '  v' + bundle.version
          : '')
      }
      var missing = node.services.length - node.providers.length
      if (missing > 0) return t('node.unresolved').replace('{count}', String(missing))
      if (node.plane === 'host') return t('plane.host')
      if (node.kind === 'module' && !node.hasFiber) return t('node.module')
      if (node.bundle !== null && node.bundle !== undefined && node.bundle.length > 0) {
        return t('node.bundle') + ' ' + String(node.bundle.length)
      }
      if (node.dependencies.length > 0 || node.reverseDependencies.length > 0) {
        return '\u2190' + node.dependencies.length + '  \u2192' + node.reverseDependencies.length
      }
      return t('node.standalone')
    }

    /** Resolve one state's label through the injected dictionary. */
    function stateLabel(t, state) {
      var key = state === null ? 'none' : state
      var text = t === undefined ? undefined : t('state.' + key)
      return typeof text === 'string' && text !== '' ? text : key
    }

    /** Human name of the plane a node belongs to, including the orphan facet. */
    function planeLabel(node, t) {
      if (node.hasEdge !== true) return t('plane.orphan')
      if (node.plane === 'bundle') return t('plane.bundle')
      if (node.plane === 'host') return t('plane.host')
      return t('plane.browser')
    }

    /**
     * Why the graph carries no dependency edge, or null when it does. The
     * answer names the source that stayed silent, so an edge-less render is
     * diagnosable instead of merely looking empty.
     * @param snapshot - the current topology snapshot.
     * @returns `{ key, params }` for the banner, or null.
     */
    function emptyReason(snapshot) {
      var diagnostics = snapshot.diagnostics
      if (snapshot.failure !== null && snapshot.failure !== undefined && snapshot.failure !== '') {
        return { key: 'status.failed', params: { message: String(snapshot.failure) } }
      }
      if (diagnostics === undefined || diagnostics === null) {
        return snapshot.edges.length > 0 ? null : { key: 'warn.noEdges', params: {} }
      }
      if (diagnostics.nodeCount === 0) {
        return { key: 'warn.noNodes', params: { source: snapshot.graphSource } }
      }
      if (snapshot.edges.length > 0) return null
      if (diagnostics.bundles > 0 && diagnostics.bundleRows > 0) {
        return { key: 'warn.crossPlane', params: { rows: diagnostics.bundleRows } }
      }
      if (diagnostics.declaredDependencies === 0) {
        return {
          key: 'warn.noDeclarations',
          params: { modules: diagnostics.moduleRows, boot: diagnostics.bootRows },
        }
      }
      return { key: 'warn.unresolved', params: { declared: diagnostics.declaredDependencies } }
    }

    /** The one-line explanation shown above a graph that has no edge. */
    function warnBanner(t, snapshot) {
      if (snapshot === null) return null
      var reason = emptyReason(snapshot)
      if (reason === null) return null
      return h('div', { className: CLASS_PREFIX + '-warn', role: 'status' }, t(reason.key, reason.params))
    }

    /** Shorten a label to a character budget with an ellipsis. */
    function clip(text, budget) {
      return text.length <= budget ? text : text.slice(0, budget - 1) + '\u2026'
    }

    /** A state chip: the tone dot plus the localized label. */
    function stateChip(key, t) {
      return h('span', {
        key: key,
        className: CLASS_PREFIX + '-chip',
        'data-state': key,
      }, h('span', { className: CLASS_PREFIX + '-dot' }), stateLabel(t, key === 'none' ? null : key))
    }

    /**
     * Build the SVG body. Memoized on its data: the viewport lives in the
     * group's own attribute, so a pan or a wheel tick must NOT rebuild hundreds
     * of nodes and edges — that reconciliation per frame is the smear left
     * behind a drag. Callbacks arrive through `handlers`, a ref kept current by
     * the panel, so a changing closure cannot invalidate the memo either.
     */
    var GraphBody = React.memo(function GraphBody(props) {
      var onNodeClick = function (id, bundle) {
        var fn = props.handlers.current.nodeClick
        if (typeof fn === 'function') fn(id, bundle)
      }
      var onNodeEnter = function (id) {
        var fn = props.handlers.current.nodeEnter
        if (typeof fn === 'function') fn(id)
      }
      var onNodeLeave = function () {
        var fn = props.handlers.current.nodeLeave
        if (typeof fn === 'function') fn()
      }
      var edgeElements = []
      var drawnEdges = new Set()
      for (var edgeIndex = 0; edgeIndex < props.edges.length; edgeIndex += 1) {
        var edge = props.edges[edgeIndex]
        var anchor = props.edgeAnchor(edge)
        if (anchor === null) continue
        if (props.visible.get(anchor.from) !== true || props.visible.get(anchor.to) !== true) continue
        var edgeKey = anchor.from + '\u0000' + anchor.to + '\u0000' + String(anchor.aggregated)
        if (drawnEdges.has(edgeKey)) continue
        drawnEdges.add(edgeKey)
        var fromNode = props.nodeIndex.get(anchor.from)
        var toNode = props.nodeIndex.get(anchor.to)
        if (fromNode === undefined || toNode === undefined) continue
        var startX = fromNode.x + props.box.nodeWidth
        var startY = fromNode.y + props.box.nodeHeight / 2
        var endX = toNode.x - 6
        var endY = toNode.y + props.box.nodeHeight / 2
        var bend = Math.max(24, (endX - startX) / 1.8)
        var hot = props.selected !== null && (anchor.from === props.selected || anchor.to === props.selected)
        edgeElements.push(h('path', {
          key: edgeKey,
          className: CLASS_PREFIX + '-edge',
          d: 'M ' + startX + ' ' + startY
            + ' C ' + (startX + bend) + ' ' + startY
            + ' ' + (endX - bend) + ' ' + endY
            + ' ' + endX + ' ' + endY,
          'data-kind': edge.kind,
          'data-agg': String(anchor.aggregated),
          'data-hot': String(hot),
          'data-dim': String(props.selected !== null && !hot),
          'marker-end': 'url(#dpt-arrow' + (hot ? '-hot' : '') + ')',
        }))
      }

      var nodeElements = []
      for (var cursor = 0; cursor < props.nodes.length; cursor += 1) {
        var node = props.nodes[cursor]
        if (props.visible.get(node.id) !== true) continue
        if (node.x + props.box.nodeWidth < props.reachLeft || node.x > props.reachRight) continue
        if (node.y + props.box.nodeHeight < props.reachTop || node.y > props.reachBottom) continue
        var isBundle = node.plane === 'bundle'
        var members = isBundle ? props.bundleMembers.get(node.id) : undefined
        var memberCount = members === undefined ? 0 : members.length
        nodeElements.push(h('g', {
          key: node.id,
          className: CLASS_PREFIX + '-node',
          transform: 'translate(' + node.x + ',' + node.y + ')',
          'data-state': node.state === null ? 'none' : node.state,
          'data-plane': node.plane,
          'data-selected': String(node.id === props.selected),
          'data-dim': String(node.hasEdge === true && props.selected !== null && !props.isNeighbour(node.id)),
          'data-tail': String(node.tail === true),
          'data-bundle': String(isBundle),
          'data-collapsed': String(isBundle && !props.expanded.has(node.id)),
          onClick: function (id, bundle) {
            return function (event) {
              event.stopPropagation()
              onNodeClick(id, bundle)
            }
          }(node.id, isBundle),
          onMouseEnter: function (id) {
            return function () { onNodeEnter(id) }
          }(node.id),
          onMouseLeave: function () { onNodeLeave() },
        },
        h('title', null, node.id + (node.state === null ? '' : ' \u2014 ' + stateLabel(props.t, node.state))),
        h('rect', { width: props.box.nodeWidth, height: props.box.nodeHeight, rx: 10, ry: 10 }),
        h('circle', {
          cx: 14,
          cy: props.box.nodeHeight / 2,
          r: 4,
          className: CLASS_PREFIX + '-dot',
          // SVG paints with `fill`; `background` (the CSS the HTML dots use)
          // simply does not apply to a shape, which left this circle at its
          // initial black no matter what the stylesheet said.
          fill: stateFill(node.state === null ? 'none' : node.state),
        }),
        h('text', { x: 28, y: 18, className: CLASS_PREFIX + '-node-title' },
          isBundle ? clip(node.label, 16) : clip(node.label, 22)),
        h('text', { x: 28, y: 32, className: CLASS_PREFIX + '-node-sub' },
          isBundle && memberCount > 0
            ? (props.expanded.has(node.id) ? props.t('bundle.collapse') : props.t('bundle.expand').replace('{count}', String(memberCount)))
            : nodeSubtitle(node, props.t)),
        isBundle
          ? h('text', {
            x: props.box.nodeWidth - 12,
            y: 18,
            className: CLASS_PREFIX + '-node-badge',
            textAnchor: 'end',
          }, props.expanded.has(node.id) ? '\u25be' : '\u25b8')
          : (node.plane === 'host' || node.kind === 'both'
            ? h('text', {
              x: props.box.nodeWidth - 12,
              y: 18,
              className: CLASS_PREFIX + '-node-badge',
              textAnchor: 'end',
            }, node.plane === 'host' ? 'HOST' : 'H+C')
            : null),
        node.services.length > node.providers.length
          ? h('text', {
            x: props.box.nodeWidth - 12,
            y: 32,
            className: CLASS_PREFIX + '-node-badge',
            textAnchor: 'end',
            fill: 'var(--dsw-alias-state-warn-label)',
          }, '+' + String(node.services.length - node.providers.length))
          : null))
      }

      return h('g', null,
        h('g', null, edgeElements),
        h('g', null, nodeElements))
    }, function equal(previous, next) {
      return previous.visible === next.visible
        && previous.nodes === next.nodes
        && previous.edges === next.edges
        && previous.box === next.box
        && previous.selected === next.selected
        && previous.expanded === next.expanded
        && previous.t === next.t
        && previous.reachLeft === next.reachLeft
        && previous.reachTop === next.reachTop
        && previous.reachRight === next.reachRight
        && previous.reachBottom === next.reachBottom
    })

    /**
     * The topology panel: toolbar, graph or table, and the selected plugin's
     * detail. Every value it shows comes from the live snapshot.
     * @param props - the injected face (`store`, `t`, `open`) plus runtime props.
     */
    function TopologyPanel(props) {
      var store = props.store
      var t = props.t === undefined ? function (key) { return key } : props.t
      var openPanel = props.open
      var snapshot = useSnapshot(store)

      var queryState = useState('')
      var query = queryState[0]
      var setQuery = queryState[1]
      var viewState = useState('graph')
      var view = viewState[0]
      var setView = viewState[1]
      // `null` means every state. A single-choice filter (not a checkbox set):
      // picking a state shows only that state, which is the reading people bring
      // to a row of state chips.
      var stateFilterState = useState(null)
      var stateFilter = stateFilterState[0]
      var setStateFilter = stateFilterState[1]
      // The composition graph is on, and bundles start collapsed: a bundle is a
      // container, and drawing all of them expanded is what buried the real
      // dependency edges under bundle-to-row lines.
      var expandedState = useState(function () { return new Set() })
      var expanded = expandedState[0]
      var setExpanded = expandedState[1]
      var planeState = useState(function () { return { browser: true, host: true, bundle: true, orphan: false } })
      var planes = planeState[0]
      var setPlanes = planeState[1]
      var selectedState = useState(null)
      var selected = selectedState[0]
      var setSelected = selectedState[1]
      var hoveredState = useState(null)
      var hovered = hoveredState[0]
      var setHovered = hoveredState[1]
      var draggingState = useState(false)
      var dragging = draggingState[0]
      var setDragging = draggingState[1]

      var nodes = snapshot === null ? [] : snapshot.nodes
      var edges = snapshot === null ? [] : snapshot.edges
      var box = snapshot === null ? null : snapshot.box
      var revision = snapshot === null ? null : snapshot.rev
      var lowered = query.trim().toLowerCase()

      // Collapse: a bundle stands in for the rows it contributes. This is the
      // one lever that keeps a 400-node graph showing its dependency structure
      // instead of its inventory.
      var nodeIndex = useMemo(function () {
        var map = new Map()
        for (var index = 0; index < nodes.length; index += 1) map.set(nodes[index].id, nodes[index])
        return map
      }, [nodes])

      /** First bundle owning a collapsed row, so its edges can reroute. */
      var ownerBundle = function (node) {
        if (node.bundle === null || node.bundle === undefined || node.bundle.length === 0) return null
        for (var index = 0; index < node.bundle.length; index += 1) {
          var id = '\u0001bundle:' + node.bundle[index]
          if (nodeIndex.has(id)) return id
        }
        return null
      }

      var bundleMembers = useMemo(function () {
        var map = new Map()
        for (var index = 0; index < nodes.length; index += 1) {
          var node = nodes[index]
          if (node.plane === 'bundle') map.set(node.id, [])
        }
        for (var memberIndex = 0; memberIndex < nodes.length; memberIndex += 1) {
          var member = nodes[memberIndex]
          if (member.bundle === null || member.bundle === undefined) continue
          for (var ownerIndex = 0; ownerIndex < member.bundle.length; ownerIndex += 1) {
            var list = map.get('\u0001bundle:' + member.bundle[ownerIndex])
            if (list !== undefined) list.push(member.id)
          }
        }
        return map
      }, [nodes])

      var collapsedBundles = useMemo(function () {
        var set = new Set()
        bundleMembers.forEach(function (members, bundleId) {
          if (expanded.has(bundleId)) return
          for (var index = 0; index < members.length; index += 1) set.add(members[index])
        })
        return set
      }, [bundleMembers, expanded])

      /**
       * Where one graph edge is drawn: itself, unless an endpoint is inside a
       * collapsed bundle, in which case it becomes one aggregate line between
       * the containers that own its ends.
       * @param edge - graph edge.
       * @returns `{ from, to, aggregated }`, or null when it is fully internal.
       */
      var edgeAnchor = function (edge) {
        var fromNode = nodeIndex.get(edge.from)
        var toNode = nodeIndex.get(edge.to)
        if (fromNode === undefined || toNode === undefined) return null
        var from = collapsedBundles.has(edge.from) ? ownerBundle(fromNode) : edge.from
        var to = collapsedBundles.has(edge.to) ? ownerBundle(toNode) : edge.to
        if (from === null || to === null) return null
        if (from === to) return null
        return { from: from, to: to, aggregated: from !== edge.from || to !== edge.to }
      }

      var visible = useMemo(function () {
        var result = new Map()
        var filters = {
          browser: planes.browser,
          host: planes.host,
          bundle: planes.bundle,
          orphan: planes.orphan,
          collapsed: collapsedBundles,
        }
        for (var index = 0; index < nodes.length; index += 1) {
          result.set(nodes[index].id, matches(nodes[index], lowered, stateFilter, filters))
        }
        return result
      }, [nodes, lowered, stateFilter, planes, collapsedBundles])

      var visibleCount = 0
      visible.forEach(function (value) { if (value) visibleCount += 1 })

      var planeCounts = { browser: 0, host: 0, bundle: 0, orphan: 0 }
      for (var planeIndex = 0; planeIndex < nodes.length; planeIndex += 1) {
        if (planeCounts[nodes[planeIndex].plane] === undefined) planeCounts[nodes[planeIndex].plane] = 0
        planeCounts[nodes[planeIndex].plane] += 1
        if (nodes[planeIndex].hasEdge !== true) planeCounts.orphan += 1
      }

      // The orphan facet, listed in the side panel instead of drawn: it is a
      // flat inventory of plugins with no edge, and drawing it is what turned
      // the composition graph into one thin line before.
      var orphans = nodes.filter(function (node) {
        return node.hasEdge !== true
          && matches(node, '', stateFilter, { browser: true, host: true, bundle: true, orphan: true })
      })

      // Fit once per graph size, never per republish: a live fiber transition
      // rebuilds the snapshot constantly, and refitting there would throw the
      // user's zoom and pan away mid-inspection.
      var canvasRef = useRef(null)
      var groupRef = useRef(null)
      var initialViewport = { scale: 1, tx: 0, ty: 0 }
      var viewportState = useState(initialViewport)
      var viewport = viewportState[0]
      var setViewport = viewportState[1]
      // The pointer path writes the group transform straight to the DOM. The
      // group therefore carries NO React `transform` prop: if React owned that
      // attribute, every render would snap the content back to the last
      // published viewport, which is exactly the trail left behind a drag.
      var viewportRef = useRef(initialViewport)
      var syncingRef = useRef(false)
      var dragRef = useRef(null)
      var frameRef = useRef(null)
      var boxRef = useRef(null)
      boxRef.current = box

      var applyTransform = function (next) {
        var group = groupRef.current
        if (group === null) return
        var value = 'translate(' + next.tx + ',' + next.ty + ') scale(' + next.scale + ')'
        if (group.getAttribute('transform') !== value) {
          group.setAttribute('transform', value)
          // A live readout from the same code path that moves the canvas, so the
          // geometry can be verified from the DOM even with no console access.
          group.setAttribute('data-view', 's=' + next.scale.toFixed(3) + ' tx=' + Math.round(next.tx) + ' ty=' + Math.round(next.ty))
        }
      }

      /**
       * Publish a live viewport to React on the next frame at the latest. The
       * grouped transform is already on screen, so a stale render is invisible;
       * this only keeps the zoom readout and the culling window current.
       */
      var syncViewport = function () {
        if (syncingRef.current) return
        syncingRef.current = true
        if (typeof requestAnimationFrame !== 'function') {
          syncingRef.current = false
          setViewport(viewportRef.current)
          return
        }
        requestAnimationFrame(function () {
          syncingRef.current = false
          setViewport(viewportRef.current)
        })
      }

      var commitViewport = function (next) {
        var clamped = { scale: clampScale(next.scale), tx: next.tx, ty: next.ty }
        viewportRef.current = clamped
        applyTransform(clamped)
        syncViewport()
      }

      /**
       * Apply an interactive viewport change: the DOM now, React next frame.
       * @param next - the new viewport.
       */
      var scheduleViewport = function (next) {
        var clamped = { scale: clampScale(next.scale), tx: next.tx, ty: next.ty }
        viewportRef.current = clamped
        applyTransform(clamped)
        if (frameRef.current !== null) return
        frameRef.current = requestAnimationFrame(function () {
          frameRef.current = null
          setViewport(viewportRef.current)
        })
      }

      useEffect(function () {
        return function () {
          if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
        }
      }, [])

      // The viewport is anchored in CSS pixels of the canvas, so the drawn
      // geometry scales through the group transform instead of through the
      // viewBox. That is what keeps a node a fixed, readable size at any zoom
      // and lets the wheel zoom about the pointer exactly.
      var measureCanvas = function () {
        var canvas = canvasRef.current
        if (canvas === null) return undefined
        var bounds = canvas.getBoundingClientRect()
        if (bounds.width <= 0 || bounds.height <= 0) return undefined
        return { width: bounds.width, height: bounds.height }
      }

      /** Damped zoom about one client point; the point under it stays put. */
      var zoomAt = function (clientX, clientY, targetScale, interactive) {
        var canvas = canvasRef.current
        var current = viewportRef.current
        if (canvas === null) return
        var bounds = canvas.getBoundingClientRect()
        if (bounds.width <= 0 || bounds.height <= 0) return
        var scale = clampScale(targetScale)
        var px = (clientX - bounds.left - current.tx) / current.scale
        var py = (clientY - bounds.top - current.ty) / current.scale
        var next = { scale: scale, tx: clientX - bounds.left - px * scale, ty: clientY - bounds.top - py * scale }
        if (interactive === true) scheduleViewport(next)
        else commitViewport(next)
      }

      var zoomBy = function (factor) {
        var canvas = canvasRef.current
        if (canvas === null) return
        var bounds = canvas.getBoundingClientRect()
        // `factor` multiplies the scale, so > 1 zooms in — the callsites pass
        // 1.25 for `+` and 1/1.25 for `−`.
        zoomAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, viewportRef.current.scale * factor)
      }

      /**
       * Show a drawing rectangle at a readable zoom: fill the window with it,
       * but never zoom out past what keeps a node legible — the remainder is
       * reached by panning, which is the point of an infinite canvas.
       * @param rect - rectangle in drawing units to frame.
       * @param maxScale - upper bound for the resulting zoom.
       */
      var fitRect = function (rect, maxScale) {
        var bounds = measureCanvas()
        if (bounds === undefined || rect.width <= 0 || rect.height <= 0) return
        var scale = Math.min(bounds.width / rect.width, bounds.height / rect.height)
        scale = Math.max(MIN_READABLE_SCALE, Math.min(maxScale, scale))
        commitViewport({
          scale: scale,
          tx: bounds.width / 2 - (rect.x + rect.width / 2) * scale,
          ty: bounds.height / 2 - (rect.y + rect.height / 2) * scale,
        })
      }

      var fitGraph = function () {
        var reference = boxRef.current
        if (reference === null) return
        fitRect({ x: 0, y: 0, width: reference.width, height: reference.height }, MAX_FIT_SCALE)
      }

      var fitSizeRef = useRef(null)
      useEffect(function () {
        if (box === null || box.width <= 0) return
        var size = revision + ':' + box.width + 'x' + box.height
        if (fitSizeRef.current === size) return
        fitSizeRef.current = size
        fitGraph()
      }, [revision, box])

      // The group carries no React transform, so the first placement is applied
      // here. A later republish leaves whatever the user set alone.
      useEffect(function () {
        applyTransform(viewportRef.current)
      }, [box])

      useEffect(function () {
        return function () {
          if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
        }
      }, [])

      /**
       * Pan and wheel zoom are bound natively: React's synthetic wheel listener
       * is passive, so it cannot preventDefault the page scroll or the browser's
       * own pinch-zoom.
       */
      useEffect(function () {
        var canvas = canvasRef.current
        if (canvas === null) return undefined
        var onWheel = function (event) {
          event.preventDefault()
          var factor = Math.exp(-event.deltaY * 0.0016)
          zoomAt(event.clientX, event.clientY, viewportRef.current.scale * factor, true)
        }
        var onPointerDown = function (event) {
          if (event.button !== 0) return
          var target = event.target
          // Controls drawn over the canvas own their own pointer: starting a pan
          // under the HUD would capture the pointer and swallow the button.
          if (target !== null && target.closest !== undefined
            && target.closest('.' + CLASS_PREFIX + '-hud') !== null) return
          var onNode = target !== null && target.closest !== undefined
            && target.closest('.' + CLASS_PREFIX + '-node') !== null
          if (onNode) return
          dragRef.current = { x: event.clientX, y: event.clientY, tx: viewportRef.current.tx, ty: viewportRef.current.ty }
          setDragging(true)
          if (typeof canvas.setPointerCapture === 'function') canvas.setPointerCapture(event.pointerId)
          event.preventDefault()
        }
        var onPointerMove = function (event) {
          var start = dragRef.current
          if (start === null || start === undefined) return
          event.preventDefault()
          scheduleViewport({
            scale: viewportRef.current.scale,
            tx: start.tx + (event.clientX - start.x),
            ty: start.ty + (event.clientY - start.y),
          })
        }
        var onPointerUp = function (event) {
          if (dragRef.current === null || dragRef.current === undefined) return
          dragRef.current = null
          setDragging(false)
          if (typeof canvas.releasePointerCapture === 'function'
            && canvas.hasPointerCapture !== undefined
            && canvas.hasPointerCapture(event.pointerId)) {
            canvas.releasePointerCapture(event.pointerId)
          }
        }
        canvas.addEventListener('wheel', onWheel, { passive: false })
        canvas.addEventListener('pointerdown', onPointerDown)
        canvas.addEventListener('pointermove', onPointerMove)
        canvas.addEventListener('pointerup', onPointerUp)
        canvas.addEventListener('pointercancel', onPointerUp)
        return function () {
          canvas.removeEventListener('wheel', onWheel)
          canvas.removeEventListener('pointerdown', onPointerDown)
          canvas.removeEventListener('pointermove', onPointerMove)
          canvas.removeEventListener('pointerup', onPointerUp)
          canvas.removeEventListener('pointercancel', onPointerUp)
        }
      }, [])

      var selectedNode = null
      for (var lookup = 0; lookup < nodes.length; lookup += 1) {
        if (nodes[lookup].id === selected) { selectedNode = nodes[lookup]; break }
      }

      var neighbours = useMemo(function () {
        var focus = selected === null ? hovered : selected
        var set = new Set()
        if (focus === null) return set
        set.add(focus)
        for (var index = 0; index < edges.length; index += 1) {
          var anchor = edgeAnchor(edges[index])
          if (anchor === null) continue
          if (anchor.from === focus) set.add(anchor.to)
          if (anchor.to === focus) set.add(anchor.from)
        }
        return set
      }, [edges, selected, hovered, collapsedBundles, nodeIndex])

      var isNeighbour = function (id) { return neighbours.has(id) }

      /**
       * Callbacks the memoized body calls. A ref (not props) because the body's
       * props must stay referentially stable across a pan: a fresh closure each
       * render would defeat the memo and bring the drag smear back.
       */
      var handlersRef = useRef({})
      handlersRef.current = {
        nodeClick: function (id, bundle) {
          if (bundle) {
            // A bundle is a container: clicking it folds or unfolds the rows it
            // contributes instead of selecting it.
            setExpanded(function (previous) {
              var next = new Set(previous)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
            return
          }
          var next = id === selected ? null : id
          setSelected(next)
          if (next !== null) {
            var target = nodeIndex.get(next)
            if (target !== undefined) focusNode(target)
          }
        },
        nodeEnter: function (id) { setHovered(id) },
        nodeLeave: function () { setHovered(null) },
      }

      /**
       * Bring one node into view at a readable zoom, leaving the rest of the
       * graph its own scale.
       * @param node - the node to frame.
       */
      var focusNode = function (node) {
        if (box === null || node === null || node === undefined) return
        var width = 6 * box.nodeWidth
        var height = 10 * box.nodeHeight
        fitRect(
          { x: node.x + box.nodeWidth / 2 - width / 2, y: node.y + box.nodeHeight / 2 - height / 2, width: width, height: height },
          1,
        )
      }

      var togglePlane = function (plane) {
        setPlanes(function (previous) {
          var next = { browser: previous.browser, host: previous.host, bundle: previous.bundle, orphan: previous.orphan }
          next[plane] = !next[plane]
          return next
        })
      }

      var fit = fitGraph

      /**
       * One state's chip. This is a single-choice filter, not a checkbox: it
       * reads "show only this state". Exclude-style checkboxes were tried first
       * and read backwards — unticking a state hid the OTHER states, because
       * only unticked states become a filter at all.
       * @param key - state key, or `all` for the reset chip.
       */
      var stateChipFor = function (key) {
        var isAll = key === 'all'
        var selected = isAll ? stateFilter === null : stateFilter === key
        var count = snapshot === null || isAll ? 0 : snapshot.counts[key]
        return h('button', {
          key: key,
          type: 'button',
          className: CLASS_PREFIX + '-chip',
          'data-clickable': 'true',
          'data-on': String(selected),
          'data-state': isAll ? 'all' : key,
          title: isAll ? t('filter.allHint') : t('filter.onlyHint').replace('{state}', stateLabel(t, key === 'none' ? null : key)),
          'aria-pressed': String(selected),
          onClick: function () {
            setStateFilter(function (previous) {
              if (isAll) return null
              return previous === key ? null : key
            })
          },
        },
        h('span', { className: CLASS_PREFIX + '-dot', 'aria-hidden': 'true' }),
        isAll ? t('filter.all') : stateLabel(t, key === 'none' ? null : key),
        isAll ? null : h('span', { className: CLASS_PREFIX + '-count' }, String(count)))
      }

      var planeChip = function (plane) {
        var on = planes[plane] === true
        var count = planeCounts[plane] === undefined ? 0 : planeCounts[plane]
        return h('button', {
          key: plane,
          type: 'button',
          className: CLASS_PREFIX + '-chip',
          'data-clickable': 'true',
          'data-on': String(on),
          title: t(on ? 'plane.hide' : 'plane.show'),
          role: 'checkbox',
          'aria-checked': String(on),
          'aria-label': t('plane.' + plane),
          onClick: function () { togglePlane(plane) },
        },
        h('span', { className: CLASS_PREFIX + '-check', 'aria-hidden': 'true' }, on ? '\u2713' : ''),
        t('plane.' + plane),
        h('span', { className: CLASS_PREFIX + '-count' }, String(count)))
      }

      var toolbar = h('header', { className: CLASS_PREFIX + '-head' },
        h('h2', { className: CLASS_PREFIX + '-title' }, t('panel.title')),
        h('span', { className: CLASS_PREFIX + '-caption' },
          snapshot === null
            ? t('status.loading')
            : t('status.summary', {
              nodes: visibleCount,
              total: snapshot.nodes.length,
              edges: snapshot.edges.length,
              source: snapshot.graphSource,
            })),
        h('span', { className: CLASS_PREFIX + '-spacer' }),
        h('div', { className: CLASS_PREFIX + '-chips' },
          ['all'].concat(STATE_ORDER).map(stateChipFor)),
        h('input', {
          className: CLASS_PREFIX + '-field',
          type: 'search',
          value: query,
          placeholder: t('search.placeholder'),
          'aria-label': t('search.placeholder'),
          onChange: function (event) { setQuery(event.target.value) },
        }),
        h('div', { className: CLASS_PREFIX + '-chips' },
          // A segmented control: one selected segment reads unmistakably as the
          // current view, unlike two independent buttons that only tint.
          h('div', { className: CLASS_PREFIX + '-segmented', role: 'group', 'aria-label': t('view.label') },
            h('button', {
              type: 'button',
              className: CLASS_PREFIX + '-btn',
              'data-on': String(view === 'graph'),
              'aria-pressed': String(view === 'graph'),
              onClick: function () { setView('graph') },
            }, t('view.graph')),
            h('button', {
              type: 'button',
              className: CLASS_PREFIX + '-btn',
              'data-on': String(view === 'list'),
              'aria-pressed': String(view === 'list'),
              onClick: function () { setView('list') },
            }, t('view.list'))),
          h('button', {
            type: 'button',
            className: CLASS_PREFIX + '-btn',
            onClick: function () { if (store !== undefined) store.refresh() },
          }, t('action.refresh'))))

      var subhead = h('div', { className: CLASS_PREFIX + '-subhead' },
        h('div', { className: CLASS_PREFIX + '-chips' },
          h('span', { className: CLASS_PREFIX + '-caption' }, t('plane.label')),
          planeChip('browser'),
          planeChip('host'),
          planeChip('bundle'),
          planeChip('orphan')),
        h('span', { className: CLASS_PREFIX + '-spacer' }),
        h('div', { className: CLASS_PREFIX + '-legend' },
          STATE_ORDER.map(function (key) {
            return h('span', { key: key, 'data-state': key },
              h('span', { className: CLASS_PREFIX + '-dot' }), stateLabel(t, key))
          }),
          h('span', null, h('span', { className: CLASS_PREFIX + '-line', 'data-kind': 'bundle' }), t('legend.bundle')),
          h('span', null, h('span', { className: CLASS_PREFIX + '-line' }), t('legend.requires')),
          h('span', null, h('span', { className: CLASS_PREFIX + '-line', 'data-dashed': 'true' }), t('legend.service'))))

      var pane = null
      if (view === 'graph') {
        // Culling bounds are bucketed: at raw values they would change on every
        // pointer event and re-render the memoized body each frame, which is
        // exactly the smear this memo exists to remove. React stays live through
        // the HUD readout and `data-view` on the transform group.
        var bucket = function (value) {
          if (!isFinite(value)) return value
          return Math.round(value / 512) * 512
        }
        var canvasBounds = canvasRef.current === null ? null : canvasRef.current.getBoundingClientRect()
        var scale = viewport.scale <= 0 ? 1 : viewport.scale
        var reachLeft = canvasBounds === null ? -Infinity : bucket((-viewport.tx - 512) / scale)
        var reachTop = canvasBounds === null ? -Infinity : bucket((-viewport.ty - 512) / scale)
        var reachRight = canvasBounds === null
          ? Infinity
          : bucket((canvasBounds.width - viewport.tx + 512) / scale)
        var reachBottom = canvasBounds === null
          ? Infinity
          : bucket((canvasBounds.height - viewport.ty + 512) / scale)
        var body = h(GraphBody, {
          visible: visible,
          nodes: nodes,
          edges: edges,
          box: box,
          selected: selected,
          expanded: expanded,
          t: t,
          reachLeft: reachLeft,
          reachTop: reachTop,
          reachRight: reachRight,
          reachBottom: reachBottom,
          bundleMembers: bundleMembers,
          nodeIndex: nodeIndex,
          edgeAnchor: edgeAnchor,
          isNeighbour: isNeighbour,
          handlers: handlersRef,
        })

        pane = h('div',
          {
            className: CLASS_PREFIX + '-canvas',
            ref: canvasRef,
            'data-dragging': String(dragging),
            onClick: function () { setSelected(null) },
          },
          h('div', { className: CLASS_PREFIX + '-grid' }),
          box === null
            ? null
            : h('svg', {
              className: CLASS_PREFIX + '-svg',
              width: '100%',
              height: '100%',
              'data-detail': String(viewport.scale >= 0.45),
              role: 'img',
              'aria-label': t('panel.title'),
            },
            h('defs', null,
              h('marker', {
                id: 'dpt-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5,
                markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse',
              }, h('path', { className: CLASS_PREFIX + '-arrow', d: 'M 0 0 L 10 5 L 0 10 z' })),
              h('marker', {
                id: 'dpt-arrow-hot', viewBox: '0 0 10 10', refX: 9, refY: 5,
                markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse',
              }, h('path', { className: CLASS_PREFIX + '-arrow', 'data-hot': 'true', d: 'M 0 0 L 10 5 L 0 10 z' }))),
            h('g', {
              ref: groupRef,
            },
            body)),
          visibleCount === 0
            ? h('div', { className: CLASS_PREFIX + '-empty' },
              h('div', null, t('empty.title')),
              h('div', { className: CLASS_PREFIX + '-caption' }, t('empty.hint')))
            : null,
          h('div', { className: CLASS_PREFIX + '-hud' },
            h('span', { className: CLASS_PREFIX + '-zoom' },
              Math.round(viewport.scale * 100) + '%'
              + (box === null ? '' : ' \u00b7 ' + Math.round(box.width) + '\u00d7' + Math.round(box.height))),
            h('button', {
              type: 'button',
              className: CLASS_PREFIX + '-btn',
              'aria-label': t('action.zoomOut'),
              title: t('action.zoomOut'),
              onPointerDown: function (event) { event.stopPropagation(); zoomBy(1 / 1.25) },
            }, '\u2212'),
            h('button', {
              type: 'button',
              className: CLASS_PREFIX + '-btn',
              'aria-label': t('action.zoomIn'),
              title: t('action.zoomIn'),
              onPointerDown: function (event) { event.stopPropagation(); zoomBy(1.25) },
            }, '+'),
            h('button', {
              type: 'button',
              className: CLASS_PREFIX + '-btn',
              disabled: selected === null,
              title: t('action.zoomSelected'),
              onPointerDown: function (event) {
                event.stopPropagation()
                if (selectedNode !== null) focusNode(selectedNode)
              },
            }, t('action.zoomSelected')),
            h('button', {
              type: 'button',
              className: CLASS_PREFIX + '-btn',
              onPointerDown: function (event) { event.stopPropagation(); fit() },
            }, t('action.fit'))))      } else {
        var rows = nodes.filter(function (node) {
          return visible.get(node.id) === true
        }).sort(function (left, right) {
          var leftRank = STATE_ORDER.indexOf(left.state === null ? 'none' : left.state)
          var rightRank = STATE_ORDER.indexOf(right.state === null ? 'none' : right.state)
          if (leftRank !== rightRank) return (leftRank === -1 ? 99 : leftRank) - (rightRank === -1 ? 99 : rightRank)
          if (left.id < right.id) return -1
          if (left.id > right.id) return 1
          return 0
        })
        pane = h('div', { className: CLASS_PREFIX + '-table' },
          h('table', null,
            h('thead', null, h('tr', null,
              h('th', null, t('table.plugin')),
              h('th', null, t('table.state')),
              h('th', null, t('table.plane')),
              h('th', { className: CLASS_PREFIX + '-num' }, t('table.provides')),
              h('th', { className: CLASS_PREFIX + '-num' }, t('table.requires')),
              h('th', { className: CLASS_PREFIX + '-num' }, t('table.consumers')))),
            h('tbody', null, rows.map(function (node) {
              return h('tr', {
                key: node.id,
                'data-selected': String(node.id === selected),
                onClick: function () { setSelected(node.id) },
              },
              h('td', null,
                h('div', null, node.label),
                h('div', { className: CLASS_PREFIX + '-caption ' + CLASS_PREFIX + '-mono' },
                  node.moduleName === null || node.moduleName === undefined ? node.id : node.moduleName)),
              h('td', null, stateChip(node.state === null ? 'none' : node.state, t)),
              h('td', { className: CLASS_PREFIX + '-muted' }, planeLabel(node, t)),
              h('td', { className: CLASS_PREFIX + '-num' }, String(node.provides.length)),
              h('td', { className: CLASS_PREFIX + '-num' }, String(node.dependencies.length)),
              h('td', { className: CLASS_PREFIX + '-num' }, String(node.reverseDependencies.length)))
            }))))
      }

      var detail = null
      if (selectedNode === null) {
        detail = h('aside', { className: CLASS_PREFIX + '-detail' },
          h('div', { className: CLASS_PREFIX + '-detail-head' },
            h('div', null, h('h3', { className: CLASS_PREFIX + '-detail-name' }, t('detail.empty'))),
            h('span', { className: CLASS_PREFIX + '-spacer' }),
            h('button', {
              type: 'button',
              className: CLASS_PREFIX + '-btn',
              'data-on': 'true',
              onClick: function () { if (openPanel !== undefined) openPanel('plugins') },
            }, t('action.openPlugins'))),
          h('div', { className: CLASS_PREFIX + '-section' },
            h('p', { className: CLASS_PREFIX + '-caption' }, t('detail.emptyHint'))),
          snapshot === null
            ? null
            : h('div', { className: CLASS_PREFIX + '-section' },
              h('h4', null, t('section.overview')),
              h('dl', { className: CLASS_PREFIX + '-facts' },
                h('dt', null, t('fact.graph')),
                h('dd', null, snapshot.graphSource),
                h('dt', null, t('plane.label')),
                h('dd', null, t('plane.browser') + ' ' + String(planeCounts.browser)
                  + ' \u00b7 ' + t('plane.host') + ' ' + String(planeCounts.host)
                  + ' \u00b7 ' + t('plane.bundle') + ' ' + String(planeCounts.bundle))),
              h('h4', { style: { marginTop: '12px' } }, t('section.states')),
              h('div', { className: CLASS_PREFIX + '-chips' }, STATE_KEYS.map(function (key) {
                return h('span', { key: key, className: CLASS_PREFIX + '-chip', 'data-state': key },
                  h('span', { className: CLASS_PREFIX + '-dot' }),
                  stateLabel(t, key === 'none' ? null : key),
                  ' ',
                  String(snapshot.counts[key] === undefined ? 0 : snapshot.counts[key]))
              })),
              h('h4', { style: { marginTop: '12px' } }, t('section.orphans') + ' \u00b7 ' + String(orphans.length)),
              h('p', { className: CLASS_PREFIX + '-caption' }, t('orphans.hint')),
              orphans.length === 0
                ? h('p', { className: CLASS_PREFIX + '-caption' }, t('value.none'))
                : h('div', { className: CLASS_PREFIX + '-orphans' }, orphans.map(function (node) {
                  return h('button', {
                    key: node.id,
                    type: 'button',
                    className: CLASS_PREFIX + '-orphan',
                    'data-state': node.state === null ? 'none' : node.state,
                    title: node.moduleName === null || node.moduleName === undefined ? node.id : node.moduleName,
                    onClick: function () {
                      setSelected(node.id)
                      if (planes.orphan === true) focusNode(node)
                    },
                  },
                  h('span', { className: CLASS_PREFIX + '-dot' }),
                  h('span', { className: CLASS_PREFIX + '-orphan-name' }, node.label))
                })),
              h('h4', { style: { marginTop: '12px' } }, t('section.sources')),
              h('dl', { className: CLASS_PREFIX + '-facts' },
                h('dt', null, t('fact.nodes')),
                h('dd', null, String(snapshot.nodes.length)
                  + ' (' + t('plane.browser') + ' ' + String(snapshot.browserRows)
                  + ' \u00b7 ' + t('plane.host') + ' ' + String(snapshot.hostRows) + ')'),
                h('dt', null, t('fact.edges')),
                h('dd', null, String(snapshot.edges.length)
                  + ' (' + t('legend.bundle') + ' ' + String(snapshot.diagnostics.bundleEdges)
                  + ' \u00b7 ' + t('legend.requires') + ' ' + String(snapshot.diagnostics.packageEdges)
                  + ' \u00b7 ' + t('legend.service') + ' ' + String(snapshot.diagnostics.serviceEdges) + ')'),
                h('dt', null, t('fact.declared')),
                h('dd', null, String(snapshot.diagnostics.declaredDependencies)),
                h('dt', null, t('fact.entries')),
                h('dd', null, String(snapshot.diagnostics.entryCount)
                  + ' / ' + t('fact.fibers') + ' ' + String(snapshot.diagnostics.entriesWithFiber)
                  + ' / ' + t('fact.injections') + ' ' + String(snapshot.diagnostics.entriesWithInject)),
                h('dt', null, t('fact.moduleRows')),
                h('dd', null, String(snapshot.diagnostics.moduleRows)
                  + ' \u00b7 __DSH_BOOT__ ' + String(snapshot.diagnostics.bootRows)),
                h('dt', null, t('fact.services')),
                h('dd', null, String(snapshot.diagnostics.serviceCount)))))
      } else if (selectedNode.plane === 'bundle') {
        var bundleInfo = selectedNode.bundle === null || selectedNode.bundle === undefined
          ? { name: selectedNode.id, version: null, installed: false, optional: false, removable: false, description: '', error: null, rowCount: 0, overrideCount: 0 }
          : selectedNode.bundle
        detail = h('aside', { className: CLASS_PREFIX + '-detail' },
          h('div', { className: CLASS_PREFIX + '-detail-head' },
            h('div', null,
              h('h3', { className: CLASS_PREFIX + '-detail-name' }, selectedNode.label),
              h('div', { className: CLASS_PREFIX + '-detail-id ' + CLASS_PREFIX + '-mono' }, bundleInfo.name)),
            h('span', { className: CLASS_PREFIX + '-spacer' }),
            h('button', {
              type: 'button',
              className: CLASS_PREFIX + '-btn',
              'aria-label': t('action.clear'),
              title: t('action.clear'),
              onClick: function () { setSelected(null) },
            }, '\u2715')),
          h('div', { className: CLASS_PREFIX + '-section' },
            h('dl', { className: CLASS_PREFIX + '-facts' },
              h('dt', null, t('fact.state')),
              h('dd', null, selectedNode.visible ? t('bundle.enabled') : t('bundle.disabled')),
              h('dt', null, t('fact.revision')),
              h('dd', null, bundleInfo.version === null ? t('value.absent') : bundleInfo.version),
              h('dt', null, t('bundle.installed')),
              h('dd', null, bundleInfo.installed ? t('value.yes') : t('value.no')),
              h('dt', null, t('bundle.optional')),
              h('dd', null, bundleInfo.optional ? t('value.yes') : t('value.no')),
              h('dt', null, t('bundle.removable')),
              h('dd', null, bundleInfo.removable ? t('value.yes') : t('value.no')),
              bundleInfo.error === null ? null : h('dt', null, t('bundle.error')),
              bundleInfo.error === null ? null : h('dd', null, bundleInfo.error))),
          bundleInfo.description === '' ? null : h('div', { className: CLASS_PREFIX + '-section' },
            h('p', { className: CLASS_PREFIX + '-caption' }, bundleInfo.description)),
          h('div', { className: CLASS_PREFIX + '-section' },
            h('h4', null, t('section.rows') + ' \u00b7 ' + String(selectedNode.reverseDependencies.length)),
            h('div', { className: CLASS_PREFIX + '-list' },
              selectedNode.reverseDependencies.length === 0
                ? h('p', { className: CLASS_PREFIX + '-caption' }, t('value.none'))
                : selectedNode.reverseDependencies.map(function (id) {
                  var row = null
                  for (var lookupRow = 0; lookupRow < nodes.length; lookupRow += 1) {
                    if (nodes[lookupRow].id === id) { row = nodes[lookupRow]; break }
                  }
                  return h('button', {
                    key: id,
                    type: 'button',
                    className: CLASS_PREFIX + '-row',
                    onClick: function () { setSelected(id) },
                  },
                  h('span', { className: CLASS_PREFIX + '-row-name' },
                    row === null || row.moduleName === null || row.moduleName === undefined ? id : row.moduleName),
                  h('span', { className: CLASS_PREFIX + '-tag' }, '\u2192'))
                }))),
          bundleInfo.overrideCount === 0 ? null : h('div', { className: CLASS_PREFIX + '-section' },
            h('p', { className: CLASS_PREFIX + '-caption' },
              t('bundle.overrides').replace('{count}', String(bundleInfo.overrideCount)))))
      } else {
        detail = h('aside', { className: CLASS_PREFIX + '-detail' },
          h('div', { className: CLASS_PREFIX + '-detail-head' },
            h('div', null,
              h('h3', { className: CLASS_PREFIX + '-detail-name' }, selectedNode.label),
              h('div', { className: CLASS_PREFIX + '-detail-id ' + CLASS_PREFIX + '-mono' }, selectedNode.id)),
            h('span', { className: CLASS_PREFIX + '-spacer' }),
            h('button', {
              type: 'button',
              className: CLASS_PREFIX + '-btn',
              title: t('action.zoomSelected'),
              onClick: function () { focusNode(selectedNode) },
            }, t('action.zoomSelected')),
            h('button', {
              type: 'button',
              className: CLASS_PREFIX + '-btn',
              'aria-label': t('action.clear'),
              title: t('action.clear'),
              onClick: function () { setSelected(null) },
            }, '\u2715')),
          h('div', { className: CLASS_PREFIX + '-section' },
            h('dl', { className: CLASS_PREFIX + '-facts' },
              h('dt', null, t('fact.state')),
              h('dd', null, stateChip(selectedNode.state === null ? 'none' : selectedNode.state, t)),
              h('dt', null, t('fact.plane')),
              h('dd', null, planeLabel(selectedNode, t)),
              h('dt', null, t('fact.enabled')),
              h('dd', null, selectedNode.visible ? t('value.yes') : t('value.no')),
              h('dt', null, t('fact.fiber')),
              h('dd', null, selectedNode.hasFiber ? '#' + String(selectedNode.uid) : t('value.absent')),
              h('dt', null, t('fact.entry')),
              h('dd', { className: CLASS_PREFIX + '-mono' },
                selectedNode.entryId === null ? t('value.absent') : selectedNode.entryId),
              selectedNode.rev === null ? null : h('dt', null, t('fact.revision')),
              selectedNode.rev === null
                ? null
                : h('dd', { className: CLASS_PREFIX + '-mono ' + CLASS_PREFIX + '-caption' }, selectedNode.rev))),

          selectedNode.host === null || selectedNode.host.length === 0
            ? null
            : h('div', { className: CLASS_PREFIX + '-section' },
              h('h4', null, t('section.host')),
              h('div', { className: CLASS_PREFIX + '-list' }, selectedNode.host.map(function (row, index) {
                return h('div', {
                  key: row.entryId === null ? String(index) : row.entryId,
                  className: CLASS_PREFIX + '-row',
                  'data-static': 'true',
                },
                stateChip(row.state === null ? 'none' : row.state, t),
                h('span', {
                  className: CLASS_PREFIX + '-row-name',
                  title: row.description,
                }, row.title === '' ? row.moduleName : row.title))
              }))),

          h('div', { className: CLASS_PREFIX + '-section' },
            h('h4', null, t('section.provides') + ' \u00b7 ' + String(selectedNode.provides.length)),
            selectedNode.provides.length === 0
              ? h('p', { className: CLASS_PREFIX + '-caption' }, t('value.none'))
              : h('div', { className: CLASS_PREFIX + '-list' }, selectedNode.provides.map(function (service) {
                return h('div', {
                  key: service,
                  className: CLASS_PREFIX + '-row',
                  'data-static': 'true',
                }, h('span', { className: CLASS_PREFIX + '-row-name ' + CLASS_PREFIX + '-mono' }, service))
              }))),

          h('div', { className: CLASS_PREFIX + '-section' },
            h('h4', null, t('section.requires') + ' \u00b7 ' + String(selectedNode.services.length)),
            selectedNode.services.length === 0
              ? h('p', { className: CLASS_PREFIX + '-caption' }, t('value.none'))
              : h('div', { className: CLASS_PREFIX + '-list' }, selectedNode.services.map(function (service) {
                return h('div', {
                  key: service,
                  className: CLASS_PREFIX + '-row',
                  'data-static': 'true',
                },
                h('span', { className: CLASS_PREFIX + '-row-name ' + CLASS_PREFIX + '-mono' }, service),
                selectedNode.providers.indexOf(service) === -1
                  ? h('span', { className: CLASS_PREFIX + '-tag ' + CLASS_PREFIX + '-gap' }, t('value.unresolved'))
                  : null)
              }))),

          h('div', { className: CLASS_PREFIX + '-section' },
            h('h4', null, t('section.dependsOn') + ' \u00b7 ' + String(selectedNode.dependencies.length)),
            h('div', { className: CLASS_PREFIX + '-list' },
              selectedNode.dependencies.length === 0
                ? h('p', { className: CLASS_PREFIX + '-caption' }, t('value.none'))
                : selectedNode.dependencies.map(function (id) {
                  return h('button', {
                    key: id,
                    type: 'button',
                    className: CLASS_PREFIX + '-row',
                    onClick: function () { setSelected(id) },
                  },
                  h('span', { className: CLASS_PREFIX + '-row-name' }, id),
                  h('span', { className: CLASS_PREFIX + '-tag' }, '\u2190'))
                }))),

          selectedNode.bundle === null || selectedNode.bundle === undefined || selectedNode.bundle.length === 0
            ? null
            : h('div', { className: CLASS_PREFIX + '-section' },
              h('h4', null, t('section.bundles') + ' \u00b7 ' + String(selectedNode.bundle.length)),
              h('div', { className: CLASS_PREFIX + '-list' }, selectedNode.bundle.map(function (name) {
                return h('div', {
                  key: name,
                  className: CLASS_PREFIX + '-row',
                  'data-static': 'true',
                }, h('span', { className: CLASS_PREFIX + '-row-name' }, name))
              }))),

          h('div', { className: CLASS_PREFIX + '-section' },
            h('h4', null, t('section.dependedBy') + ' \u00b7 ' + String(selectedNode.reverseDependencies.length)),
            h('div', { className: CLASS_PREFIX + '-list' },
              selectedNode.reverseDependencies.length === 0
                ? h('p', { className: CLASS_PREFIX + '-caption' }, t('value.none'))
                : selectedNode.reverseDependencies.map(function (id) {
                  return h('button', {
                    key: id,
                    type: 'button',
                    className: CLASS_PREFIX + '-row',
                    onClick: function () { setSelected(id) },
                  },
                  h('span', { className: CLASS_PREFIX + '-row-name' }, id),
                  h('span', { className: CLASS_PREFIX + '-tag' }, '\u2192'))
                }))))
      }

      return h('div', { className: CLASS_PREFIX + '-root' },
        h('style', null, STYLES),
        toolbar,
        subhead,
        warnBanner(t, snapshot),
        h('div', { className: CLASS_PREFIX + '-body' }, pane, detail))
    }

    /** Decorative sidebar glyph for the panel row. */
    function TopologyIcon(props) {
      var size = props !== null && props !== undefined && typeof props.size === 'number' ? props.size : 16
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      },
      h('circle', { cx: 6, cy: 6.5, r: 2.6 }),
      h('circle', { cx: 19, cy: 6.5, r: 2.6 }),
      h('circle', { cx: 12.5, cy: 18.5, r: 2.6 }),
      h('path', { d: 'M8.6 6.5h7.8' }),
      h('path', { d: 'M7.4 8.7l3.6 7.2' }),
      h('path', { d: 'M18 8.8l-3.8 7.1' }))
    }

    /**
     * Resolve one service by key, tolerating its absence. A Cordis context
     * proxy throws on a property read of a service this fiber did not declare
     * in `inject`, so every optional service is read by name here instead.
     * @param ctx - client root context.
     * @param key - service key, e.g. `remote.pluginManager`.
     * @returns the service, or undefined when this composition has none.
     */
    function optionalService(ctx, key) {
      try {
        return ctx.get(key)
      } catch (error) {
        return undefined
      }
    }

    /**
     * Build the live topology store.
     *
     * Refreshes are coalesced into one microtask, so a burst of fiber
     * transitions (a plugin reload runs several) republishes once. The Host
     * sources arrive asynchronously and merge into the next snapshot; a failed
     * read degrades the view to the sources that did answer instead of breaking
     * it.
     *
     * @param ctx - client root context.
     * @returns `{ subscribe, getSnapshot, refresh, revision, hostFailure }`.
     */
    function createStore(ctx) {
      var listeners = new Set()
      var current = null
      var hostEntries = null
      var composition = null
      var hostError = null
      var failure = null
      var queued = false
      var disposed = false
      var revisions = 0

      var notify = function () {
        queued = false
        if (disposed) return
        try {
          current = buildSnapshot(ctx, hostEntries, composition)
          failure = null
        } catch (error) {
          // Kept on the store as well as logged: a throwing read is what makes
          // the panel look merely empty, so the reason has to reach the view.
          failure = error instanceof Error ? error.message : String(error)
          ctx.logger.warn('plugin-topology: could not read the plugin graph', error)
          return
        }
        revisions += 1
        for (var listener of Array.from(listeners)) {
          try {
            listener()
          } catch (error) {
            ctx.logger.warn('plugin-topology: a topology subscriber failed', error)
          }
        }
      }

      var schedule = function () {
        if (queued || disposed) return
        queued = true
        queueMicrotask(notify)
      }

      /**
       * Unwrap one Remote answer: the generated client returns
       * `{ ok, value }`, while a plain call may hand back the value directly.
       * @param result - what the Remote method returned.
       * @returns the business value, or undefined when the call failed.
       */
      var answerValue = function (result) {
        if (result === null || typeof result !== 'object') return undefined
        if (result.ok === true) return result.value
        if (result.ok === false) return undefined
        return result
      }

      /**
       * Read the bundle -> plugin-row composition and every live entry's fiber
       * phase from the plugin manager Remote. This is the same source the
       * Plugins page renders, so it needs neither the boot global nor a live
       * fiber inject map to produce real edges.
       */
      var loadComposition = function () {
        var manager = optionalService(ctx, 'remote.pluginManager')
        if (manager === undefined || manager === null
          || typeof manager.listBundles !== 'function' || typeof manager.listPlugins !== 'function') return
        var bundlesAnswer
        var pluginsAnswer
        try {
          bundlesAnswer = manager.listBundles()
          pluginsAnswer = manager.listPlugins()
        } catch (error) {
          ctx.logger.debug('plugin-topology: the plugin manager could not be read', error)
          return
        }
        Promise.all([Promise.resolve(bundlesAnswer), Promise.resolve(pluginsAnswer)]).then(function (answers) {
          if (disposed) return
          var bundles = answerValue(answers[0])
          var plugins = answerValue(answers[1])
          if (!Array.isArray(bundles) || !Array.isArray(plugins)) return
          composition = { bundles: bundles, plugins: plugins }
          schedule()
        }, function (error) {
          ctx.logger.debug('plugin-topology: the plugin manager read failed', error)
        })
      }

      /**
       * Retry the Host reads once, shortly after the first attempt. The Remote
       * namespaces mount asynchronously during boot, so an early call can find
       * neither namespace; one delayed retry covers that window without
       * polling. The timer rides the store's disposal.
       */
      var retried = false
      var retryTimer = undefined
      var retryHostReads = function () {
        if (retried || disposed) return
        retried = true
        retryTimer = setTimeout(function () {
          retryTimer = undefined
          if (disposed) return
          loadHost()
        }, 1500)
      }

      var loadHost = function () {
        var remote = optionalService(ctx, 'remote')
        var inventory = optionalService(ctx, 'remote.pluginInventory')
        if (inventory !== undefined && inventory !== null && typeof inventory.list === 'function') {
          var inventoryAnswer
          try {
            inventoryAnswer = inventory.list()
          } catch (error) {
            hostError = error
            inventoryAnswer = undefined
          }
          if (inventoryAnswer !== undefined) {
            Promise.resolve(inventoryAnswer).then(function (result) {
              if (disposed) return
              var value = answerValue(result)
              if (value === null || typeof value !== 'object' || !Array.isArray(value.entries)) return
              hostEntries = value.entries
              hostError = null
              schedule()
            }, function (error) {
              hostError = error
            })
          }
        }
        loadComposition()
        schedule()
        retryHostReads()
      }

      var store = {
        subscribe: function (listener) {
          listeners.add(listener)
          return function () { listeners.delete(listener) }
        },
        getSnapshot: function () { return current },
        refresh: function () {
          loadHost()
          schedule()
        },
        revision: function () { return revisions },
        hostFailure: function () { return hostError },
        failure: function () { return failure },
      }

      schedule()
      loadHost()

      ctx.effect(function () {
        var offStatus = ctx.on('internal/status', schedule)
        var offPlugin = ctx.on('internal/plugin', schedule)
        var offReset = ctx.on('connection/reset', function () { store.refresh() })
        var offChange = undefined
        var remote = ctx.get('remote')
        if (remote !== undefined && remote !== null && typeof remote.$on === 'function') {
          try {
            offChange = remote.$on('plugin-manager/changed', function () { store.refresh() })
          } catch (error) {
            ctx.logger.debug('plugin-topology: the composition change event is not forwarded here', error)
          }
        }
        return function () {
          disposed = true
          if (retryTimer !== undefined) clearTimeout(retryTimer)
          offStatus()
          offPlugin()
          offReset()
          if (typeof offChange === 'function') offChange()
          listeners.clear()
        }
      }, 'plugin-topology: live topology readers')

      return store
    }

    return {
      name: 'dsh-plugin-topology',
      // `loader` is the one hard dependency: it is the graph itself, and the
      // framework then guarantees it is live before this plugin activates.
      // `remote` and everything below it stay optional reads (`optionalService`),
      // so a composition without the Remote plane degrades instead of parking
      // this panel forever.
      inject: ['loader', 'slots', 'locale'],
      apply: function apply(ctx) {
        var store = createStore(ctx)
        var locale = ctx.get('locale')
        if (locale !== undefined && locale !== null && typeof locale.register === 'function') {
          ctx.effect(function () {
            var offZh = locale.register(NS, 'zh', ZH)
            var offEn = locale.register(NS, 'en', EN)
            return function () {
              offZh()
              offEn()
            }
          }, 'plugin-topology: dictionaries')
        }

        /** Resolve a dictionary key with `{name}` substitution at read time. */
        var translate = function (key, params) {
          var template
          var bound = ctx.get('locale')
          if (bound !== undefined && bound !== null && typeof bound.bind === 'function') {
            try {
              template = bound.bind(NS)(key)
            } catch (error) {
              template = undefined
            }
          }
          if (typeof template !== 'string' || template === '') {
            template = Object.prototype.hasOwnProperty.call(EN, key) ? EN[key] : key
          }
          if (params === undefined) return template
          return template.replace(/\{(\w+)\}/g, function (match, name) {
            return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
          })
        }

        /** Select another main panel when the layout service offers it. */
        var openPanel = function (panelId) {
          var layout = ctx.get('layout')
          if (layout === undefined || layout === null || typeof layout.selectPanel !== 'function') return
          try {
            layout.selectPanel(panelId)
          } catch (error) {
            ctx.logger.debug('plugin-topology: no panel named "' + panelId + '" is registered')
          }
        }

        ctx.slots.inject('main', function () {
          return ctx.slots.register({
            name: 'main',
            key: PANEL_ID,
            locale: NS,
            inject: function () {
              return { store: store, t: translate, open: openPanel }
            },
          }, TopologyPanel)
        })

        ctx.slots.inject('sidebar.panellist', function () {
          return ctx.slots.register({
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 5,
            locale: NS,
            label: function () { return translate('panel.label') },
          }, TopologyIcon)
        })
      },
    }
  },
})
