// Emergency FinOps pause: no scheduled invocation and no upstream CRM request.
// Restore via reviewed release only after a bounded incremental sync is validated.
export default async () => Response.json({status:'DISABLED',reason:'FINOPS_PAUSE'});
