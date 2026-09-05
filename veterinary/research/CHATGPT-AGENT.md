# Important Contact | Veterinary Intelligence

Status: **instruction profile prepared; not a registered ChatGPT scheduled task**.

## Goal

Progressively build and verify a private English contact-intelligence database for Archil Jaliashvili. Cover veterinarians, equine/dog/cat/wildlife specialists, clinics, institutes, scientists, journals, investors, funds, grants, philanthropic people and organisations, public conservation supporters, zoos, sanctuaries, nature reserves, manufacturers, distributors, dealers, consultants and country-level commercial partners. Keep endangered-species/Red Book work distinct from general environmental interests.

## Research protocol

Start from the stored research queue and previous reports; do not start the same research again under a new name. Check fresh developments, deepen existing dossiers and rotate historical searches across 2006-2010, 2011-2015, 2016-2020 and 2021 onward. Requested history begins 5 September 2006. Record what was actually covered; never claim exhaustive 20-year review from a few search results.

Separate public professional contact routes: verified personal LinkedIn, verified organisation LinkedIn, public work email, official contact form and institutional profile. Never infer or generate a LinkedIn URL, guess an email, collect private contact details or bypass access controls. Mark indexed text, retrieved page, full paper, video description and watched video as different levels of access. A video is not reviewed until its content or transcript is actually examined.

For funding, preserve donor/investor identity, recipient, date, currency, announcement versus payment, grant versus investment versus in-kind support, and source evidence. Keep grant deadlines and applicant/country/species eligibility separate. A donor acknowledgement does not establish an open call or willingness to finance BHOC.

For individuals, separate current verified role from historical affiliation. Scientific species/topic relevance is not proof of clinical specialisation or species-specific BHOC efficacy. For companies, distinguish manufacturer, site, brand owner, importer, distributor, marketing agency and consultant.

## Prioritisation

Priority is 1-10: strategic fit 0-3; documented activity 0-2; decision relevance 0-2; public professional route 0-2; recent relevant signal 0-1. Cap unreviewed scores at 9, store component values and a concrete reason. Separate evidence confidence A/B/C and research depth D0-D4. No score for inferred wealth, sensitive traits or celebrity alone. No assumed BHOC interest.

## Data operations

Maintain one entity record with multiple sections, not copies per category. Merge people only with corroborated identifiers; ORCID is useful for authors, but current employer still needs verification. Link activities, sources, works, funding events and relationships through IDs. Keep changed-source leads pending until reviewed. Respect `data/suppression.json`.

Use exact dates when proven; otherwise retain month/year precision or null. `last_activity_date` is derived from `activities.json`; it is never the current date simply because the source was fetched today. `last_checked` and `last_source_scan_at` are separate concepts.

Every completed research pass must report new records, meaningful changes, source links, unresolved identity/contact issues, revised priorities, coverage achieved, failures and next tasks. Avoid duplicate reports of unchanged findings. Drafting/sending outreach is a future workstream requiring separate permission.

## Operating boundary

The current chat can perform an explicit research pass when invoked and supplied with supported search/write tools. It must not promise hidden background execution. Native scheduling requires an actual scheduling tool and a returned task ID; GitHub writing requires an available authenticated writer. The supplied local/cloud Python collector is an executable but narrower public-metadata and official-page collector, not a replacement for this full protocol.


## Carl Rausch review boundary

Read the current server-managed contact restrictions and human reviews through an authorised, limited-scope backend before producing a shortlist. The SQL contact records and audit history belong to authorised human reviewers, never to the research collector. The initial snapshot is not the source of truth for live human decisions. New contacts start **Not reviewed**, without a review date or attributed opinion. Do not infer familiarity from coauthorship, publicity or an algorithmic priority score. Do not edit human decisions, erase history, clear contact restrictions, or turn a source-check date into Carl's validation date.

Use `scripts/reviews.py` to derive effective status. **Do not contact** overrides familiarity, value and priority, never expires automatically, and is excluded from positive shortlists. A review conflict is held for human resolution; old imported green decisions cannot silently replace red. Releasing red requires a new explicit human decision, an acknowledgement and a private explanation.

Carl's private caution is a subjective internal assessment, not a verified public allegation. Keep notes in this private database only, omit them from ordinary shortlist exports and never copy them to public BHOC sites. Positive reviews are not permission to send messages or make introductions. No outreach is authorised by this feature. Offline name selection is not identity authentication.
