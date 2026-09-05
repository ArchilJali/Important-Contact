# Temporary no-login copies

Requested by Archil on 2026-09-05 as an interim way to work with Carl and Karen without setting up authentication. These are standalone HTML files, NOT a deployed multi-user website. The repository remains private. Production application authentication and SQL policies are unchanged.

## Send only the intended file

- `Important-Contact-Karen-View.html`: viewing interface, search, filters, sources and external links; no editing controls.
- `Important-Contact-Carl-Review.html`: edit existing contact drafts, colour-coded reviews and BHOC Active Contact; export proposed changes for Archil.
- `Important-Contact-Archil-Workspace.html`: local working copy with editing, addition/deletion, import preview and export. Keep this copy for Archil.

Save the HTML attachment to your computer and open it in a normal browser, not in an email preview. No account or installation is needed for the standalone interface. Email providers may restrict HTML attachments; a ZIP containing the selected file is also supplied in the chat.

Carl opens a contact, changes the fields, saves the local draft and uses **Export changes for Archil**. Send the resulting JSON file directly to Archil. Archil opens his own HTML, selects **Import review file**, reviews the proposed changes and explicitly accepts them. Duplicate imports are skipped, conflicting edits are blocked, and imported proposals cannot silently remove an existing red restriction.

All saves and accepted imports affect that local browser copy ONLY. They do not update GitHub, Supabase, Karen's file or anyone else's browser. Browser storage is best-effort; export before closing, changing devices, clearing browser data or replacing the file. File-mode localStorage behaviour depends on the browser. An export is your portable backup. Historical timestamps and author names in these drafts are device-provided, not authenticated Carl decisions. Store imported results as unverified proposals until Archil accepts them.

Anyone holding a file can read its embedded research. The different interfaces are conveniences, not secured roles. Forwarded files cannot be remotely revoked. Do not upload them to a public website or assume a private repository makes a published Pages site private. Human notes are not included in the initial copies. The temporary copies include the existing 33 contacts and 50 sources; no new source verification or BHOC relationships were invented.

## Build

Run `python scripts/build_temporary_share.py` from the repository. A scoped GitHub Actions build also generates these files and commits them into this directory in the same private repository. It does not deploy a website, send email, enable a research schedule, or contact any external research service. `BUILD.json` records source and output hashes.

The browser check on 2026-09-05 passed 39 assertions through Chromium's HTML rendering mode. Direct file and HTTP navigation were blocked by the testing environment, so real-browser file storage persistence was not tested. Editing, filtering, links, export/import, duplicate handling, red restrictions and the storage-unavailable fallback were exercised. No tests sent messages or modified the original data.
