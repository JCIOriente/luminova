/** The selection both callable-export tests share: an export is a deployed callable when it is a
 *  function carrying a defined `__endpoint.callableTrigger`, however it was declared. Used by
 *  `guarded-on-call.test.ts` (keyed on the export name, case preserved — it looks callables up by
 *  name) and the deploy-list test in `redeem-invite.test.ts` (which lower-cases the names itself,
 *  matching Cloud Run's service-name casing) so the filter cannot drift between the two copies. */
export function callableExports(mod: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(mod).filter(([, v]) => {
    const endpoint = (v as { __endpoint?: { callableTrigger?: unknown } })?.__endpoint;
    return typeof v === "function" && endpoint !== undefined && !!endpoint.callableTrigger;
  });
}
