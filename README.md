# Important Contact | Private collaborative workspace

**Release:** 2026-09-05, private GitHub publication package with the exact `veterinary/` directory.
**Target repository:** `ArchilJali/Important-Contact`, private only.
**Current state:** source package being imported into the verified private repository. The application is not deployed. No real Auth accounts, application access grants, emails or scheduler jobs have been created. See `docs/GITHUB-PUBLICATION.json` for the verified publication record once present.

This package replaces the standalone HTML-sharing model with a server-gated application. It is not a password wrapper around an exposed contact file.

## Requested access model

| Person | Exact identity | Role | Permissions |
|---|---|---|---|
| Archil Jaliashvili | Owner email must be supplied and verified | Owner | Read, edit, create and delete contacts; manage application access; inspect history; export the private database |
| Carl Rausch | carl.rausch@wteii.com | Editor | Read existing contacts, use all links, edit records, reviews and BHOC relationship state. No user administration, contact creation/deletion or full-database export endpoint |
| Karen Lee | karen.lee@wteii.com | Viewer | Read records and internal review notes, filter/search/sort, open all stored links. Cannot change records or reviews or administer access |
| Everyone else | Not individually allowlisted | No access | No contact data returned |

These are configured roles, not access already granted online. The entire `wteii.com` domain is NOT allowlisted. Neither collaborator needs GitHub or Supabase project administration access.

Owner identity is never inferred from the string “Archil”, a selected UI role, a client-supplied email, a ChatGPT login or a GitHub browser session. This implementation uses verified email for the owner as well as collaborators. OAuth is not implemented in this package.

## What changed in the interface

`Last Carl validation` has been removed from the shared interface. The app has a separate **BHOC Active Contact** field: **Active**, **Not active**, **Not confirmed**. Every imported contact starts as **Not confirmed**; no active relationship has been invented. Optional **BHOC last contact** is a distinct date, not an assessment date.

Carl's Review remains separate: **Known to Carl**, **Valuable contact**, **Not known to Carl**, **Do not contact**, **Not reviewed**. A red restriction overrides a positive relationship. Removing a red restriction requires explicit acknowledgement and a written reason. Concurrent stale writes are rejected rather than silently overwriting another user's decision.

The change timestamp and the authenticated account are still captured in the owner-only audit log. “Last Carl validation” has not merely been renamed to “BHOC Active Contact”: they describe different facts. Reviews recorded by the owner are attributed to the owner, not fraudulently authenticated as Carl.

Core groups remain **Investors & Funds**, **Veterinary Doctors & Science**, **Philanthropy**, **Wildlife**, **Zoos & Nature Reserves**. Grants, companies/partners and media remain separate classifications. Activity filters include the last 6 months, 1 year, 3 years, 10 years, older than 10 years and unknown dates. No new historical research was performed in this security update.

## Architecture

Browser -> HTTPS FastAPI backend -> Supabase Auth / PostgreSQL.

The browser receives only the login shell before authentication. No contact JSON, private notes, account allowlist or API secrets are bundled into its HTML/JavaScript. The server checks the current member role on every request. PostgreSQL enforces read access through row-level security and writes through explicitly permission-checked database functions. Direct table mutations are not granted to authenticated users.

Supabase Auth generates and verifies email codes. Configure a six-digit code, 10-minute expiry and both relevant email templates. Public signup is disabled. The application also sets `create_user=false`; provisioning happens only through administration. Unknown-address responses do not reveal whether an email is a member.

The **“Remember this personal device until I sign out or access is revoked”** option has **no application-level absolute lifetime and no inactivity timeout**. It applies to all three allowlisted roles; it never grants extra permissions. Each new browser/profile/device must complete its own six-digit email verification. Existing devices remain signed in; the owner does not need to approve each device separately while that email remains allowlisted. Sign out ends only this browser's session; owner membership revocation/change ends that account's application sessions.

The browser cookie is opaque, Secure, HttpOnly and SameSite=Strict. It requests **400 days of retention renewed on every successful authenticated response**. This is not an absolute session lifetime and is not a promise that a browser will retain a cookie forever: clearing cookies, browser limits, an expired/revoked provider session or a security reset require a fresh code. Do not copy cookies to another device. Configure Auth with no time-box or inactivity timeout and **Single session per user disabled**.

Without Remember, the cookie is session-scoped and server access is limited to 12 hours. Upstream access tokens remain short-lived and refresh tokens stay encrypted on the server. No localStorage tokens, browser fingerprinting or shared passwords are used. Each request checks current membership and role; a transient refresh outage returns an error without deleting trust, and a session update never resurrects a revoked token. Owner access changes and full export still require verification no older than 15 minutes. Keeping access persistent increases the consequences of a stolen browser session, so use a locked personal device and protect the email account.

See [PERSISTENT-ACCESS.md](docs/PERSISTENT-ACCESS.md) for exact behaviour and limitations.

## Repository publication

The private repository now exists. Do not rerun the local publisher after this import; it is retained as a historical installation utility. Five illustrative PNG previews remain in the original downloadable ZIP and are not needed by the app.

Original local-publisher procedure: run `Publish-to-GitHub.command` on your own Mac with Python 3.9 or later. The publisher uses your own GitHub sign-in, verifies the account and private visibility, uploads only the fixed manifest, and verifies the resulting commit. If GitHub CLI is not installed, it downloads a checksum-verified official CLI executable into a local user cache. It does not ask for a token in chat, enable GitHub Pages, grant collaborator repository access, configure Supabase, or start a scheduler. See [PUBLISH.md](PUBLISH.md).

## Start here

Read [DEPLOYMENT.md](docs/DEPLOYMENT.md). Required external configuration: a dedicated Supabase project, working SMTP sender, owner email, and an HTTPS host for the Python application. Make is not required.

`sql/001_private_workspace.sql` is a **new-project migration**, not a blind update for a populated project. Run `sql/002_remember_until_revoked.sql` after it. An existing deployment of the previous package needs migration 002 only; legacy sessions are not automatically promoted to indefinite trust. The seed contains the previous 33 contacts and 50 source records; it is outside the served assets. `scripts/bootstrap.py` provisions accounts without sending email, binds the Auth UUIDs, and can import the original seed once. It refuses to replace an existing live contact database.

The Docker runtime excludes seed files, tests and historical records. Only `/assets/` exposes static code. Do not host the repository root or old standalone contact HTML on GitHub Pages. Keep the entire repository private.

## Validation and limits

Local backend tests use **mocked Supabase responses**. They verify application access controls, cookie handling, anonymous-data denial, CSRF, exact allowlisting, revocation, role restrictions and expected conflict handling. They do not prove a hosted Supabase project's SMTP delivery, deployed SQL/RLS enforcement, production HTTPS configuration, backup protection or operational security. Live acceptance tests in `docs/DEPLOYMENT.md` are mandatory before sharing access.

Do not interpret this package as an independent security audit or an absolute no-leak guarantee. An authorised reader can still copy, photograph or forward information they can see. Previously distributed standalone HTML files cannot be remotely recalled or made private by this new login system. Read-only access is an editing restriction, not DRM.

`veterinary/research/` preserves the earlier research instructions and queue context. No research scheduler was activated or changed here. Automated researchers must never overwrite human reviews, active-contact decisions, memberships or audit entries. A dedicated limited-scope ingest identity is needed before connecting a production research agent; do not hand the Supabase service key to a research prompt.

All interface text and repository instructions are in English.
