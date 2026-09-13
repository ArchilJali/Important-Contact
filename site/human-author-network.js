'use strict';

(() => {
  const NETWORK_URL = '../human-medicine/data/prehospital-rhd-author-network-2026-09-14.json';
  const STUDY_META = {
    'HDFN modeling': {date:'2026', title:'Rate of future hemolytic disease of the fetus and newborn following prehospital RhD-positive transfusion', url:'https://pubmed.ncbi.nlm.nih.gov/42664369/'},
    'CREDIT-EMS': {date:'2025', title:'Characteristics, Regional Evaluation, and D-Antigen in Transfusions by Emergency Medical Services', url:'https://pubmed.ncbi.nlm.nih.gov/40742584/'},
    'RhD policy / THOR': {date:'2026', title:'RhD-Positive Transfusion in Females of Childbearing Potential in Hemorrhagic Shock: Risk, Reality, and Policy', url:'https://pubmed.ncbi.nlm.nih.gov/42441900/'},
    'Joint position statement': {date:'2026', title:'Post-Transfusion Management of RhD-Negative Females of Childbearing Potential During Trauma Resuscitation', url:'https://pubmed.ncbi.nlm.nih.gov/42490058/'},
    'Pediatric consensus': {date:'2026', title:'Consensus Guidelines for Prehospital Transfusion in Children: A Modified Delphi Study', url:'https://pubmed.ncbi.nlm.nih.gov/42725789/'}
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const personDirections = studies => {
    const d = new Set(['Human Medicine','Prehospital / EMS','Blood / Transfusion','Emergency / Critical Care','Clinical Research']);
    if (studies.some(x => x === 'HDFN modeling' || x === 'RhD policy / THOR' || x === 'Joint position statement')) {
      d.add('RhD / HDFN'); d.add('Transfusion Medicine'); d.add('Hemorrhagic Shock / Resuscitation');
    }
    if (studies.includes('CREDIT-EMS')) { d.add('EMS Systems'); d.add('Air Medical / HEMS'); }
    if (studies.includes('Joint position statement')) { d.add('Trauma'); d.add('Resuscitation'); }
    if (studies.includes('Pediatric consensus')) { d.add('Pediatrics'); d.add('Pediatric EMS'); }
    return d;
  };
  const latestStudy = studies => studies.map(name => STUDY_META[name]).filter(Boolean).sort((a,b) => Number(b.date)-Number(a.date))[0] || null;
  const relevantStudy = studies => studies.map(name => STUDY_META[name]).filter(Boolean)[0] || null;
  async function loadNetwork(){
    const response = await fetch(NETWORK_URL + '?data_ts=' + Date.now(), {cache:'no-store'});
    if (!response.ok) throw Error('Author network HTTP ' + response.status);
    return response.json();
  }
  function addPerson(name, record){
    const existing = all.find(c => !c.isOrganisation && norm(c.name) === norm(name));
    const studies = Array.isArray(record.studies) ? record.studies : [];
    const verified = record.status === 'verified';
    const directions = personDirections(studies);
    const latest = latestStudy(studies);
    const relevant = relevantStudy(studies);
    const routes = {};
    if (record.linkedin) routes.linkedin = record.linkedin;
    if (record.profile) routes.contact_page = record.profile;
    if (record.orcid) routes.orcid = record.orcid;
    if (existing) {
      existing.isAuthor = true;
      existing.isStrategic = true;
      existing.recordStatus = verified ? 'verified_current' : (existing.recordStatus || 'historical_current_unresolved');
      if (record.role) existing.role = record.role;
      if (record.org) existing.org = record.org;
      directions.forEach(d => existing.directions.add(d));
      existing.species.add('human');
      existing.routes = {...existing.routes, ...routes};
      existing.latest_publication = existing.latest_publication || latest;
      existing.relevant_publication = existing.relevant_publication || relevant;
      existing.publicationStatus = 'verified_publication_authorship';
      existing.source = record.profile || relevant?.url || existing.source;
      existing.orgType = orgType(existing.org, existing.routeType || '');
      existing.categories = broadCategories(existing);
      existing.speciesGroups = speciesGroups(existing);
      return;
    }
    const contact = {
      key:'rhd-author:' + slug(name), name, legacyId:null, isAuthor:true, isOrganisation:false, isStrategic:true, isIOCVS:false,
      recordStatus: verified ? 'verified_current' : 'historical_current_unresolved',
      publicationStatus:'verified_publication_authorship',
      role: record.role || 'Publication author; current professional identity not yet independently verified',
      org: record.org || '', countries:new Set(), species:new Set(['human']), directions,
      pubs:[], routes, routeType:'', source:record.profile || relevant?.url || NETWORK_URL,
      latest_publication:latest, relevant_publication:relevant, workplace:'', city:'', core:false
    };
    contact.orgType = orgType(contact.org, '');
    contact.categories = broadCategories(contact);
    contact.speciesGroups = speciesGroups(contact);
    all.push(contact);
  }
  function addOrganisation(name, record){
    if (all.some(c => c.isOrganisation && norm(c.name) === norm(name))) return;
    const routes = {};
    if (record.linkedin) routes.linkedin = record.linkedin;
    if (record.official_page) routes.official_page = record.official_page;
    const directions = new Set(['Human Medicine','Prehospital / EMS','Blood / Transfusion','Clinical Research']);
    if (/THOR|Trauma|ACS/i.test(name)) directions.add('Trauma');
    if (/Allo/i.test(name)) directions.add('RhD / HDFN');
    if (/Pediatric/i.test(name)) directions.add('Pediatrics');
    const contact = {
      key:'rhd-org:' + slug(name), name, legacyId:null, isAuthor:false, isOrganisation:true, isStrategic:true, isIOCVS:false,
      recordStatus:record.status === 'verified_public_organisation' ? 'verified_current' : '', publicationStatus:'not_applicable_organisation',
      role:record.focus || 'Publication-linked organisation', org:name, countries:new Set(), species:new Set(['human']), directions,
      pubs:[], routes, routeType:'institution', source:record.official_page || record.linkedin || NETWORK_URL,
      workplace:'', city:'', latest_publication:null, relevant_publication:null, core:false
    };
    contact.orgType = 'institution';
    contact.categories = broadCategories(contact);
    contact.speciesGroups = speciesGroups(contact);
    all.push(contact);
  }
  async function init(){
    try {
      for (let i=0; i<50; i++) {
        if (typeof all !== 'undefined' && all.length && document.getElementById('rows')) break;
        await sleep(100);
      }
      const network = await loadNetwork();
      for (const [name, record] of Object.entries(network.people || {})) addPerson(name, record || {});
      for (const [name, record] of Object.entries(network.organisations || {})) addOrganisation(name, record || {});
      filters();
      applyRequestedCategory();
      render();
    } catch (error) {
      console.warn('Prehospital author network could not be loaded', error);
    }
  }
  init();
})();
