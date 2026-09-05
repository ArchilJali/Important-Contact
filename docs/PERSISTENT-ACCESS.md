# Remember until sign-out or revocation

**Prepared code only. Not deployed; no live access, device registration or email has been created.**

## User-facing behaviour

- Any allowlisted member can sign in on more than one personal browser/device. Each new browser profile needs its own email code. No per-device owner approval is required. The allowlist and role remain authoritative.
- With Remember selected, this app imposes no 30-day maximum and no 7-day inactivity cutoff. The server record has `remembered=true`, `expires_at=null`.
- The cookie requests a rolling 400-day retention period, refreshed after each successful authenticated request. A browser may still delete it earlier or impose different retention. If the browser retains no valid cookie, the user needs a new email code; their approved membership is not deleted.
- Closing the browser is not an application sign-out when Remember is selected. Explicit Sign out deletes only the current application session and asks the Auth provider to sign out that local session. Other verified devices remain signed in.
- Revoking/changing a membership ends that person's application sessions. Their next request is denied. Already downloaded/visible data cannot be recalled. There is no separate device-management screen in this release.
- Without Remember, the server lifetime is 12 hours and the browser cookie is session-scoped. Remember is not preselected on public/shared devices.
- Owner access changes and full export retain the existing 15-minute fresh-verification requirement. This is a sensitive-action check, not a periodic logout from ordinary work.

## Security and operational limits

Email access must be protected; a stolen browser session can be abused until revoked. Short-lived provider access tokens, encrypted server-side refresh tokens, HTTPS, HttpOnly/Secure/SameSite cookies, allowlist checks and write permissions stay enabled. No tracking fingerprint, IP lock or copying a token between devices is used.

A provider security reset, revoked/invalid refresh token, removal of access, explicit sign-out or lost browser data may require reauthentication. “Remember” is not unconditional permanent authentication. Temporary provider errors deny access but do not intentionally discard the remembered record.

Update-only session persistence avoids recreating a token deleted by a concurrent revocation. Multi-tab refresh serialization remains a production acceptance item; the existing provider reuse tolerance must remain enabled. Production deployment must exercise provider Auth, SMTP, SQL/RLS, HTTPS and two-device tests; local mocked tests are not a security audit.

## Required migration and service settings

1. Fresh installation: apply SQL 001 then 002. Existing previous installation: apply 002 only, with a backup. Old sessions stay temporary until a new verified Remember selection; contacts and permissions are not migrated or deleted.
2. Set no Auth session time-box or inactivity timeout; disable Single session per user. Keep refresh token rotation and a short JWT lifetime.
3. Deploy the new backend and static files together, then run the acceptance checklist in DEPLOYMENT.md.

## Official references checked 2026-09-05

- Supabase session controls, multiple sessions and refresh tokens: https://supabase.com/docs/guides/auth/sessions
- Chrome's cookie maximum and renewal/early deletion: https://developer.chrome.com/blog/cookie-max-age-expires/
- Session security trade-offs: https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Session_management
- OWASP session protections and reauthentication: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
