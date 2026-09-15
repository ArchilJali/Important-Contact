'use strict';
(() => {
  const base = new URL('../', document.currentScript.src).href;
  const source = path => new URL(path, base).href;
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  const clean = s => String(s || '').replace(/[.]+$/, '').trim();
  const citeSig = n => {
    const t = clean(n).split(/\s+/).filter(Boolean);
    return t.length < 2 ? norm(n) : t[0].toLowerCase() + '|' + t.slice(1).join('').replace(/[^A-Za-z]/g, '').toLowerCase();
  };
  const fullSig = n => {
    const t = clean(n).replace(/[()]/g, ' ').split(/\s+/).filter(Boolean);
    return t.length < 2 ? norm(n) : t[t.length - 1].toLowerCase() + '|' + t.slice(0, -1).map(x => (x.replace(/[^A-Za-z]/g, '')[0] || '')).join('').toLowerCase();
  };
  const slug = s => norm(s).replace(/ /g, '-');

  async function getText(path) {
    const url = source(path) + '?count_ts=' + Date.now();
    const r = await fetch(url, {cache: 'no-store'});
    if (!r.ok) throw Error(path + ' HTTP ' + r.status);
    return r.text();
  }
  async function getJSON(urlOrPath, fallback) {
    const url = (String(urlOrPath).startsWith('http') ? urlOrPath : source(urlOrPath)) + '?count_ts=' + Date.now();
    try {
      const r = await fetch(url, {cache: 'no-store'});
      if (!r.ok) throw Error(url + ' HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      console.warn('Contact count source failed', urlOrPath, e);
      return fallback;
    }
  }
  function parseMD(md) {
    const people = [], orgs = [];
    for (const line of String(md || '').split('\n').filter(x => /^\|\s*[PO]\d+/.test(x))) {
      const p = line.split('|').slice(1, -1).map(x => x.trim());
      const r = {id: p[0], name: p[1], role: p[3], country: p[4], species: (p[5] || '').split(',').map(x => x.trim()).filter(Boolean)};
      (/^P/.test(r.id) ? people : orgs).push(r);
    }
    return {people, orgs};
  }
  function splitAuthors(p) {
    return String(p.source_authors || p.authors || '').split(',').map(clean).filter(x => x && !/et\s*al/i.test(x));
  }
  function canonicalIndex(parsed, oxy, enrichment) {
    const idx = new Map();
    const put = n => {
      if (!n) return;
      idx.set(fullSig(n), n);
      idx.set(citeSig(n), n);
      idx.set(norm(n), n);
    };
    for (const p of oxy.people || []) put(p.name);
    for (const p of parsed.people || []) put(p.name);
    for (const n of Object.keys(enrichment.people || {})) put(n);
    for (const [a, n] of Object.entries(enrichment.aliases || {})) {
      idx.set(norm(a), n);
      idx.set(citeSig(a), n);
      idx.set(fullSig(a), n);
    }
    return idx;
  }
  function canonicalName(raw, idx) {
    return idx.get(norm(raw)) || idx.get(citeSig(raw)) || idx.get(fullSig(raw)) || raw;
  }
  function mergeScout(parsed, scout) {
    let n = 0;
    for (const [name, s] of Object.entries(scout.people || {})) {
      if (s && s.role && !parsed.people.some(p => norm(p.name) === norm(name))) {
        n++;
        parsed.people.push({id: 'SCOUT' + n, name, role: s.role, country: Array.isArray(s.country) ? s.country.join(', ') : String(s.country || ''), species: s.species || []});
      }
    }
    for (const [name, s] of Object.entries(scout.organisations || {})) {
      if (!parsed.orgs.some(o => norm(o.name) === norm(name))) {
        n++;
        parsed.orgs.push({id: 'SCOUTO' + n, name, role: (s && s.focus) || 'Verified strategic organisation', country: (s && s.country) || '', species: (s && s.species) || []});
      }
    }
    return parsed;
  }
  function addNamed(map, key, name, type) {
    if (name) map.set(key, {name, type});
  }
  async function veterinaryDirectory() {
    const [md, vets, oxy, iocvs, enrichment, scout] = await Promise.all([
      getText('veterinary/CONTACTS.md').catch(() => ''),
      getJSON('https://archiljali.github.io/BHOC-platform/veterinary/Vet-publications.json', []),
      getJSON('veterinary/data/oxyglobin-authors-institutions.json', {people: []}),
      getJSON('veterinary/data/iocvs-2026-contacts.json', {people: []}),
      getJSON('veterinary/data/contact-enrichment.json', {people: {}, aliases: {}}),
      getJSON('veterinary/scout-verified.json', {people: {}, organisations: {}})
    ]);
    const parsed = mergeScout(parseMD(md), scout);
    const publications = Array.isArray(vets) ? vets : (vets.publications || []);
    const canon = canonicalIndex(parsed, oxy, enrichment);
    const smap = new Map(parsed.people.map(x => [norm(x.name), x]));
    const map = new Map();

    for (const p of publications) {
      for (const raw of splitAuthors(p)) {
        const name = canonicalName(raw, canon);
        const mapped = norm(name) !== norm(raw);
        const key = 'a:' + (mapped ? fullSig(name) : citeSig(raw));
        if (!map.has(key)) addNamed(map, key, name, 'person');
      }
    }
    for (const s of parsed.people) {
      const cname = canonicalName(s.name, canon);
      const exists = [...map.values()].some(x => norm(x.name) === norm(cname));
      if (!exists) addNamed(map, 's:' + slug(cname), cname, 'person');
      smap.set(norm(cname), s);
    }
    for (const o of parsed.orgs) addNamed(map, 'o:' + o.id, o.name, 'organisation');
    for (const i of iocvs.people || []) {
      const iname = canonicalName(i.name, canon);
      const exists = [...map.values()].some(x => norm(x.name) === norm(iname));
      if (!exists) addNamed(map, 'iocvs:' + slug(iname), iname, 'person');
    }
    return {count: map.size, names: [...map.values()].map(x => x.name)};
  }
  async function humanDirectory() {
    const [markdown, scout, authorNetwork] = await Promise.all([
      getText('human-medicine/CONTACTS.md').catch(() => ''),
      getJSON('human-medicine/scout-verified.json', {people: {}, organisations: {}}),
      getJSON('human-medicine/data/prehospital-rhd-author-network-2026-09-14.json', {people: {}, organisations: {}})
    ]);
    const parsed = mergeScout(parseMD(markdown), scout);
    const map = new Map();
    for (const p of parsed.people) addNamed(map, 'p:' + norm(p.name), p.name, 'person');
    for (const o of parsed.orgs) addNamed(map, 'o:' + norm(o.name), o.name, 'organisation');
    for (const name of Object.keys(authorNetwork.people || {})) addNamed(map, 'p:' + norm(name), name, 'person');
    for (const name of Object.keys(authorNetwork.organisations || {})) addNamed(map, 'o:' + norm(name), name, 'organisation');
    return {count: map.size, names: [...map.values()].map(x => x.name)};
  }
  async function wildlifeDirectory() {
    const [data, scout] = await Promise.all([
      getJSON('wildlife-red-book/contacts.json', {contacts: []}),
      getJSON('wildlife-red-book/scout-verified.json', {contacts: []})
    ]);
    const map = new Map();
    for (const x of [...(data.contacts || []), ...(scout.contacts || [])]) {
      const name = x && (x.name || x.title || x.id);
      if (!name) continue;
      const type = String(x.record_type || '').toLowerCase() === 'organisation' ? 'organisation' : 'person';
      map.set(type + ':' + norm(name), {name, type});
    }
    return {count: map.size, names: [...map.values()]};
  }

  const linkedInUrl = value => String(value || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  function linkedInScope(record) {
    const segment = String(record?.s || '').toLowerCase();
    const text = String(record?.n || '') + ' ' + String(record?.o || '') + ' ' + String(record?.r || '') + ' ' + String(record?.s || '');
    if (/one health|biodiversity|conservation|wildlife/.test(segment)) return 'wildlife';
    if (/veterinary|animal health/.test(segment)) return 'veterinary';
    if (/transplantation.*perfusion/.test(segment) && /veterinary|animal|canine|feline|equine|vet\b/i.test(text)) return 'veterinary';
    return 'human';
  }
  function linkedInDirections(record, scope) {
    const d = new Set();
    d.add(scope === 'veterinary' ? 'Veterinary' : scope === 'wildlife' ? 'Wildlife' : 'Human Medicine');
    const segment = String(record?.s || '').trim();
    if (segment) d.add(segment);
    const h = (String(record?.n || '') + ' ' + String(record?.o || '') + ' ' + String(record?.r || '') + ' ' + segment).toLowerCase();
    if (/transplant|perfusion/.test(h)) { d.add('Transplant'); d.add('Organ Support / Preservation'); }
    if (/surgery|surgeon|surgical/.test(h)) d.add('Surgeons / Surgery');
    if (/sickle cell|\bscd\b|\bsca\b/.test(h)) d.add('Sickle Cell / SCA');
    if (/patient blood management|bloodless|\bpbm\b/.test(h)) d.add('PBM Clinical / Bloodless Medicine');
    if (/public health|population health|health policy/.test(h)) d.add('Public Health');
    if (/regulatory|regulation|compliance|market access/.test(h)) d.add('Regulatory');
    if (/sepsis|septic/.test(h)) d.add('Sepsis');
    if (/emergency|critical care|resuscitation|anaesthesia|anesthesia/.test(h)) d.add('Emergency / Critical Care');
    if (/transfusion|hematolog|haematolog|blood bank|anemia|anaemia/.test(h)) d.add('Blood / Transfusion');
    if (/cardiac|cardiovascular|vascular|heart failure|cardio/.test(h)) d.add('Heart / Cardiovascular');
    if (/invest|venture|capital|funds|philanthrop|donor|grant/.test(h)) d.add('Investor');
    if (/chief executive|\bceo\b|president|executive director|\bdirector\b|chief medical officer|vice president|\bvp\b|founder|manager/.test(h)) d.add('CEO / Strategic');
    return d;
  }
  let linkedInNetworkCache;
  async function loadLinkedInNetwork() {
    if (!linkedInNetworkCache) {
      linkedInNetworkCache = (async () => {
        try {
          const manifest = await getJSON('network/data/manifest.json', {total: 0, data_files: []});
          const files = Array.isArray(manifest.data_files) && manifest.data_files.length
            ? manifest.data_files
            : [manifest.data_file || 'network/data/contacts.json.gz'];
          const responses = await Promise.all(files.map(path => fetch(source(path) + '?network_ts=' + Date.now(), {cache: 'no-store'})));
          const bad = responses.find(response => !response.ok);
          if (bad) throw Error('LinkedIn network HTTP ' + bad.status);
          if (!('DecompressionStream' in window)) throw Error('This browser does not support gzip decompression');
          const encoded = (await Promise.all(responses.map(response => response.text()))).join('').replace(/\\s+/g, '');
          const binary = atob(encoded);
          const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
          const stream = new Response(bytes).body.pipeThrough(new DecompressionStream('gzip'));
          const parsed = JSON.parse(await new Response(stream).text());
          return Array.isArray(parsed.contacts) ? parsed.contacts : [];
        } catch (error) {
          console.warn('LinkedIn network source failed', error);
          return [];
        }
      })();
    }
    return linkedInNetworkCache;
  }

  let cached;
  async function get() {
    if (!cached) {
      cached = Promise.all([
        veterinaryDirectory(),
        humanDirectory(),
        wildlifeDirectory(),
        loadLinkedInNetwork()
      ]).then(([v, h, w, network]) => {
        const canonicalNames = new Set([
          ...v.names.map(name => norm(name)),
          ...h.names.map(name => norm(name)),
          ...w.names.map(item => norm(item.name))
        ].filter(Boolean));
        const networkNameCounts = new Map();
        for (const record of network) {
          const name = norm(record && record.n);
          if (name) networkNameCounts.set(name, (networkNameCounts.get(name) || 0) + 1);
        }
        const sections = {veterinary: new Set(), humanMedicine: new Set(), wildlife: new Set()};
        const unique = new Map();
        const addCanonical = (scope, name) => {
          const key = norm(name);
          if (!key) return;
          sections[scope].add('canonical:' + key);
          unique.set('canonical:' + key, name);
        };
        v.names.forEach(name => addCanonical('veterinary', name));
        h.names.forEach(name => addCanonical('humanMedicine', name));
        w.names.forEach(item => addCanonical('wildlife', item.name));
        for (const record of network) {
          const scope = linkedInScope(record);
          const name = norm(record && record.n);
          if (!name) continue;
          const url = linkedInUrl(record.l);
          const identity = url || name + '|' + norm(record.o);
          if (canonicalNames.has(name) && (networkNameCounts.get(name) || 0) === 1) continue;
          const key = 'linkedin:' + identity;
          sections[scope === 'human' ? 'humanMedicine' : scope].add(key);
          unique.set(key, record.n);
        }
        return {
          veterinary: sections.veterinary.size,
          humanMedicine: sections.humanMedicine.size,
          wildlife: sections.wildlife.size,
          linkedinNetwork: network.length,
          total: unique.size
        };
      });
    }
    return cached;
  }
  window.ImportantContactCounts = {get, loadLinkedInNetwork, linkedInScope, linkedInDirections, linkedInUrl};
})();
