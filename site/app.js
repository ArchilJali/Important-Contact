'use strict';
const networkStyles=document.createElement('link');networkStyles.rel='stylesheet';networkStyles.href='network.css';document.head.append(networkStyles);

const cards=[...document.querySelectorAll('.contact-card')];
const search=document.getElementById('search');
const country=document.getElementById('country');
const species=document.getElementById('species');
const priority=document.getElementById('priority');
const count=document.getElementById('resultCount');
const empty=document.getElementById('empty');
let category='all';
function apply(){
  const q=search.value.trim().toLowerCase();
  let visible=0;
  cards.forEach(card=>{
    const cat=card.dataset.category||'';
    const okCategory=category==='all'||cat.includes(category);
    const okCountry=country.value==='all'||card.dataset.country===country.value;
    const okSpecies=species.value==='all'||(card.dataset.species||'').includes(species.value);
    const okPriority=Number(card.dataset.priority||0)>=Number(priority.value||0);
    const hay=(card.textContent+' '+(card.dataset.search||'')).toLowerCase();
    const okSearch=!q||hay.includes(q);
    const show=okCategory&&okCountry&&okSpecies&&okPriority&&okSearch;
    card.hidden=!show;if(show)visible++;
  });
  count.textContent=visible;empty.hidden=visible!==0;
}
[search,country,species,priority].forEach(x=>x.addEventListener('input',apply));
document.querySelectorAll('.direction').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.direction').forEach(x=>x.classList.remove('active'));
  btn.classList.add('active');category=btn.dataset.filter;apply();document.getElementById('workspace').scrollIntoView({behavior:'smooth'});
}));
document.getElementById('reset').addEventListener('click',()=>{search.value='';country.value='all';species.value='all';priority.value='0';category='all';document.querySelectorAll('.direction').forEach((x,i)=>x.classList.toggle('active',i===0));apply();});
document.querySelectorAll('[data-scroll]').forEach(btn=>btn.addEventListener('click',()=>document.getElementById(btn.dataset.scroll).scrollIntoView({behavior:'smooth'})));
const dialog=document.getElementById('recordDialog');
document.querySelectorAll('.view-btn').forEach(btn=>btn.addEventListener('click',()=>{document.getElementById('dialogTitle').textContent=btn.dataset.name;dialog.showModal();}));
document.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});

const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
const uniq=a=>[...new Set((a||[]).filter(Boolean))];
function addTags(parent,items){const box=make('div',undefined,'tags');uniq(items).slice(0,7).forEach(t=>box.append(make('span',t)));parent.append(box);}
function publicationLink(pub){
  const url=pub.article_url||(pub.doi?`https://doi.org/${pub.doi}`:'')||(pub.pmid?`https://pubmed.ncbi.nlm.nih.gov/${pub.pmid}/`:'');
  if(!url)return null;
  const a=make('a',`${pub.year||'Year?'} · ${pub.title||'Publication'}`,'evidence-link');
  a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;
}
function publicationList(parent,pubs){
  const box=make('div',undefined,'publication-links');
  pubs.slice(0,4).forEach(pub=>{const a=publicationLink(pub);if(a)box.append(a);});
  if(pubs.length>4)box.append(make('small',`+ ${pubs.length-4} more linked publications`));
  parent.append(box);
}

async function installOxyglobinNetwork(){
  const anchor=document.querySelector('.methodology');if(!anchor)return;
  const section=make('section',undefined,'section evidence-network');section.id='oxyglobin-network';
  const shell=make('div',undefined,'shell');section.append(shell);
  const head=make('div',undefined,'network-head');
  const headLeft=make('div');headLeft.append(make('p','IMPORTANT CONTACT · EVIDENCE-LINKED NETWORK','eyebrow dark'),make('h2','Oxyglobin authors & institutions'));
  const note=make('p','People and institutions are separate records. Publication affiliations are historical bibliographic evidence only and do not prove current employment, study location or institutional endorsement.','network-note');
  head.append(headLeft,note);shell.append(head);
  const status=make('p','Loading Important Contact Oxyglobin baseline…','network-status');shell.append(status);
  try{
    const res=await fetch('data/oxyglobin-authors-institutions.json',{cache:'no-store'});if(!res.ok)throw Error(`HTTP ${res.status}`);
    const data=await res.json();
    const publications=data.publications||[];
    const pubById=new Map(publications.map(p=>[p.id,p]));
    const institutions=data.institutions||[];
    const instById=new Map(institutions.map(i=>[i.id,i]));
    const people=data.people||[];
    status.remove();

    const controls=make('div',undefined,'network-controls');
    const peopleBtn=make('button','People','network-mode active');
    const instBtn=make('button','Institutions / Organisations','network-mode');
    const input=make('input');input.type='search';input.placeholder='Search person, institution, species, article or characteristic…';input.className='network-search';
    controls.append(peopleBtn,instBtn,input);shell.append(controls);

    const peopleGrid=make('div',undefined,'cards network-grid');const instGrid=make('div',undefined,'cards network-grid');instGrid.hidden=true;

    function personCard(person){
      const pubs=(person.publication_ids||[]).map(id=>pubById.get(id)).filter(Boolean).sort((a,b)=>(b.year||0)-(a.year||0));
      const linkedInst=(person.publication_affiliation_ids||[]).map(id=>instById.get(id)).filter(Boolean);
      const card=make('article',undefined,'contact-card network-card');
      card.dataset.networkSearch=[person.name,...(person.characteristics||[]),...linkedInst.map(i=>i.name),...pubs.map(p=>p.title),...pubs.flatMap(p=>p.species||[])].join(' ').toLowerCase();
      const top=make('div',undefined,'card-top');top.append(make('span','OXYGLOBIN / HBOC AUTHOR','type'),make('span',pubs.length,'score'));card.append(top);
      card.append(make('h3',person.name));
      const affiliation=linkedInst.length?linkedInst.map(i=>i.name).join(' · '):'Historical article affiliation not yet resolved';
      card.append(make('p',`Publication affiliation (historical): ${affiliation}`,'role'));
      addTags(card,person.characteristics||[]);
      card.append(make('div',undefined,'card-rule'),make('p',`${pubs.length} linked publication${pubs.length===1?'':'s'}. Current role: ${person.current_role_status==='verification_pending'?'verification pending':person.current_role_status||'not set'}.`,'evidence'));
      publicationList(card,pubs);return card;
    }

    function institutionCard(inst){
      const pubs=(inst.publication_ids||[]).map(id=>pubById.get(id)).filter(Boolean).sort((a,b)=>(b.year||0)-(a.year||0));
      const authors=people.filter(p=>(p.publication_affiliation_ids||[]).includes(inst.id)).map(p=>p.name);
      const card=make('article',undefined,'contact-card network-card institution-card');
      card.dataset.networkSearch=[inst.name,inst.institution_type,inst.country,...(inst.characteristics||[]),...authors,...pubs.map(p=>p.title)].join(' ').toLowerCase();
      const top=make('div',undefined,'card-top');top.append(make('span','INSTITUTION / ORGANISATION','type'),make('span',pubs.length,'score'));card.append(top);
      card.append(make('h3',inst.name),make('p',`${inst.country||''} · ${(inst.institution_type||'institution').replaceAll('_',' ')}`,'role'));
      addTags(card,inst.characteristics||[]);
      card.append(make('div',undefined,'card-rule'),make('p',authors.length?`Evidence-linked authors: ${authors.slice(0,8).join(', ')}${authors.length>8?'…':''}`:(inst.note||'Historical publication affiliation.'),'evidence'));
      publicationList(card,pubs);return card;
    }

    people.forEach(p=>peopleGrid.append(personCard(p)));institutions.forEach(i=>instGrid.append(institutionCard(i)));shell.append(peopleGrid,instGrid);
    const sourceLine=make('p','Important Contact internal evidence dataset. Publication links open the original PubMed/DOI source.','network-source');shell.append(sourceLine);

    let mode='people';
    function filterNetwork(){const q=input.value.trim().toLowerCase(),grid=mode==='people'?peopleGrid:instGrid;[...grid.children].forEach(c=>c.hidden=!!q&&!c.dataset.networkSearch.includes(q));}
    peopleBtn.onclick=()=>{mode='people';peopleBtn.classList.add('active');instBtn.classList.remove('active');peopleGrid.hidden=false;instGrid.hidden=true;filterNetwork();};
    instBtn.onclick=()=>{mode='institutions';instBtn.classList.add('active');peopleBtn.classList.remove('active');instGrid.hidden=false;peopleGrid.hidden=true;filterNetwork();};
    input.addEventListener('input',filterNetwork);
  }catch(err){status.textContent='Oxyglobin contact dataset is not available in this build.';status.classList.add('error');}
  anchor.before(section);
}
installOxyglobinNetwork();
