#!/usr/bin/env python3
"""Build local HTML copies. Never changes production auth, the seed, or repo privacy."""
from pathlib import Path
import argparse, hashlib, json, re
ROOT = Path(__file__).resolve().parents[1]

def replace(text, old, new):
    if old not in text:
        raise ValueError('Source UI has changed; review replacement: ' + old[:75])
    return text.replace(old, new)

def build(output):
    raw = (ROOT/'veterinary/data/snapshot.json').read_bytes()
    seed = json.loads(raw)
    if any(seed.get(k) for k in ['carl_reviews','suppression','contact_history']):
        raise ValueError('Human decisions exist. Review sanitisation; do not silently reset or distribute them.')
    digest = hashlib.sha256(raw).hexdigest()
    fields = ['id','name','entity_type','groups','country_tags','species_tags','role_summary','affiliation_id','source_ids','priority_score','score_status','priority_reason','research_depth','evidence_confidence','known_gaps','next_action','linkedin_url','linkedin_status','public_professional_email','email_status','contact_page','last_checked','sections','last_activity_date','last_activity_date_precision','last_activity_source_ids','last_activity_basis','last_activity_range_start','last_activity_range_end']
    data = {'entities': [{k:v for k,v in e.items() if k in fields} for e in seed['entities']],
            'resources': {k: seed.get(k,[]) for k in ['sources','programmes','funding_events','works','relationships','taxonomy']}}
    css = (ROOT/'app/static/style.css').read_text()
    html = (ROOT/'app/static/index.html').read_text()
    js = (ROOT/'app/static/app.js').read_text()
    js = re.sub(r'// No database[^\n]*\n','// Temporary local copy. No remote API or authentication.\n',js, count=1)
    a,b = js.index('async function api('),js.index('function link(')
    js = js[:a]+(ROOT/'temporary-share/offline-adapter.js').read_text()+'\n'+js[b:]
    js = replace(js,"[['contacts','Contacts'],['sources','Sources'],['programmes','Grants & Programmes'],['funding_events','Funding'],['relationships','Relationships'],['works','Publications'],['queue','Research Queue']]", "[['contacts','Contacts'],['sources','Sources'],['programmes','Grants & Programmes'],['funding_events','Funding'],['relationships','Relationships'],['works','Publications']]")
    js = replace(js,"if(me.role==='owner')tabs.push(['admin','Access & History']);",'')
    js = replace(js,"$('permission-note').textContent=me.role==='viewer'?'View-only access · links and filters are available':me.role==='editor'?'Editor access · contact records and reviews':'Owner access · full workspace control';", "$('permission-note').textContent='No login · local file · no automatic synchronisation';updateLocalNotice();")
    js = replace(js,"'Internal review note (visible to authorised members)'", "'Review note (included when you export this local file)' ")
    js = replace(js,'Saved under your verified account: ${me.name||me.email}. History is recorded automatically.', 'Saved locally as a proposal from ${me.name}. Author identity is not verified.')
    js = replace(js,'Changes saved under your verified account.','Draft saved locally. Export your changes to send them to Archil.')
    # Remove authentication handlers. Production source files are not modified.
    a,b = js.index("$('email-form').onsubmit"),js.index("$('close-dialog').onclick")
    js=js[:a]+js[b:]
    a,b = js.index("$('member-form').onsubmit"),js.index("window.addEventListener('pageshow'")
    js=js[:a]+js[b:]
    js=replace(js,'boot();\n','boot().then(installLocalTools);\n')
    js=replace(js,"if(me.role==='viewer'){const p=el('div',undefined,'detail-block');p.append(el('h3','Internal review note'),el('p',row.review_note||'No note.'),el('p','BHOC last contact: '+(row.bhoc_last_contact_on||'Not recorded')));body.append(p);}","if(me.role==='viewer'){const p=el('div',undefined,'detail-block');p.append(el('p','This snapshot contains no private human review notes.'),el('p','BHOC last contact: '+(row.bhoc_last_contact_on||'Not recorded')));body.append(p);}")
    js=replace(js,"$('admin-view').hidden=key!=='admin';",'')
    # No offline login panel or administrative membership UI.
    a,b=html.index('<section id="login"'),html.index('<div id="workspace"')
    html=html[:a]+html[b:]
    a,b=html.index('  <section id="admin-view"'),html.index('  <p id="workspace-message"')
    html=html[:a]+html[b:]
    html=replace(html,'<div id="workspace" hidden>','<div id="workspace">')
    html=replace(html,'<button id="logout">Sign out</button>','')
    html=replace(html,'<span class="online-dot"></span> Private · authenticated access','Temporary local copy · no authentication')
    html=replace(html,'  <nav id="tabs"', '<section class="share-note"><strong>Temporary file-sharing mode.</strong> Anyone with this file can read the included contact research. This is not a restricted online account. Changes stay on this device until exported; files do not sync between people.<p id="local-state"></p><div class="share-tools"><button id="local-export" class="primary">Export changes for Archil</button><label id="local-import-label" class="import-label">Import review file<input id="local-import" type="file" accept=".json,application/json"></label><button id="local-history">Local history</button></div></section>\n  <nav id="tabs"')
    html=replace(html,'Private collaborative workspace. Human judgements remain internal. No analytics, third-party fonts or tracking images.','Local review copy. No automatic uploads, authentication or online collaboration. Keep exported notes confidential. No trackers or external scripts.')
    html=replace(html,'This private workspace needs JavaScript. No contact data is included in this page.','Enable JavaScript to use the filters. This file contains the included contact research.')
    html=replace(html,'<title>Important Contact | Private Workspace</title>','<meta name="referrer" content="no-referrer"><title>Important Contact | Temporary local copy</title>')
    html=replace(html,'<link rel="stylesheet" href="/assets/style.css"><script defer src="/assets/app.js"></script>','<style>'+css+'\n.share-note{padding:18px 22px;background:#fff4d9;border:1px solid #e9cc85;border-radius:12px;margin-bottom:20px;font-size:14px}.share-tools{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.import-label{font-size:13px;display:flex;gap:8px;align-items:center}.share-note p{margin:8px 0}dialog pre{white-space:pre-wrap;overflow-wrap:anywhere}[hidden]{display:none!important}</style>')
    # Remove login/admin references from generic refresh/error paths.
    js=replace(js,"$('login').hidden=true;",'')
    js=replace(js,"async function boot(){try{me=await api('/api/me');await load();}catch(e){showLogin();if(!e.message.includes('sign in'))message(e.message,true,'login-message');}}", "async function boot(){try{me=await api('/api/me');await load();}catch(e){message('Could not load local copy: '+e.message,true);}}")
    output.mkdir(parents=True,exist_ok=True)
    manifest={'schema':'important-contact.local-copy-build.v1','source_seed_sha256':digest,'source_seed_git_blob':hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest(),'contacts':len(data['entities']),'sources':len(data['resources']['sources']),'authentication':False,'online_deployment':False,'automatic_sync':False,'private_human_notes_included':False,'files':{}}
    for mode,label,filename in [('viewer','Karen · viewing copy','Important-Contact-Karen-View.html'),('reviewer','Carl · review copy','Important-Contact-Carl-Review.html'),('owner','Archil · working copy','Important-Contact-Archil-Workspace.html')]:
        share={'mode':mode,'label':label,'seed_sha256':digest,'data':data}
        text='const SHARE = '+json.dumps(share,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')+';\n'+js
        rendered=html.replace('</body>','<script>'+text.replace('</script','<\\/script')+'</script></body>')
        (output/filename).write_text(rendered,encoding='utf-8')
        manifest['files'][filename]=hashlib.sha256(rendered.encode()).hexdigest()
    (output/'BUILD.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(manifest,indent=2))
    return manifest

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,default=ROOT/'veterinary/temporary-share');args=p.parse_args();build(args.output)
