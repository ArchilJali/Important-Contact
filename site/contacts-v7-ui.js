'use strict';

const baseDataMatch = match;

function recordBadge(contact) {
  if (contact.recordStatus === 'historical_current_unresolved') {
    return '<span class="tag warn">Historical / current unresolved</span>';
  }
  if (contact.recordStatus === 'verified_current_emeritus') {
    return '<span class="tag verified">Current emeritus</span>';
  }
  if (contact.recordStatus === 'verified_current') {
    return '<span class="tag verified">Current verified</span>';
  }
  if (contact.recordStatus === 'source_export_requires_current_verification') {
    return '<span class="tag warn">LinkedIn source / verify current role</span>';
  }
  return '';
}

function render() {
  const rows = all
    .filter(baseDataMatch)
    .sort((a, b) =>
      Number(b.isIOCVS) - Number(a.isIOCVS) ||
      Number(b.core) - Number(a.core) ||
      Number(b.isStrategic) - Number(a.isStrategic) ||
      a.name.localeCompare(b.name)
    );

  $('rows').innerHTML = rows.map(contact => `
    <tr>
      <td>
        <span class="name">${esc(contact.name)}</span>
        <span class="sub">${esc(contact.role)}</span>
        ${recordBadge(contact)}
        ${contact.isIOCVS ? '<span class="tag gold">IOCVS 2026</span>' : ''}
        ${contact.core ? '<span class="tag core">Oxyglobin/HBOC</span>' : ''}
        ${contact.categories.has('grant_program') ? '<span class="tag grant">Grant Program</span>' : ''}
        ${contact.isAuthor ? '<span class="tag">Author</span>' : ''}
      </td>
      <td class="org">
        ${esc(contact.org || 'Not resolved')}
        <span class="sub">${esc(contact.workplace || '')}</span>
        <span class="sub">${contact.orgType === 'company' ? 'Company' : 'Institute / organisation'}</span>
      </td>
      <td class="country">${esc([...contact.countries].join(', ') || '-')}<span class="sub">${esc(contact.city || '')}</span></td>
      <td class="directions">${[...contact.directions].map(value => `<span class="chip dir">${esc(value)}</span>`).join('') || '-'}</td>
      <td class="species">${groupHTML(contact)}${[...contact.species].map(value => `<span class="chip">${esc(value)}</span>`).join('') || (!contact.speciesGroups.size ? '-' : '')}</td>
      <td class="contact">${routeHTML(contact.routes)}</td>
      <td class="pubs">${latestHTML(contact)}</td>
      <td class="source">
        <a class="src" href="${esc(contact.source || 'https://archiljali.github.io/BHOC-platform/veterinary/Vet-search.html')}" target="_blank" rel="noopener">Open source</a>
        ${contact.isAuthor ? '<a class="src" href="https://archiljali.github.io/BHOC-platform/veterinary/Vet-search.html" target="_blank" rel="noopener">Vet-search</a>' : ''}
      </td>
    </tr>
  `).join('');

  const sectionCount = $('sectionCount');
  if (sectionCount) sectionCount.textContent = all.length;
  $('count').textContent = `${rows.length} of ${all.length} contacts`;
  $('authors').textContent = all.filter(contact => contact.isAuthor).length;
  $('iocvs').textContent = all.filter(contact => contact.isIOCVS).length;
}

const filterIds = [
  'fCategory',
  'fDirection',
  'fRoute',
  'fCountry',
  'fSpecies',
  'fCompany',
  'fInstitute',
  'fEvidence'
];

filterIds.forEach(id => $(id).onchange = render);
$('fName').oninput = render;
$('fInstituteText').oninput = render;
$('reset').onclick = () => {
  filterIds.forEach(id => $(id).value = 'all');
  $('fName').value = '';
  $('fInstituteText').value = '';
  render();
};

async function getText(url) {
  const fresh = url + (url.includes('?') ? '&' : '?') + 'data_ts=' + Date.now();
  const response = await fetch(fresh, {cache: 'no-store'});
  if (!response.ok) throw Error(`${url} HTTP ${response.status}`);
  return response.text();
}

async function getJSON(url, fallback) {
  try {
    const fresh = url + (url.includes('?') ? '&' : '?') + 'data_ts=' + Date.now();
    const response = await fetch(fresh, {cache: 'no-store'});
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn('Optional source failed', url, error);
    return fallback;
  }
}

let directoryLinkedInNetworkCache;
async function loadDirectoryLinkedInNetwork() {
  if (!directoryLinkedInNetworkCache) {
    directoryLinkedInNetworkCache = (async () => {
      try {
        const manifest = await getJSON('../network/data/manifest.json', {total: 0, data_files: []});
        const files = Array.isArray(manifest.data_files) && manifest.data_files.length
          ? manifest.data_files
          : [manifest.data_file || '../network/data/contacts.json.gz'];
        const responses = await Promise.all(files.map(path => getText('../network/' + path)));
        const encoded = responses.join('').replace(/\s+/g, '');
        const binary = atob(encoded);
        const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
        const stream = new Response(bytes).body.pipeThrough(new DecompressionStream('gzip'));
        const parsed = JSON.parse(await new Response(stream).text());
        return Array.isArray(parsed.contacts) ? parsed.contacts : [];
      } catch (error) {
        console.warn('Direct LinkedIn directory load failed', error);
        return [];
      }
    })();
  }
  return directoryLinkedInNetworkCache;
}
function directoryLinkedInScope(record) {
  const segment = String(record?.s || '').toLowerCase();
  const text = String(record?.n || '') + ' ' + String(record?.o || '') + ' ' + String(record?.r || '') + ' ' + String(record?.s || '');
  if (/one health|biodiversity|conservation|wildlife/.test(segment)) return 'wildlife';
  if (/veterinary|animal health/.test(segment)) return 'veterinary';
  if (/transplantation.*perfusion/.test(segment) && /veterinary|animal|canine|feline|equine|vet\b/i.test(text)) return 'veterinary';
  return 'human';
}
function directoryLinkedInDirections(record, scope) {
  const d = new Set();
  d.add(scope === 'veterinary' ? 'Veterinary' : 'Human Medicine');
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
function normalizeLinkedInUrl(value) {
  return String(value || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
}
async function mergeLinkedInNetworkForScope() {
  const scope = activeScope();
  if (!['veterinary', 'human'].includes(scope) || !window.ImportantContactCounts?.loadLinkedInNetwork) return;
  const records = await loadDirectoryLinkedInNetwork();
  if (window.ImportantContactCounts?.get) await window.ImportantContactCounts.get();
  const existingByUrl = new Map();
  const existingByNameOrg = new Map();
  for (const contact of all) {
    const url = normalizeLinkedInUrl(contact.routes?.linkedin);
    if (url) existingByUrl.set(url, contact);
    const name = norm(contact.name);
    const org = norm(contact.org || contact.workplace);
    if (name && org) {
      const key = name + '|' + org;
      const list = existingByNameOrg.get(key) || [];
      list.push(contact);
      existingByNameOrg.set(key, list);
    }
  }
  for (const record of records) {
    const target = directoryLinkedInScope(record);
    if (target !== scope || !record?.n) continue;
    if (window.ImportantContactCounts?.isLinkedInCanonicalDuplicate && window.ImportantContactCounts.isLinkedInCanonicalDuplicate(target, record)) continue;
    const url = normalizeLinkedInUrl(record.l);
    const name = String(record.n).trim();
    const org = String(record.o || '').trim();
    const key = norm(name) + '|' + norm(org);
    let contact = url ? existingByUrl.get(url) : null;
    if (!contact && org) {
      const candidates = existingByNameOrg.get(key) || [];
      if (candidates.length === 1) contact = candidates[0];
    }
    const directions = directoryLinkedInDirections(record, target);
    if (contact) {
      contact.routes = contact.routes || {};
      if (url && !contact.routes.linkedin) contact.routes.linkedin = url;
      if (!contact.org && org) contact.org = org;
      if (!contact.role && record.r) contact.role = String(record.r);
      directions.forEach(value => contact.directions.add(value));
      contact.directions = deriveDirections(contact);
      contact.categories = broadCategories(contact);
      contact.speciesGroups = speciesGroups(contact);
      continue;
    }
    contact = {
      key: 'linkedin:' + (url || key),
      name,
      legacyId: null,
      isAuthor: false,
      isOrganisation: false,
      isStrategic: false,
      isIOCVS: false,
      recordStatus: 'source_export_requires_current_verification',
      publicationStatus: '',
      role: String(record.r || 'LinkedIn source contact; current role requires verification'),
      org,
      countries: new Set(),
      species: new Set(),
      directions,
      pubs: [],
      routes: url ? {linkedin: url} : {},
      routeType: '',
      source: url || 'https://www.linkedin.com/',
      workplace: '',
      city: '',
      latest_publication: null,
      relevant_publication: null,
      core: false
    };
    contact.orgType = orgType(contact.org, '');
    contact.directions = deriveDirections(contact);
    contact.categories = broadCategories(contact);
    contact.speciesGroups = speciesGroups(contact);
    all.push(contact);
    if (url) existingByUrl.set(url, contact);
    if (org) {
      const list = existingByNameOrg.get(key) || [];
      list.push(contact);
      existingByNameOrg.set(key, list);
    }
  }
}

async function updateDirectoryTotal() {
  const element = $('allSectionsCount');
  if (!element || !window.ImportantContactCounts) return;
  try {
    const summary = await window.ImportantContactCounts.get();
    element.textContent = summary.total ?? '-';
  } catch (error) {
    console.warn('Directory total failed', error);
    element.textContent = '-';
  }
}

function mergeScout(parsed, routes, enrichment, scout) {
  const mergedRoutes = {
    people: {...(routes.people || {})},
    organisations: {...(routes.organisations || {})}
  };
  const mergedEnrichment = {
    people: {...(enrichment.people || {})},
    aliases: {...(enrichment.aliases || {})}
  };
  let sequence = 0;

  for (const [name, scoutRecord] of Object.entries(scout.people || {})) {
    mergedRoutes.people[name] = {...(mergedRoutes.people[name] || {}), ...scoutRecord};
    const countries = Array.isArray(scoutRecord.country)
      ? scoutRecord.country
      : String(scoutRecord.country || '').split(',').map(value => value.trim()).filter(Boolean);
    mergedEnrichment.people[name] = {
      ...(mergedEnrichment.people[name] || {}),
      organisation: scoutRecord.organisation || mergedEnrichment.people[name]?.organisation,
      role_override: scoutRecord.role || mergedEnrichment.people[name]?.role_override,
      country: countries,
      species: Array.isArray(scoutRecord.species) ? scoutRecord.species : [],
      linkedin: scoutRecord.linkedin || mergedEnrichment.people[name]?.linkedin,
      email: scoutRecord.email || mergedEnrichment.people[name]?.email,
      phone: scoutRecord.phone || mergedEnrichment.people[name]?.phone,
      contact_page: scoutRecord.contact_page || mergedEnrichment.people[name]?.contact_page,
      orcid: scoutRecord.orcid || mergedEnrichment.people[name]?.orcid,
      record_status: 'verified_current'
    };
    if (scoutRecord.role && !parsed.people.some(person => norm(person.name) === norm(name))) {
      sequence += 1;
      parsed.people.push({
        id: `SCOUT${sequence}`,
        name,
        type: 'Person',
        role: scoutRecord.role,
        country: countries.join(', '),
        species: Array.isArray(scoutRecord.species) ? scoutRecord.species : [],
        source: scoutRecord.source || scoutRecord.contact_page || scoutRecord.linkedin || ''
      });
    }
  }

  for (const [name, scoutRecord] of Object.entries(scout.organisations || {})) {
    mergedRoutes.organisations[name] = {...(mergedRoutes.organisations[name] || {}), ...scoutRecord};
    if (!parsed.orgs.some(organisation => norm(organisation.name) === norm(name))) {
      sequence += 1;
      parsed.orgs.push({
        id: `SCOUTO${sequence}`,
        name,
        type: 'Institution / Organisation',
        role: scoutRecord.focus || 'Verified strategic organisation',
        country: scoutRecord.country || '',
        species: Array.isArray(scoutRecord.species) ? scoutRecord.species : [],
        source: scoutRecord.official_page || ''
      });
    }
  }

  return {routes: mergedRoutes, enrichment: mergedEnrichment};
}

(async () => {
  try {
    const base = window.CONTACT_DATA_BASE || '../veterinary';
    const publicationsUrl = window.CONTACT_PUBLICATIONS_URL === false
      ? null
      : (window.CONTACT_PUBLICATIONS_URL || '/BHOC-platform/veterinary/Vet-publications.json');
    const markdown = await getText(base + '/CONTACTS.md');
    const parsed = parseMD(markdown);
    const [routes, publications, oxyglobin, iocvs, enrichment, scout] = await Promise.all([
      getJSON(base + '/contact-routes.json', {people: {}, organisations: {}}),
      publicationsUrl ? getJSON(publicationsUrl, []) : Promise.resolve([]),
      getJSON(base + '/data/oxyglobin-authors-institutions.json', {people: []}),
      getJSON(base + '/data/iocvs-2026-contacts.json', {people: []}),
      getJSON(base + '/data/contact-enrichment.json', {people: {}, aliases: {}}),
      getJSON(base + '/scout-verified.json', {people: {}, organisations: {}})
    ]);
    const merged = mergeScout(parsed, routes, enrichment, scout);
    all = build(
      publications.publications || publications,
      parsed,
      merged.routes,
      oxyglobin,
      iocvs,
      merged.enrichment
    );
    await mergeLinkedInNetworkForScope();
    filters();
    applyRequestedCategory();
    render();
    updateDirectoryTotal();
  } catch (error) {
    console.error(error);
    $('count').textContent = 'Could not load strategic contact list';
  }
})();
