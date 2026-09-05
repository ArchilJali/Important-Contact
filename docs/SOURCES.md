# Primary technical references consulted, 5 September 2026

- Supabase email OTP and signup control: https://supabase.com/docs/guides/auth/auth-email-passwordless
- Supabase SMTP delivery requirements: https://supabase.com/docs/guides/auth/auth-smtp
- Supabase database row-level security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase server-side authentication and caching: https://supabase.com/docs/guides/auth/server-side/advanced-guide
- OWASP session management: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP authentication: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP CSRF prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- GitHub Pages visibility warning: https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/creating-a-github-pages-site
- FastAPI container deployment: https://fastapi.tiangolo.com/deployment/docker/

The previous 30-day remembered-device maximum and 7-day inactivity limit have been removed for explicitly remembered sessions. No application age/inactivity deadline, a rolling 400-day requested cookie retention, the 12-hour unremembered server lifetime, 15-minute owner step-up window and extra throttles are implementation choices. Browser retention is not an indefinite guarantee; see PERSISTENT-ACCESS.md. Six-digit/10-minute OTP behaviour requires the documented Auth configuration. No plan price or vendor SLA has been assumed.

- Chrome cookie retention and renewal (checked 2026-09-05): https://developer.chrome.com/blog/cookie-max-age-expires/
- MDN session lifetime trade-offs (checked 2026-09-05): https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Session_management
