/**
 * Host half of the star-map bundle.
 *
 * The map itself is composed in the browser, because the page already holds
 * both halves of the truth: `ctx.modules` carries the composed web-plugin
 * graph (`inject` edges plus each row's static-table `external` edges) and the
 * page Loader carries one live fiber per row, so fiber state, service
 * provision, and pending injections are readable locally and update in real
 * time. `ctx.remote.pluginInventory` adds the Host plane's own per-entry fiber
 * phase. No Host service is needed, so this half stays a plain entry whose
 * only effect is being present in the Loader.
 *
 * @module dsh-plugin-topology
 */

/**
 * Host-side activation: the bundle contributes no Host behavior.
 * @param ctx - the owning Host plugin context (kept for the entry's lifetime).
 */
export function apply(ctx) {
  ctx.logger.debug('plugin-topology: browser half owns the topology view')
}
