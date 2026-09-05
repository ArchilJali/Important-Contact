# Deployment and live acceptance

**Not deployed. No verification email has been sent to Carl, Karen or Archil.**

## 1. Exact identity and private storage

Use a new, dedicated Supabase project under Archil's account. Choose a suitable data region. Keep source and seed data in the private `ArchilJali/Important-Contact` repository. Do not create public Pages deployments. Collaborators get application access, not repository/dashboard membership. Project operators, hosting operators, backups and credentials remain additional administrative trust boundaries.

For a fresh project, run `sql/001_private_workspace.sql` and then `sql/002_remember_until_revoked.sql` once through the project's SQL editor. For an existing deployment of the previous package, apply only migration 002 after backing up; legacy sessions may require one new code and explicit Remember consent. The script enables RLS on every app table, revokes anonymous grants, limits user grants and creates the editor/viewer email entries without creating Auth accounts or sending email. Review SQL and run the live permission tests before launch.

## 2. Email authentication

In Supabase Auth, enable email OTP and disable public signup and anonymous sign-in. Keep email confirmation enabled. Set OTP length to 6, expiry to **600 seconds**, and resend interval to **60 seconds or longer**. Apply `otp-email-template.html` to both the Magic Link and Confirm Signup templates when supported by the chosen Auth configuration. The application calls `/otp` with `create_user=false` and verifies `type=email`.

Configure a production SMTP sender with an authorised From address, verified sending domain and SPF/DKIM/DMARC. Do not add Carl or Karen as Supabase project administrators merely to work around the default mail service. Test actual delivery and spam handling for both `wteii.com` addresses. Protect the users' email accounts with their own multifactor authentication; email OTP is not phishing-resistant MFA for this app.

Set the Site URL to the exact HTTPS application origin and remove wildcard/unneeded redirect URLs. Disable unused providers. Apply provider-side rate limits and review Auth logs without logging codes. The BFF has additional persistent per-email and peer-IP attempt limits; these do not replace the provider's own protections against direct calls to its Auth endpoint.

### Remember-until-revoked and multiple devices

In Auth session settings leave **Time-box user sessions** and **Inactivity timeout** unset/disabled (zero where the control defines zero as disabled). Keep **Single session per user OFF**. Keep access tokens short-lived (the usual one-hour JWT lifetime is not the remembered-session lifetime), provider refresh-token rotation and reuse protection enabled. Verify these exact effective settings in the actual project: changing this package does not change a hosted project's Auth settings.

New devices authenticate with a code sent to the same individually allowlisted address; they do not need an additional owner approval. Roles do not change between devices. The app will renew the remembered browser cookie after each successful authenticated request, not issue a new email code. See `PERSISTENT-ACCESS.md`; browser retention and provider/security revocation can still require a new sign-in.

## 3. Backend secrets and initial provisioning

Deploy Python 3.12+ with the provided Dockerfile on a private-configured HTTPS web-service host. This is a backend, not a GitHub Pages site. Store environment values in the host's secret manager. Never put the real `.env`, SMTP password, management token or secret API key into a chat, repository or browser bundle.

Required values are listed in `.env.example`. Generate `SESSION_ENCRYPTION_KEY` locally with Fernet. `APP_ORIGIN` must be the final HTTPS origin with no path, query or trailing slash. Set `OWNER_EMAIL` to Archil's explicitly chosen email; no owner address has been guessed. Browser authentication in ChatGPT does not populate it.

After applying SQL and loading server environment variables, run:

```sh
python -m pip install -r requirements.txt
python scripts/bootstrap.py --owner-email "$OWNER_EMAIL" --seed
```

This provisions existing exact accounts or creates unconfirmed Auth accounts. It does NOT send invitations or mark emails as confirmed. Real users must verify a code. Re-running with `--seed` on a populated database stops rather than overwriting data. A partial seed import requires administrator inspection, not blind reruns.

Start:

```sh
uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000 --no-access-log --no-proxy-headers
```

Terminate TLS at the hosting ingress. Restrict network access to the trusted ingress. Set the public Host to match `APP_ORIGIN`. The default command does not trust arbitrary forwarded headers; if your provider uses a proxy, configure only its documented trusted proxy addresses in uvicorn so per-IP rate limits distinguish end users. Never trust a client-supplied `X-Forwarded-For` from the open internet. Keep the app cookie secure and disable CDN caching for all app/auth/API routes, including error and redirect responses. Health checks can use `/healthz` but must present the configured Host.

## 4. Required live tests before granting access

- Anonymous GETs of contact/API data must fail. Public static assets must contain no seed/contact/allowlist data. Raw storage and tables must not become public through alternate domains or paths.
- Bootstrap and verify each identity. Test both initial unconfirmed-user OTP and returning-user OTP. Six-digit codes must expire after 10 minutes and reject reuse. Confirm throttling and generic messages for unknown emails. Test the direct Supabase Auth endpoint as well as the app.
- Using Karen's real account, read records and links successfully. Try a direct PUT/POST/DELETE to the app, direct PostgREST table mutations, RPC edits, member management and audit export. All disallowed requests must fail on the server/database, not merely hide a button.
- Using Carl's account, edit one controlled test contact, its assessment and BHOC state. Confirm he cannot change members, create/delete contacts or export the entire database through the owner endpoint.
- Using Archil's account, test creation, editing, deletion, history and member revocation. Ensure role and timestamp are server-generated. Verify the owner cannot be impersonated by submitting a body field.
- Exercise row version conflicts and the red-restriction release acknowledgement. Confirm a known/valuable contact does not become a BHOC active contact automatically.
- Revoke a test member while their remembered session is open. The next data request must fail. Verify sign-out, cookie flags and absence of Auth tokens in browser storage. Back/forward navigation must re-check authentication.
- Verify a remembered session older than 30 days and inactive for more than 7 days is still accepted (using a controlled test clock/fixture). An unremembered session must end within 12 hours.
- Verify the same user on two devices has two independent sessions with the same role. Signing out device B must not sign out A. Revoke that member and confirm both devices are denied. Confirm cookie renewal on successful requests, never on logout or denied requests.
- Test network failures, expired refresh tokens and simultaneous tabs. The default provider refresh-token reuse tolerance should remain enabled; heavy concurrent same-session use may require a per-session distributed refresh lock.
- Confirm TLS, hosting secrets, restricted database administration, backup retention, recovery procedure and dependency scanning. Exported private files must be handled as confidential data.

Only after these tests: give each approved person the application URL. They enter their own allowlisted email and request a code. Do not send a common password. Do not send previous all-in-one HTML database files as the collaboration method.

## Data and operations

The seed contains prior research, not new verification. Human assessments remain internal. Visible viewers can copy data; no browser-only technique can prevent screenshots or all copying. Old downloaded snapshots are outside revocation control.

Keep original offline-review events with truthful provenance if later migrated; do not relabel them as authenticated Carl actions. Make backups before merging historical data. The current seed contains zero such review events.

Purge expired temporary application sessions (`expires_at IS NOT NULL AND expires_at <= now()`) and old rate buckets with a privileged maintenance job. Never delete remembered sessions merely because they are older than 30 days or inactive for 7 days. Separately audit abandoned or compromised devices and exercise owner revocation. Do not purge the decision audit merely because a user's access was revoked. Application administrators should define a retention policy for audit history and personal data.

Research automation remains unactivated. Preserve a separate least-privilege write route for discovered references and candidates; it must not have membership or reviewer privileges.
