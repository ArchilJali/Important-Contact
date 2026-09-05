# Important Contact cleanup - 05 Sep 2026

The repository is now intended to be a focused BHOC Contact Intelligence workspace.

Keep:
- `site/` - current working interface
- `veterinary/` - source-of-truth contact, institution, publication and research data
- `.github/workflows/pages-preview.yml` - GitHub Pages deployment workflow
- `AGENTS.md` and `veterinary/research/` - research-agent operating context

Removed as obsolete:
- FastAPI / Supabase backend
- Docker / SQL deployment files
- OTP/auth documentation
- temporary-share builds
- old local publisher scripts
- backend/security test suite
- old import/share workflows

Important Contact must remain separate from BHOC-platform. BHOC-platform may be used only as a scientific source when necessary; Contact Intelligence data and UI belong here.
