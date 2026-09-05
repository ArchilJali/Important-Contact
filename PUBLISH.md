# Publish this private repository

## Exact target

`ArchilJali/Important-Contact`, **Private**, with the exact `veterinary/` directory. This is not a public BHOC website and is not the earlier `veterinary-direction/` path.

## On Archil's Mac

Unzip the entire package, open its `Important-Contact` folder, and run `Publish-to-GitHub.command`. Python 3.9 or later is required. If the file cannot be opened, run `bash ` followed by the dragged `.command` file path in Terminal. Do not disable macOS security globally.

The publisher uses an installed official GitHub CLI when available. Otherwise it downloads the official `cli/cli` release v2.100.0 for this architecture, verifies its SHA-256 digest against the release asset metadata, extracts only the CLI executable into a user cache, and checks that it runs on this OS. It does not use Homebrew, sudo, Git, a shared password, or a token supplied in chat. An unsupported OS will stop safely.

If needed, GitHub CLI opens GitHub's device sign-in flow. Authorise as **ArchilJali**. Existing GitHub browser login may help with this step but is not itself an API authorisation. The publisher checks the API account before creating anything.

## What the publisher does

1. Validates a fixed file manifest. Unlisted local files, `.env`, secret keys and caches are never uploaded.
2. Creates only `ArchilJali/Important-Contact` with `private=true`, or verifies the existing target.
3. Refuses an unrelated/non-empty repository, public visibility, GitHub Pages, an existing Actions workflow or a mismatched account. It never changes another repository's visibility or contents.
4. Uploads only the manifest. Existing unrelated files are preserved; detected edits to project files cause a stop rather than an overwrite. There is no force-push or remote deletion.
5. Rechecks private visibility, branch revision and every uploaded Git blob before recording success in local `PUBLISH-RESULT.json` and opening `veterinary/` in the browser.

A failed upload may leave a newly created private repository or unreferenced Git objects. It does not delete a repository to clean up. Retrying the same package after a temporary error is supported; any concurrent change must be reconciled first.

The local publisher's mocked tests do not prove that real GitHub permissions or network access are configured. Only a completed live upload and its verification result prove publication.

## What this does NOT deploy

Repository publication does not deploy the FastAPI/Supabase application, activate research every 72 hours, send sign-in codes, or grant Carl or Karen access. App roles remain Owner / Editor / Viewer, but creating real Auth identities requires the deployment procedure in `docs/DEPLOYMENT.md`. Do not give collaborators repository access as a substitute for the application's role restrictions.

## Local check without network

```bash
python3 scripts/publish_github.py --check-only
```

## Official references

- GitHub CLI login: https://cli.github.com/manual/gh_auth_login
- GitHub repository creation: https://docs.github.com/en/rest/repos/repos#create-a-repository-for-the-authenticated-user
- Git trees: https://docs.github.com/en/rest/git/trees
- Git commits: https://docs.github.com/en/rest/git/commits
- Git references, non-forced update: https://docs.github.com/en/rest/git/refs#update-a-reference
- Official GitHub CLI release: https://github.com/cli/cli/releases/tag/v2.100.0
