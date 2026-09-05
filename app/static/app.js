'use strict';
// No database, credentials, allowlist or Auth token is embedded in browser assets.
const $=id=>document.getElementById(id);
let me=null,db=null,section='all',tab='contacts';
const labels={known:'Known to Carl',valuable:'Valuable contact',not_known:'Not known to Carl',do_not_contact:'Do not contact',not_reviewed:'Not reviewed'};
const activeLabels={active:'Active',inactive:'Not active',unknown:'Not confirmed'};
const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=String(text);if(cls)x.className=cls;return x;};
function message(text,error=false,target='workspace-message'){$(target).textContent=text;$(target).classList.toggle('error',error);}
async function api(path,method='GET',body){
 const headers={};if(method!=='GET'){headers['Content-Type']='application/json';if(me)headers['X-CSRF-Token']=me.csrf;}
 const r=await fetch(path,{method,headers,credentials:'same-origin',cache:'no-store',...(method!=='GET'?{body:JSON.stringify(body??{})}:{})});
 let data;try{data=await r.json();}catch{data={};}
 if(!r.ok){if(r.status===401&&path.startsWith('/api/'))showLogin();throw Error(typeof data.detail==='string'?data.detail:'The request could not be completed.');}
 return data;
}
function link(label,url){
 if(typeof url!=='string'||!url)return null;
 try{const u=new URL(url);if(!['https:','http:','mailto:'].includes(u.protocol)||u.username||u.password)return null;
 const a=el('a',label);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return null;}
}
function addLink(parent,label,url){const a=link(label,url);if(a)parent.append(a);}
function reviewStatus(row){return row.do_not_contact?'do_not_contact':row.review_relationship==='known'?'known':row.review_valuable?'valuable':row.review_relationship==='not_known'?'not_known':'not_reviewed';}
function reviewPill(row){const s=reviewStatus(row),p=el('span',undefined,'status '+s);p.append(el('i',undefined,'dot'),el('span',labels[s]));return p;}
function activePill(row){return el('span',activeLabels[row.bhoc_active_contact]||activeLabels.unknown,'contact-state '+row.bhoc_active_contact);}
function showLogin(){me=null;db=null;$('workspace').hidden=true;$('login').hidden=false;$('contact-dialog').close();$('contact-content').replaceChildren();$('contact-rows').replaceChildren();$('resource-list').replaceChildren();$('member-list').replaceChildren();$('audit-list').replaceChildren();}
function options(id,values,first){const select=$(id),old=select.value;select.replaceChildren();const firstOption=el('option',first);firstOption.value='';select.append(firstOption);for(const v of [...new Set(values)].filter(Boolean).sort()){const o=el('option',v);o.value=v;select.append(o);}select.value=old;}
async function boot(){try{me=await api('/api/me');await load();}catch(e){showLogin();if(!e.message.includes('sign in'))message(e.message,true,'login-message');}}
async function load(){db=await api('/api/snapshot');$('login').hidden=true;$('workspace').hidden=false;$('who').textContent=me.name||me.email;$('role').textContent=me.role;
 $('permission-note').textContent=me.role==='viewer'?'View-only access · links and filters are available':me.role==='editor'?'Editor access · contact records and reviews':'Owner access · full workspace control';
 document.querySelectorAll('.owner-only').forEach(n=>n.hidden=me.role!=='owner');
 $('total').textContent=db.contacts.length;$('source-count').textContent=(db.resources.sources||[]).length;$('active-count').textContent=db.contacts.filter(c=>c.bhoc_active_contact==='active').length;
 options('country',db.contacts.flatMap(x=>x.record.country_tags||[]),'All countries');options('species',db.contacts.flatMap(x=>x.record.species_tags||[]),'All species');renderNav();renderContacts();}
function renderNav(){
 $('directions').replaceChildren();for(const d of [{id:'all',label:'All directions'},...(db.resources.taxonomy?.sections||[])]){const b=el('button',d.label,d.id===section?'active':'');b.onclick=()=>{section=d.id;renderNav();renderContacts();};$('directions').append(b);}
 $('tabs').replaceChildren();let tabs=[['contacts','Contacts'],['sources','Sources'],['programmes','Grants & Programmes'],['funding_events','Funding'],['relationships','Relationships'],['works','Publications'],['queue','Research Queue']];
 if(me.role==='owner')tabs.push(['admin','Access & History']);for(const [key,name]of tabs){const b=el('button',name,key===tab?'active':'');b.onclick=()=>switchTab(key,name);$('tabs').append(b);}
}
async function switchTab(key,title){tab=key;renderNav();$('contacts-view').hidden=key!=='contacts';$('resource-view').hidden=['contacts','admin'].includes(key);$('admin-view').hidden=key!=='admin';
 if(key==='admin'){try{await showMembers();}catch(e){message(e.message,true);}}else if(key!=='contacts'){renderResources(key,title);}}
function cutoffMonths(months){const n=new Date(),day=n.getUTCDate();n.setUTCDate(1);n.setUTCMonth(n.getUTCMonth()-months);const last=new Date(Date.UTC(n.getUTCFullYear(),n.getUTCMonth()+1,0)).getUTCDate();n.setUTCDate(Math.min(day,last));return n.toISOString().slice(0,10);}
function activityMatches(record,filter){if(filter==='all')return true;const start=record.last_activity_range_start||record.last_activity_date,end=record.last_activity_range_end||record.last_activity_date;if(filter==='unknown')return !start;if(!start)return false;const today=new Date().toISOString().slice(0,10);if(start>today)return false;if(filter==='older10y')return end<cutoffMonths(120);return end>=cutoffMonths({'6m':6,'1y':12,'3y':36,'10y':120}[filter]);}
function filtered(){ return db.contacts.filter(row=>{const r=row.record,s=reviewStatus(row),q=$('search').value.trim().toLowerCase();
  return (section==='all'||(r.sections||[]).includes(section))&&(!q||JSON.stringify(r).toLowerCase().includes(q))&&(!$('country').value||(r.country_tags||[]).includes($('country').value))&&(!$('species').value||(r.species_tags||[]).includes($('species').value))&&activityMatches(r,$('activity').value)&&
  ($('review-filter').value==='all'||$('review-filter').value===s||($('review-filter').value==='positive'&&['known','valuable'].includes(s)))&&($('active-filter').value==='all'||$('active-filter').value===row.bhoc_active_contact)&&Number(r.priority_score||0)>=Number($('priority').value);
 }).sort((a,b)=>$('sort').value==='name'?a.record.name.localeCompare(b.record.name):$('sort').value==='activity'?(b.record.last_activity_range_end||b.record.last_activity_date||'').localeCompare(a.record.last_activity_range_end||a.record.last_activity_date||''):Number(b.record.priority_score||0)-Number(a.record.priority_score||0)||a.record.name.localeCompare(b.record.name));}
function renderContacts(){const rows=filtered();$('result-count').textContent=`${rows.length} of ${db.contacts.length} contacts`;$('contact-rows').replaceChildren();for(const row of rows){const r=row.record,tr=el('tr');const name=el('td'),btn=el('button',r.name,'contact-name');btn.onclick=()=>openContact(row);name.append(btn,el('small',r.role_summary||''));
 const geo=el('td',(r.country_tags||[]).join(', ')||'Not verified');geo.append(el('small',(r.species_tags||[]).join(', ')));const score=el('td');score.append(el('span',r.priority_score||'-','score'));
 const activity=el('td',r.last_activity_date||'Date unknown');activity.append(el('small',r.last_activity_date_precision==='year'?'Year only':r.last_activity_date_precision==='month'?'Month only':''));
 const review=el('td');review.append(reviewPill(row));const active=el('td');active.append(activePill(row));tr.append(name,geo,score,activity,review,active);$('contact-rows').append(tr);}}
function renderResources(key,title){$('resource-title').textContent=title;$('resource-list').replaceChildren();const values=db.resources[key]||[];for(const row of values){const card=el('article',undefined,'resource-card');card.append(el('h3',row.title||row.name||row.task||row.id||'Record'));
 for(const [field,value]of Object.entries(row)){if(['title','name','task'].includes(field)||value===null)continue;if(typeof value==='string'&&/^https?:\/\//.test(value)){addLink(card,field.replaceAll('_',' '),value);continue;}
 const p=el('p');p.append(el('strong',field.replaceAll('_',' ')+': '),document.createTextNode(typeof value==='object'?JSON.stringify(value):String(value)));card.append(p);}
 $('resource-list').append(card);}if(!values.length)$('resource-list').append(el('p','No records in this collection yet.'));}
function field(form,id,title,value,type='text',wide=false){const label=el('label',title,wide?'span-2':'');let control;if(type==='textarea'){control=el('textarea');control.value=value||'';}else{control=el('input');control.type=type;control.value=value??'';}control.id=id;label.append(control);form.append(label);return control;}
function choose(form,id,title,value,choices){const label=el('label',title),select=el('select');select.id=id;for(const [v,l] of choices){const option=el('option',l);option.value=v;select.append(option);}select.value=value;label.append(select);form.append(label);return select;}
function checkbox(form,id,title,value){const label=el('label',undefined,'check');const input=el('input');input.type='checkbox';input.id=id;input.checked=!!value;label.append(input,document.createTextNode(title));form.append(label);return input;}
function openContact(row){const r=row.record,body=$('contact-content');body.replaceChildren();body.append(el('h2',r.name,'detail-title'),el('p',r.role_summary||''));const pills=el('div',undefined,'detail-roles');pills.append(reviewPill(row),activePill(row));body.append(pills);
 const links=el('div',undefined,'links-row');addLink(links,'LinkedIn',r.linkedin_url);addLink(links,'Official profile / contact',r.contact_page);if(r.public_professional_email)addLink(links,'Professional email','mailto:'+r.public_professional_email);body.append(links);
 for(const [title,text]of [['Assessment',r.priority_reason],['Evidence gaps',r.known_gaps],['Next research action',r.next_action],['Documented activity',r.last_activity_basis]]){if(text){const box=el('div',undefined,'detail-block');box.append(el('h3',title),el('p',text));body.append(box);}}
 const sourceBox=el('div',undefined,'detail-block');sourceBox.append(el('h3','Evidence sources'));for(const id of r.source_ids||[]){const s=(db.resources.sources||[]).find(x=>x.id===id);if(s){addLink(sourceBox,s.title||id,s.url);sourceBox.append(el('p',`Source checked: ${s.checked_on||'Not established'}`,'fineprint'));}}body.append(sourceBox);
 if(me.role==='viewer'){const p=el('div',undefined,'detail-block');p.append(el('h3','Internal review note'),el('p',row.review_note||'No note.'),el('p','BHOC last contact: '+(row.bhoc_last_contact_on||'Not recorded')));body.append(p);}
 else buildEdit(body,row);
 $('contact-dialog').showModal();}
function buildEdit(body,row){const r=row.record,sectionBox=el('section',undefined,'detail-block');sectionBox.append(el('h3','Edit record & review'));const form=el('form'),grid=el('div',undefined,'edit-grid');
 field(grid,'edit-name','Contact name',r.name);const priority=field(grid,'edit-priority','Priority (1-10)',r.priority_score,'number');priority.min=1;priority.max=10;
 field(grid,'edit-role','Role / organisation',r.role_summary,'text',true);field(grid,'edit-linkedin','LinkedIn URL',r.linkedin_url||'','url');field(grid,'edit-official','Official profile / contact URL',r.contact_page||'','url');
 field(grid,'edit-email','Public professional email',r.public_professional_email||'','email');field(grid,'edit-countries','Country codes, comma-separated',(r.country_tags||[]).join(', '));
 field(grid,'edit-species','Species, comma-separated',(r.species_tags||[]).join(', '));
 choose(grid,'edit-relation',"Carl's relationship",row.review_relationship,[['not_assessed','Not reviewed'],['known','Known to Carl'],['not_known','Not known to Carl']]);
 choose(grid,'edit-value','Value assessment',row.review_valuable?'yes':'no',[['no','Not assessed'],['yes','Valuable contact']]);
 choose(grid,'edit-active','BHOC Active Contact',row.bhoc_active_contact,[['unknown','Not confirmed'],['active','Active'],['inactive','Not active']]);
 field(grid,'edit-last-contact','BHOC last contact (optional)',row.bhoc_last_contact_on||'','date');
 field(grid,'edit-note','Internal review note (visible to authorised members)',row.review_note,'textarea',true);
 field(grid,'edit-next','Next research action',r.next_action,'textarea',true);
 form.append(grid);const restriction=el('div',undefined,'restriction-box');checkbox(restriction,'edit-restricted','Do not contact',row.do_not_contact);
 if(row.do_not_contact){checkbox(restriction,'release','I explicitly authorise removal of this red restriction',false);field(restriction,'release-reason','Reason for removing the restriction','','textarea');}form.append(restriction);
 form.append(el('p',`Saved under your verified account: ${me.name||me.email}. History is recorded automatically.`, 'fineprint'));
 const actions=el('div',undefined,'form-actions'),save=el('button','Save changes','primary');save.type='submit';actions.append(save);
 if(me.role==='owner'){const del=el('button','Delete contact','danger');del.type='button';del.onclick=async()=>{if(!confirm('Delete this contact? The change history will remain.'))return;try{await api(`/api/contacts/${encodeURIComponent(row.id)}?version=${row.version}`,'DELETE');$('contact-dialog').close();await load();}catch(e){message(e.message,true);}};actions.append(del);}form.append(actions);const result=el('p','','message');result.setAttribute('role','status');form.append(result);
 form.onsubmit=async e=>{e.preventDefault();save.disabled=true;result.textContent='Saving...';try{const updated=await api('/api/contacts/'+encodeURIComponent(row.id),'PUT',{
  version:row.version,patch:{name:$('edit-name').value,priority_score:Number($('edit-priority').value),role_summary:$('edit-role').value,linkedin_url:$('edit-linkedin').value||null,contact_page:$('edit-official').value||null,public_professional_email:$('edit-email').value||null,
   country_tags:$('edit-countries').value.split(',').map(x=>x.trim()).filter(Boolean),species_tags:$('edit-species').value.split(',').map(x=>x.trim()).filter(Boolean),next_action:$('edit-next').value},
  relationship:$('edit-relation').value,valuable:$('edit-value').value==='yes',restricted:$('edit-restricted').checked,note:$('edit-note').value,
  active:$('edit-active').value,last_contact:$('edit-last-contact').value||null,release_confirmed:$('release')?.checked||false,release_reason:$('release-reason')?.value||''});
  $('contact-dialog').close();await load();message('Changes saved under your verified account.');
 }catch(err){result.textContent=err.message;result.classList.add('error');}finally{save.disabled=false;}};sectionBox.append(form);body.append(sectionBox);}
async function showMembers(){const members=await api('/api/admin/members');$('member-list').replaceChildren();for(const m of members){const card=el('article',undefined,'resource-card');card.append(el('h3',m.display_name||m.email),el('p',m.email),el('p',`${m.role.toUpperCase()} · ${m.enabled?'Enabled':'Disabled'}`));if(m.role!=='owner'){const button=el('button',m.enabled?'Revoke access':'Restore access');button.onclick=async()=>{try{await api('/api/admin/members','PUT',{email:m.email,role:m.role,enabled:!m.enabled,display_name:m.display_name});await showMembers();message('Access updated. Existing application sessions were terminated.');}catch(e){message(e.message,true);}};card.append(button);} $('member-list').append(card);}}
$('email-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{const result=await api('/auth/request-code','POST',{email:$('email').value});message(result.message,false,'login-message');$('code-form').hidden=false;$('code').focus();}catch(err){message(err.message,true,'login-message');}finally{button.disabled=false;}};
$('code-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await api('/auth/verify-code','POST',{email:$('email').value,code:$('code').value.trim(),remember:$('remember').checked});$('code').value='';await boot();}catch(err){message(err.message,true,'login-message');}finally{b.disabled=false;}};
$('change-email').onclick=()=>{$('code-form').hidden=true;$('code').value='';$('email').focus();};
$('logout').onclick=async()=>{try{await api('/auth/logout','POST');showLogin();message('You are signed out.',false,'login-message');}catch(e){message(e.message,true);}};
$('close-dialog').onclick=()=>$('contact-dialog').close();
for(const id of ['search','country','species','activity','review-filter','active-filter','priority','sort'])$(id).addEventListener(id==='search'?'input':'change',renderContacts);
$('reset').onclick=()=>{section='all';for(const id of ['search','country','species'])$(id).value='';for(const id of ['activity','review-filter','active-filter'])$(id).value='all';$('priority').value='0';$('sort').value='priority';renderNav();renderContacts();};
$('create-contact').onclick=async()=>{const name=prompt('Contact name');if(!name?.trim())return;try{await api('/api/contacts','POST',{id:'C-'+crypto.randomUUID(),record:{name:name.trim(),priority_score:1}});await load();message('Contact created. Open it to add verified details.');}catch(e){message(e.message,true);}};
$('member-form').onsubmit=async e=>{e.preventDefault();try{await api('/api/admin/members','PUT',{email:$('member-email').value,display_name:$('member-name').value,role:$('member-role').value,enabled:true});await showMembers();message('Access saved. No invitation email was sent.');}catch(err){message(err.message,true);}};
$('show-audit').onclick=async()=>{try{const data=await api('/api/admin/audit');$('audit-list').replaceChildren();for(const a of data.slice().reverse()){const p=el('details',undefined,'audit-item');p.append(el('summary',`${a.recorded_at} · ${a.actor_email||'System'} · ${a.action} · ${a.entity_id||''}`),el('pre',JSON.stringify({before:a.before_value,after:a.after_value},null,2)));$('audit-list').append(p);}}catch(e){message(e.message,true);}};
$('export-all').onclick=async()=>{try{const data=await api('/api/admin/export','POST');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='Important-Contact-private.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}catch(e){message(e.message,true);}};
window.addEventListener('pageshow',e=>{if(e.persisted)boot();});
boot();
