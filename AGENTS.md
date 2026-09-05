# Important Contact agent boundaries

The master contact database, emails, internal assessments and user decisions remain private. Keep the master in the approved private repository. Do not change repository visibility or publish master data, internal notes, exports or credentials on a public website.

## Temporary local-file exception authorised on 2026-09-05

Archil requested interim work with Carl and Karen without email authentication. The separate builder in `scripts/build_temporary_share.py` generates standalone HTML copies in `veterinary/temporary-share/`. This mode is file sharing, not a live shared website. It must clearly disclose that anyone holding a file can read it and that local edits are not automatically synchronised. Initial shared copies exclude human review histories, suppression records, access configuration and secrets. Browser role labels and claimed authors are NOT identities or protected permissions. Mark exported and imported proposals as unverified, require owner review before acceptance, and preserve red restrictions and conflicting edits. Do not send files or messages without a separate instruction. Do not remove authentication from production code or weaken SQL policies to make the temporary copies work.

## Protected application

The intended role configuration is Owner (Archil's verified account), Editor (carl.rausch@wteii.com), Viewer (karen.lee@wteii.com). Never infer identity from a name, browser role selector or post body. Only the owner may change application access. No invitation or outreach email is authorised by a positive score alone.

Do not invent reviews or active BHOC relationships. Initial BHOC Active Contact state is Not confirmed. A contact known to Carl is not automatically an active BHOC relationship. A red restriction wins over positive scores and requires explicit acknowledged release with a reason. Preserve history but do not restore the removed Last Carl validation column in the shared interface.

Research can add evidence and candidates through a future dedicated restricted ingest interface. It cannot modify memberships, human reviews, BHOC contact state or audit entries. No production research credential or scheduler is active. A runnable file is not evidence of a running agent.

Do not send OTP values to chat, logs, GitHub or another person's mailbox. Application secrets belong only in the hosting secret manager. Never bypass TLS, row-level policies or email verification in the protected app.
