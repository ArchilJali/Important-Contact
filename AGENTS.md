# Important Contact agent boundaries

The master contact database, emails, internal assessments and user decisions remain private. Keep the master in the approved private repository. Do not change repository visibility or publish master data, internal notes, exports or credentials on a public website.

## Public canonical contact hygiene

`veterinary/CONTACTS.md`, `veterinary/contact-routes.json` and `veterinary/scout-verified.json` are public-safe contact-intelligence files. Store only public professional identity, current organisation, current role/specialty, verified public professional routes and source evidence.

Never write relationship status, `personal_connection`, `linkedin_relationship`, BHOC follower/following state, `follows_archil`, `follows_bhoc`, internal priority, outreach state, private notes, internal assessments, inferred familiarity or other non-public/user-specific metadata into these public files. Do not use a public canonical file as a substitute for a private relationship tracker.

Apply the strict identity gate before promotion: exact full name + current employer/organisation + current role/specialty must match current authoritative evidence. For scientific authors, also verify authorship/topic. Historical publication affiliation is not proof of current employment. Ambiguous LinkedIn/name/employer matches stay unpromoted. Never generate email addresses or guess LinkedIn URLs. `veterinary/data/contact-enrichment.json` is not authority to bypass this gate; an enrichment record must be rechecked against current evidence before canonical promotion.

On every contact-intelligence run, review `veterinary/scout-verified.json` first and promote only fully verified, deduplicated entries that fit the canonical schema. Never create a second canonical person record. Quality takes precedence over contact counts. No outreach, connection request or message is authorised by verification alone.

## User exclusion - current HbO2 Therapeutics personnel

Archil explicitly excluded current HbO2 Therapeutics personnel from Important Contact targeting on 2026-09-06. Do not add, restore, recommend, enrich for outreach, or promote any person who is currently an employee, executive, consultant, board member or otherwise currently affiliated with HbO2 Therapeutics. This applies across Veterinary, Oxyglobin/HBOC research, Wildlife / Red Book, LinkedIn Scout and any future contact-intelligence view. Historical Oxyglobin/HBOC publications and old Biopure-era evidence may still be retained as scientific/bibliographic evidence, but they must not create a current contact target when the person is presently affiliated with HbO2 Therapeutics. If current affiliation is uncertain, hold the candidate rather than adding them.

## Temporary local-file exception authorised on 2026-09-05

Archil requested interim work with Carl and Karen without email authentication. The separate builder in `scripts/build_temporary_share.py` generates standalone HTML copies in `veterinary/temporary-share/`. This mode is file sharing, not a live shared website. It must clearly disclose that anyone holding a file can read it and that local edits are not automatically synchronised. Initial shared copies exclude human review histories, suppression records, access configuration and secrets. Browser role labels and claimed authors are NOT identities or protected permissions. Mark exported and imported proposals as unverified, require owner review before acceptance, and preserve red restrictions and conflicting edits. Do not send files or messages without a separate instruction. Do not remove authentication from production code or weaken SQL policies to make the temporary copies work.

## Protected application

The intended role configuration is Owner (Archil's verified account), Editor (carl.rausch@wteii.com), Viewer (karen.lee@wteii.com). Never infer identity from a name, browser role selector or post body. Only the owner may change application access. No invitation or outreach email is authorised by a positive score alone.

Do not invent reviews or active BHOC relationships. Initial BHOC Active Contact state is Not confirmed. A contact known to Carl is not automatically an active BHOC relationship. A red restriction wins over positive scores and requires explicit acknowledged release with a reason. Preserve history but do not restore the removed Last Carl validation column in the shared interface.

Research can add evidence and candidates through a future dedicated restricted ingest interface. It cannot modify memberships, human reviews, BHOC contact state or audit entries. No production research credential or scheduler is active. A runnable file is not evidence of a running agent.

Do not send OTP values to chat, logs, GitHub or another person's mailbox. Application secrets belong only in the hosting secret manager. Never bypass TLS, row-level policies or email verification in the protected app.
