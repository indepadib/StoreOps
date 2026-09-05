export const dlcRisk=r=>Number(r?.dlc?.expired||0)+Number(r?.dlc?.critical||0);
export const closingStarted=r=>r?.day?.closing_status==='IN_PROGRESS'||Number(r?.closing?.done||0)>0;
export const cashClosingNeedsAttention=r=>closingStarted(r)&&(Number(r?.cash?.blocking||0)>0||Number(r?.cash?.recounts||0)>0||Number(r?.cash?.pending||0)>0);
export const storeBlocked=r=>r?.day?.opening_status!=='OPENED'&&(Number(r?.opening?.blockers||0)>0||Number(r?.staffing?.blocking||0)>0||Number(r?.coldChain?.blocking||0)>0||Number(r?.cashOpening?.blocking||0)>0||Number(r?.commercial?.blocking||0)>0||Number(r?.handover?.blocking||0)>0);
export function networkRisk(r={}){
 return Number(r.staffing?.blocking||0)*260+
  Number(r.staffing?.gaps?.managers||0)*300+
  Number(r.coldChain?.mismatch||0)*280+
  Number(r.coldChain?.blocking||0)*110+
  Number(r.cashOpening?.mismatch||0)*240+
  Number(r.cashOpening?.blocking||0)*90+
  Number(r.commercial?.blocking||0)*220+
  dlcRisk(r)*210+
  Number(r.inventory?.pendingRecounts||0)*130+
  Number(r.handover?.blocking||0)*230+
  Number(r.sla?.escalated||0)*250+
  Number(r.loss?.blocking||0)*170+
  Number(r.sla?.overdue||0)*140+
  Number(r.criticalIncidents||0)*180+
  Number(r.opening?.blockers||0)*30+
  Math.min(500,Number(r.qualityRejected||0)*35)+
  (cashClosingNeedsAttention(r)?260:0);
}
