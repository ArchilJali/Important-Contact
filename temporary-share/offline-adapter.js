/* Local-only draft storage. This is NOT authentication or author verification. */
const LOCAL_ROLE = SHARE.mode === 'owner' ? 'owner' : SHARE.mode === 'reviewer' ? 'editor' : 'viewer';
const STORAGE_KEY = 'ic-offline-v1:' + SHARE.seed_sha256 + ':' + SHARE.mode;
const copy = value => JSON.parse(JSON.stringify(value));
const same = (a,b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
function normalize(value){if(Array.isArray(value))return value.map(normalize);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(k=>k!=='version').sort().map(k=>[k,normalize(value[k])]));return value;}
function makeRow(r){return {id:r.id,record:copy(r),review_relationship:'not_assessed',review_valuable:false,do_not_contact:false,review_note:'',bhoc_active_contact:'unknown',bhoc_last_contact_on:null,version:1};}
const BASE_ROWS = SHARE.data.entities.map(makeRow);
let localState = {contacts:copy(BASE_ROWS),events:[],revision:0};
let persistent = true, dirty = false, importPlan = null;
try{const text=localStorage.getItem(STORAGE_KEY);if(text&&LOCAL_ROLE!=='viewer'){const saved=JSON.parse(text);if(Array.isArray(saved.contacts)&&Array.isArray(saved.events)&&saved.revision>=0)localState=saved;}}catch{persistent=false;}
function uid(){return typeof crypto.randomUUID==='function'?crypto.randomUUID():'local-'+Date.now()+'-'+Math.random().toString(36).slice(2);}
function storeState(next){
 if(LOCAL_ROLE==='viewer')throw Error('This copy has a view-only interface.');
 try{const text=localStorage.getItem(STORAGE_KEY);if(text&&JSON.parse(text).revision!==localState.revision)throw Error('Another tab has newer changes. Export your work, then reload before editing.');}
 catch(e){if(e.message.includes('Another tab'))throw e;persistent=false;}
 next.revision=localState.revision+1;
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next));}catch{persistent=false;}
 localState=next;dirty=true;updateLocalNotice();
}
function event(action,id,before,after,extra={}){return {event_id:uid(),action,contact_id:id,device_time:new Date().toISOString(),claimed_reviewer:SHARE.label,identity_verified:false,before:copy(before),after:copy(after),...extra};}
function safeURL(value){if(value==null||value==='')return;const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Use an http or https professional link.');}
function checkRow(row){
 if(!row||typeof row.id!=='string'||!row.record||row.record.id!==row.id)throw Error('Invalid contact identity.');
 if(typeof row.record.name!=='string'||!row.record.name.trim()||row.record.name.length>300)throw Error('Invalid contact name.');
 const p=row.record.priority_score;if(!Number.isInteger(p)||p<1||p>10)throw Error('Priority must be a whole number from 1 to 10.');
 for(const key of ['country_tags','species_tags','sections'])if(row.record[key]!==undefined&&(!Array.isArray(row.record[key])||row.record[key].some(x=>typeof x!=='string')))throw Error('Invalid contact tags.');
 if(!['not_assessed','known','not_known'].includes(row.review_relationship)||typeof row.review_valuable!=='boolean'||typeof row.do_not_contact!=='boolean'||!['unknown','active','inactive'].includes(row.bhoc_active_contact))throw Error('Invalid review status.');
 if(typeof row.review_note!=='string'||row.review_note.length>10000)throw Error('Review note is too long.');
 if(row.bhoc_last_contact_on!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(row.bhoc_last_contact_on))throw Error('Invalid last-contact date.');
 safeURL(row.record.linkedin_url);safeURL(row.record.contact_page);
}
async function api(path,method='GET',body){
 if(path==='/api/me'&&method==='GET')return {role:LOCAL_ROLE,name:SHARE.label,identity_verified:false};
 if(path==='/api/snapshot'&&method==='GET')return {contacts:copy(localState.contacts),resources:copy(SHARE.data.resources)};
 if(method!=='GET'&&LOCAL_ROLE==='viewer')throw Error('This copy has a view-only interface.');
 const next=copy(localState);
 if(path==='/api/contacts'&&method==='POST'&&LOCAL_ROLE==='owner'){
  const row=makeRow({...body.record,id:body.id});checkRow(row);if(next.contacts.some(x=>x.id===row.id))throw Error('Duplicate contact ID.');next.contacts.push(row);next.events.push(event('create',row.id,null,row));storeState(next);return copy(row);
 }
 const match=path.match(/^\/api\/contacts\/([^?]+)(?:\?version=(\d+))?$/);
 if(!match)throw Error('There is no online API in this file.');
 const id=decodeURIComponent(match[1]),i=next.contacts.findIndex(x=>x.id===id),before=next.contacts[i];
 if(!before)throw Error('Contact not found.');
 if(method==='DELETE'&&LOCAL_ROLE==='owner'){
  if(before.version!==Number(match[2]))throw Error('Reopen the latest contact before deleting.');
  next.contacts.splice(i,1);next.events.push(event('delete',id,before,null));storeState(next);return {deleted:true};
 }
 if(method!=='PUT')throw Error('Operation not available in this local copy.');
 if(before.version!==body.version)throw Error('This record has changed. Reopen it before editing.');
 if(before.do_not_contact&&!body.restricted&&(!body.release_confirmed||!body.release_reason?.trim()))throw Error('A red restriction needs explicit release confirmation and a reason.');
 const allowed=['name','priority_score','role_summary','linkedin_url','contact_page','public_professional_email','country_tags','species_tags','next_action'];
 const patch={};for(const k of allowed)if(Object.hasOwn(body.patch||{},k))patch[k]=body.patch[k];
 const after={...before,record:{...before.record,...patch},review_relationship:body.relationship,review_valuable:body.valuable,do_not_contact:body.restricted,review_note:body.note,bhoc_active_contact:body.active,bhoc_last_contact_on:body.last_contact,version:before.version+1};
 checkRow(after);next.contacts[i]=after;next.events.push(event('edit',id,before,after,{release_confirmed:!!body.release_confirmed,release_reason:body.release_reason||''}));storeState(next);return copy(after);
}
function updateLocalNotice(){
 const n=document.getElementById('local-state');if(!n)return;
 n.textContent=LOCAL_ROLE==='viewer'?'View copy. Links and filters work; no shared data can be changed.':`${persistent?'Drafts are stored in this browser where supported.':'Browser storage is unavailable: export before closing.'} ${dirty?'Unexported changes. ':''}${localState.events.length} local history events. Use Export to send a file; nothing is automatically uploaded.`;
}
function downloadJSON(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}
function exportReview(){
 const ids=new Set([...BASE_ROWS.map(x=>x.id),...localState.contacts.map(x=>x.id)]),changes=[];
 for(const id of ids){const before=BASE_ROWS.find(x=>x.id===id)||null,after=localState.contacts.find(x=>x.id===id)||null;if(!same(before,after))changes.push({contact_id:id,before:copy(before),after:copy(after)});}
 downloadJSON({schema:'important-contact.local-review.v1',base_seed_sha256:SHARE.seed_sha256,exported_at_device:new Date().toISOString(),claimed_reviewer:SHARE.label,identity_verified:false,mode:SHARE.mode,changes,events:copy(localState.events)},`Important-Contact-${SHARE.mode}-${new Date().toISOString().slice(0,10)}.json`);
 dirty=false;updateLocalNotice();
}
function prepareImport(packet){
 if(LOCAL_ROLE!=='owner')throw Error('Use the Archil working copy to import.');
 if(packet.schema!=='important-contact.local-review.v1'||packet.base_seed_sha256!==SHARE.seed_sha256||packet.identity_verified!==false||!Array.isArray(packet.changes)||packet.changes.length>2000)throw Error('Wrong file format or source snapshot. No changes applied.');
 const result={ready:[],blocked:[],duplicate:0,claimed:String(packet.claimed_reviewer||'Not specified').slice(0,200)};const ids=new Set();
 for(const change of packet.changes){
  if(typeof change.contact_id!=='string'||ids.has(change.contact_id))throw Error('Duplicate or invalid contact ID.');ids.add(change.contact_id);
  const before=change.before,after=change.after,current=localState.contacts.find(x=>x.id===change.contact_id)||null;
  if(before){checkRow(before);if(before.id!==change.contact_id)throw Error('Contact ID mismatch.');}
  if(after){checkRow(after);if(after.id!==change.contact_id)throw Error('Contact ID mismatch.');}
  if(same(current,after)){result.duplicate++;continue;}
  if(!after){result.blocked.push(change.contact_id+': deletion proposals must be reviewed directly.');continue;}
  if(!BASE_ROWS.some(x=>x.id===change.contact_id)){result.blocked.push(change.contact_id+': new contacts must be added directly.');continue;}
  if(current?.do_not_contact&&!after.do_not_contact){result.blocked.push(change.contact_id+': red restriction must be released directly in the owner copy.');continue;}
  if(!same(current,before)){result.blocked.push(change.contact_id+': conflict with current local changes.');continue;}
  result.ready.push(copy(change));
 }
 return result;
}
function showImport(packet){
 const plan=prepareImport(packet);importPlan=plan;const body=$('contact-content');body.replaceChildren();body.append(el('h2','Review proposed import'),el('p',`Claimed author: ${plan.claimed}. Identity is NOT verified. ${plan.ready.length} changes ready, ${plan.duplicate} already present, ${plan.blocked.length} blocked.`));
 for(const c of plan.ready)body.append(el('p',c.contact_id+' · '+c.after.record.name+' · '+labels[reviewStatus(c.after)]));
 for(const line of plan.blocked)body.append(el('p',line,'error'));
 const btn=el('button','Accept displayed changes in this local copy','primary');btn.disabled=!plan.ready.length;btn.onclick=async()=>{
  try{const next=copy(localState);for(const c of plan.ready){const i=next.contacts.findIndex(x=>x.id===c.contact_id);if(i<0||!same(next.contacts[i],c.before))throw Error('Local data changed. Import again.');const before=next.contacts[i],after={...copy(c.after),version:before.version+1};next.contacts[i]=after;next.events.push(event('import_unverified_proposal',c.contact_id,before,after,{claimed_source:plan.claimed}));}storeState(next);$('contact-dialog').close();await load();message('Import accepted locally. No GitHub or server data was changed. Export a backup.');}catch(e){message(e.message,true);}
 };body.append(btn);$('contact-dialog').showModal();
}
function installLocalTools(){
 updateLocalNotice();const exportButton=$('local-export'),input=$('local-import');
 exportButton.hidden=LOCAL_ROLE==='viewer';exportButton.onclick=exportReview;
 $('local-import-label').hidden=LOCAL_ROLE!=='owner';
 input.onchange=async()=>{try{const f=input.files?.[0];if(!f)return;if(f.size>3000000)throw Error('Import file is too large.');showImport(JSON.parse(await f.text()));}catch(e){message(e.message,true);}finally{input.value='';}};
 $('local-history').hidden=LOCAL_ROLE==='viewer';$('local-history').onclick=()=>{const body=$('contact-content');body.replaceChildren();body.append(el('h2','Local change history'),el('p','Device timestamps and claimed author names are not authenticated.'));
 for(const e of localState.events.slice().reverse()){const d=el('details');d.append(el('summary',`${e.device_time} · ${e.action} · ${e.contact_id}`),el('pre',JSON.stringify(e,null,2)));body.append(d);}$('contact-dialog').showModal();};
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
}
