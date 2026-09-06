# Veterinary Contact Intelligence

This directory contains the public-professional data sources used by the BHOC Important Contact working pages.

## Current source layers

1. [`CONTACTS.md`](CONTACTS.md) - curated strategic people and organisations with role, country, species and primary public source.
2. [`contact-routes.json`](contact-routes.json) - verified public professional contact routes such as LinkedIn, institutional email and official profile.
3. [`data/oxyglobin-authors-institutions.json`](data/oxyglobin-authors-institutions.json) - historical Oxyglobin / HBOC author and institution baseline linked to the BHOC Veterinary publication catalogue.
4. [`data/iocvs-2026-contacts.json`](data/iocvs-2026-contacts.json) - IOCVS 2026 contacts, multi-direction classifications and conference/publication evidence.
5. [`data/contact-enrichment.json`](data/contact-enrichment.json) - normalization layer for canonical names and aliases, multi-direction tags, current-vs-historical verification state, verified contact overrides and independently checked latest publications.
6. `BHOC-platform/veterinary/Vet-publications.json` - the larger publication catalogue loaded by the web interface. For authors without independent enrichment, the UI labels the newest matching record as **Latest in BHOC library**, not as a globally verified latest publication.

## Contact model

A person can belong to multiple directions at the same time. Examples include Small Animal + Zoo + Wildlife + One Health, or Equine + Emergency / Critical Care + Hemorrhagic Shock + Oxygen Delivery. Directions are additive and are designed for filtering rather than exclusive classification.

Scientific contacts should have an independently verified latest publication when it can be matched confidently to the same person. If identity or current affiliation is unresolved, the record is explicitly marked historical/current unresolved and no contact detail is guessed. Executive, investment, philanthropy and operational roles may use `publication_status: not_applicable_role` when a scientific publication is not a meaningful field for the role.

## Safety and privacy

Only public professional facts and institutional contact routes belong in Git-tracked/public-page data. Relationship status (`We work`, `We know`, `We do not know`) remains browser-local and must not be converted into public claims or stored as private relationship history in these source files.

Current HbO2 Therapeutics personnel remain excluded from contact targeting under the repository rule in [`../AGENTS.md`](../AGENTS.md). Historical Oxyglobin / Biopure evidence can remain as bibliography, but it must not create a current outreach target where current HbO2 affiliation applies or is uncertain.

Repository visibility is an owner-level setting and is not changed by data-maintenance work. If repository visibility and local metadata disagree, treat that as a configuration issue requiring owner review rather than silently changing access controls.
