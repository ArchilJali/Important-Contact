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
    const parsed = parseMD(await getText('human-medicine/CONTACTS.md').catch(() => ''));
    const map = new Map();
    for (const p of parsed.people) addNamed(map, 'p:' + norm(p.name), p.name, 'person');
    for (const o of parsed.orgs) addNamed(map, 'o:' + o.id, o.name, 'organisation');
    return {count: map.size, names: [...map.values()].map(x => x.name)};
  }
  async function wildlifeDirectory() {
    const data = await getJSON('wildlife-red-book/contacts.json', {contacts: []});
    const records = data.contacts || [];
    return {
      count: records.length,
      names: records.map(x => ({name: x.name || x.title || x.id, type: String(x.record_type || '').toLowerCase() === 'organisation' ? 'organisation' : 'person'})).filter(x => x.name)
    };
  }

  let cached;
  async function get() {
    if (!cached) {
      cached = Promise.all([veterinaryDirectory(), humanDirectory(), wildlifeDirectory()]).then(([v, h, w]) => {
        const unique = new Map();
        [...v.names.map(name => ({name})), ...h.names.map(name => ({name})), ...w.names].forEach(x => {
          const key = norm(x.name);
          if (key) unique.set(key, x.name);
        });
        return {veterinary: v.count, humanMedicine: h.count, wildlife: w.count, total: unique.size};
      });
    }
    return cached;
  }
  window.ImportantContactCounts = {get};
})();