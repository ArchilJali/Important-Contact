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
    filters();
    render();
    updateDirectoryTotal();
  } catch (error) {
    console.error(error);
    $('count').textContent = 'Could not load strategic contact list';
  }
})();
