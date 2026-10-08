import './cold-chain.mjs';
import {db,uid,audit} from '../db.mjs';
import {createIncident,addAction,incidentById} from './incidents.mjs';

export const TEMPERATURE_SLOTS=['07:00','12:00','17:00','22:00'];
const clean=v=>String(v??'').trim();
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
export function temperatureValue(value){
 if(value===null||value===undefined||typeof value==='boolean'||clean(value)==='')return fail('Température obligatoire.');
 const n=Number(String(value).replace(',','.'));if(!Number.isFinite(n))return fail('Température invalide.');return n;
}
export function localTemperatureClock(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
 return{date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
}
function dateOnly(value){const s=clean(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)fail('Date invalide.');return s}
db.exec(`CREATE TABLE IF NOT EXISTS temperature_equipment(
 id TEXT PRIMARY KEY,store_id TEXT NOT NULL REFERENCES stores(id),code TEXT NOT NULL,label TEXT NOT NULL,
 profile_code TEXT NOT NULL REFERENCES cold_chain_profiles(code),temp_min REAL NOT NULL,temp_max REAL NOT NULL,
 active_from TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(store_id,code));
 CREATE TABLE IF NOT EXISTS temperature_readings(
 id TEXT PRIMARY KEY,equipment_id TEXT NOT NULL REFERENCES temperature_equipment(id),business_date TEXT NOT NULL,slot TEXT NOT NULL,
 sequence INTEGER NOT NULL,temperature REAL NOT NULL,temp_min REAL NOT NULL,temp_max REAL NOT NULL,
 observed_time TEXT NOT NULL,door_ok INTEGER NOT NULL,corrective_action TEXT,maintenance_signaled INTEGER NOT NULL,
 conforms INTEGER NOT NULL,incident_id TEXT REFERENCES incidents(id),recorded_by TEXT NOT NULL REFERENCES users(id),
 recorded_at TEXT NOT NULL,UNIQUE(equipment_id,business_date,slot,sequence));
 CREATE INDEX IF NOT EXISTS ix_temperature_readings_date ON temperature_readings(equipment_id,business_date,slot);`);

export function createTemperatureEquipment({storeId,user,input={}}){
 const code=clean(input.code),label=clean(input.label),profile=db.prepare('SELECT * FROM cold_chain_profiles WHERE code=? AND active=1').get(clean(input.profileCode));
 if(!code||!label||code.length>60||label.length>160||!profile)fail('Code, nom équipement et profil froid valides obligatoires.');
 if(db.prepare('SELECT id FROM temperature_equipment WHERE store_id=? AND code=?').get(storeId,code))fail('Ce code équipement existe déjà dans ce magasin.',409);
 const min=temperatureValue(profile.temp_min),max=temperatureValue(profile.temp_max);if(min>=max)fail('Le minimum doit être inférieur au maximum.');
 const id=uid('therm'),date=localTemperatureClock().date;
 db.prepare('INSERT INTO temperature_equipment(id,store_id,code,label,profile_code,temp_min,temp_max,active_from,created_by) VALUES(?,?,?,?,?,?,?,?,?)').run(id,storeId,code,label,profile.code,min,max,date,user.id);
 audit({storeId,userId:user.id,action:'TEMPERATURE_EQUIPMENT_CREATED',entityType:'TEMPERATURE_EQUIPMENT',entityId:id,details:{code,label,tempMin:min,tempMax:max,profileCode:profile.code}});
 return db.prepare('SELECT * FROM temperature_equipment WHERE id=?').get(id);
}

export function temperatureRegister(storeId,{date=localTemperatureClock().date,now=new Date()}={}){
 date=dateOnly(date);const clock=localTemperatureClock(now);
 const equipment=db.prepare('SELECT * FROM temperature_equipment WHERE store_id=? AND active=1 AND active_from<=? ORDER BY code').all(storeId,date);
 const readings=db.prepare(`SELECT r.*,u.name recorded_by_name FROM temperature_readings r JOIN temperature_equipment e ON e.id=r.equipment_id LEFT JOIN users u ON u.id=r.recorded_by WHERE e.store_id=? AND r.business_date=? ORDER BY r.sequence`).all(storeId,date);
 const rows=equipment.map(e=>({...e,slots:TEMPERATURE_SLOTS.map(slot=>{
  const history=readings.filter(r=>r.equipment_id===e.id&&r.slot===slot),latest=history.at(-1)||null,due=date<clock.date||(date===clock.date&&slot<=clock.time),incident=latest?.incident_id?incidentById(latest.incident_id):null;
  return{slot,due,history,latest,incident,status:latest?(latest.conforms?(incident?.status==='OPEN'?'CORRECTIVE_ACTION_OPEN':'CONFORMING'):'NON_CONFORMING'):(due?'MISSING':'UPCOMING')};
 })}));
 const slots=rows.flatMap(x=>x.slots),due=slots.filter(x=>x.due),recorded=due.filter(x=>x.latest),nonConforming=slots.filter(x=>x.status==='NON_CONFORMING');
 return{storeId,date,timeZone:'Africa/Casablanca',slots:TEMPERATURE_SLOTS,equipment:rows,summary:{equipment:rows.length,expected:slots.length,due:due.length,recorded:recorded.length,missing:due.filter(x=>!x.latest).length,nonConforming:nonConforming.length,correctiveActionsOpen:slots.filter(x=>x.incident?.status==='OPEN').length,completionPct:due.length?Math.round(recorded.length/due.length*100):null}};
}

export function recordTemperature({storeId,user,input={},now=new Date()}){
 const equipment=db.prepare('SELECT * FROM temperature_equipment WHERE id=? AND store_id=? AND active=1').get(clean(input.equipmentId),storeId);if(!equipment)fail('Équipement introuvable dans ce magasin.',404);
 const clock=localTemperatureClock(now),date=dateOnly(input.date||clock.date),slot=clean(input.slot),time=clean(input.observedTime||clock.time);
 if(!TEMPERATURE_SLOTS.includes(slot)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))fail('Créneau ou heure de relevé invalide.');
 if(date<equipment.active_from||date>clock.date||(date===clock.date&&(time>clock.time||slot>clock.time)))fail('Le relevé doit concerner un équipement actif et un créneau déjà commencé.');
 if(time<slot)fail('L’heure réelle ne peut pas précéder le créneau sélectionné.');
 const temperature=temperatureValue(input.temperature),doorOk=input.doorOk===true,action=clean(input.correctiveAction),conforms=temperature>=equipment.temp_min&&temperature<=equipment.temp_max&&doorOk;
 const previous=db.prepare('SELECT * FROM temperature_readings WHERE equipment_id=? AND business_date=? AND slot=? ORDER BY sequence DESC LIMIT 1').get(equipment.id,date,slot);
 if(previous&&!input.recheck)fail('Ce créneau a déjà été relevé. Utiliser un recontrôle pour conserver l’historique.',409);
 if(!previous&&input.recheck)fail('Un premier relevé est requis.',409);
 if(previous&&time<previous.observed_time)fail('Le recontrôle ne peut pas précéder le dernier relevé.');
 if((!conforms||previous&&!previous.conforms)&&!action)fail('Décrire la non-conformité et l’action corrective.');
 let incident=previous?.incident_id?incidentById(previous.incident_id):null;
 const id=uid('temp'),sequence=Number(previous?.sequence||0)+1;
 db.exec('SAVEPOINT record_temperature');
 try{
 if(!conforms&&incident?.status!=='OPEN'){
  incident=createIncident({storeId,user,title:`Température · ${equipment.label} · ${slot}`,description:`${temperature} °C, plage ${equipment.temp_min} à ${equipment.temp_max} °C. ${action}`,category:'COLD',criticality:'CRITICAL',blockingLevel:'NONE',sourceType:'TEMPERATURE_READING',sourceId:id,assignedTo:user.id,requiresEvidence:true});
  addAction({incidentId:incident.id,user,title:'Contrôler l’équipement et les produits, documenter la correction puis recontrôler',note:action,assignedTo:user.id});
 }
 db.prepare(`INSERT INTO temperature_readings(id,equipment_id,business_date,slot,sequence,temperature,temp_min,temp_max,observed_time,door_ok,corrective_action,maintenance_signaled,conforms,incident_id,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,equipment.id,date,slot,sequence,temperature,equipment.temp_min,equipment.temp_max,time,doorOk?1:0,action||null,input.maintenanceSignaled===true?1:0,conforms?1:0,incident?.id||null,user.id,now.toISOString());
 audit({storeId,businessDate:date,userId:user.id,action:'TEMPERATURE_RECORDED',entityType:'TEMPERATURE_READING',entityId:id,details:{equipmentId:equipment.id,slot,sequence,temperature,conforms,observedTime:time}});
 db.exec('RELEASE record_temperature');
 }catch(error){db.exec('ROLLBACK TO record_temperature');db.exec('RELEASE record_temperature');throw error}
 return temperatureRegister(storeId,{date,now});
}
