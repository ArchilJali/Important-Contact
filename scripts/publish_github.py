#!/usr/bin/env python3
"""Publish this manifest to one private repository using the owner's GitHub login.

No web hosting, mail, collaborator grants, background tasks, token printing,
force-pushes, or changes to other repositories are performed.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import subprocess
import sys
import tarfile
import time
from urllib.parse import quote
from urllib.request import Request, urlopen
import webbrowser
import zipfile

OWNER = "ArchilJali"
REPOSITORY = OWNER + "/Important-Contact"
PROJECT_ID = "bhoc-important-contact-private"
CLI_VERSION = "2.100.0"
ROOT = Path(__file__).resolve().parents[1]
MARKER = ".important-contact.json"
MANIFEST = ".publish-manifest.json"


class PublishError(RuntimeError):
    pass


class ApiError(PublishError):
    def __init__(self, status: int, method: str, endpoint: str):
        self.status = status
        super().__init__(f"GitHub {method} request failed (HTTP {status or 'unknown'}): {endpoint}")


def git_blob_sha(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def safe_relative(value: str) -> PurePosixPath:
    path = PurePosixPath(value)
    if not value or path.is_absolute() or ".." in path.parts or "\\" in value:
        raise PublishError("Unsafe path in the publication manifest.")
    if any(p in {".git", ".venv", ".local", ".tools", "node_modules", "__pycache__"} for p in path.parts):
        raise PublishError("Local-only path in the publication manifest.")
    if path.name.startswith(".env") and path.name != ".env.example":
        raise PublishError("Refusing to publish an environment secret file.")
    if path.suffix.lower() in {".pem", ".key", ".p12", ".pfx"}:
        raise PublishError("Refusing to publish a private key file.")
    return path


def load_payload(root: Path) -> dict:
    source = root / MANIFEST
    document = json.loads(source.read_text(encoding="utf-8"))
    if document.get("repository") != REPOSITORY or document.get("visibility") != "private":
        raise PublishError("The package manifest does not target the approved private repository.")
    files = {}
    for record in document["files"]:
        rel = str(safe_relative(record["path"]))
        local = root / rel
        if local.is_symlink() or root.resolve() not in local.resolve().parents:
            raise PublishError("Refusing a symbolic link or a file outside the package.")
        data = local.read_bytes()
        if hashlib.sha256(data).hexdigest() != record["sha256"]:
            raise PublishError(f"Package file was modified: {rel}. Review it and rebuild the manifest before publishing.")
        if record.get("mode") not in {"100644", "100755"} or len(data) > 10_000_000:
            raise PublishError("Invalid file mode or unexpectedly large payload.")
        files[rel] = {"data": data, "sha": git_blob_sha(data), "mode": record["mode"]}
    raw = source.read_bytes()
    files[MANIFEST] = {"data": raw, "sha": git_blob_sha(raw), "mode": "100644"}
    if MARKER not in files or "veterinary/data/snapshot.json" not in files:
        raise PublishError("The project identity or the veterinary dataset is missing.")
    return files


def download(url: str, limit: int = 80_000_000) -> bytes:
    if not url.startswith(("https://api.github.com/repos/cli/cli/", "https://github.com/cli/cli/releases/download/")):
        raise PublishError("Refusing a CLI download from an unexpected source.")
    with urlopen(Request(url, headers={"User-Agent": "Important-Contact-Private-Publisher"}), timeout=60) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise PublishError("CLI download exceeded the expected size limit.")
    return data


def find_cli() -> str:
    found = shutil.which("gh")
    if found:
        return found
    for location in ("/opt/homebrew/bin/gh", "/usr/local/bin/gh"):
        if Path(location).is_file():
            return location
    system, machine = platform.system(), platform.machine().lower()
    arch = {"x86_64": "amd64", "amd64": "amd64", "aarch64": "arm64", "arm64": "arm64"}.get(machine)
    if system not in {"Darwin", "Linux"} or not arch:
        raise PublishError("Install the official GitHub CLI (gh) on this computer, then run this publisher again.")
    kind, ext = ("macOS", "zip") if system == "Darwin" else ("linux", "tar.gz")
    asset_name = f"gh_{CLI_VERSION}_{kind}_{arch}.{ext}"
    cache = Path.home() / ".cache" / "important-contact-publisher" / f"gh-{CLI_VERSION}-{system}-{arch}"
    cache.mkdir(parents=True, exist_ok=True, mode=0o700)
    binary = cache / "gh"
    print("Preparing the official GitHub CLI in a local user cache; no system installation or sudo.", flush=True)
    release = json.loads(download(f"https://api.github.com/repos/cli/cli/releases/tags/v{CLI_VERSION}", 2_000_000))
    asset = next((a for a in release.get("assets", []) if a.get("name") == asset_name), None)
    if not asset or not str(asset.get("digest", "")).startswith("sha256:"):
        raise PublishError("The official CLI archive or its SHA-256 digest is unavailable. No download was executed.")
    archive = download(asset["browser_download_url"])
    if "sha256:" + hashlib.sha256(archive).hexdigest() != asset["digest"]:
        raise PublishError("CLI checksum verification failed. The executable will not be run.")
    if ext == "zip":
        with zipfile.ZipFile(io.BytesIO(archive)) as packed:
            targets = [p for p in packed.infolist() if p.filename.endswith("/bin/gh") and not p.is_dir()]
            if len(targets) != 1 or targets[0].file_size > 100_000_000:
                raise PublishError("Unexpected official CLI archive layout.")
            executable = packed.read(targets[0])
    else:
        with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as packed:
            targets = [p for p in packed.getmembers() if p.name.endswith("/bin/gh") and p.isfile()]
            if len(targets) != 1 or targets[0].size > 100_000_000:
                raise PublishError("Unexpected official CLI archive layout.")
            stream = packed.extractfile(targets[0])
            if stream is None:
                raise PublishError("CLI archive executable was not found.")
            executable = stream.read()
    binary.write_bytes(executable)
    binary.chmod(0o700)
    probe = subprocess.run([str(binary), "--version"], capture_output=True, timeout=20)
    if probe.returncode:
        raise PublishError("The official CLI cannot run on this OS version. Install a supported GitHub CLI before publishing.")
    return str(binary)


class GitHubCLI:
    def __init__(self, binary: str):
        self.binary = binary
        self.env = dict(os.environ, GH_HOST="github.com", GH_PAGER="cat")

    def authenticate(self):
        check = subprocess.run([self.binary, "auth", "status", "--hostname", "github.com"],
                               capture_output=True, env=self.env, timeout=30)
        if check.returncode:
            print("Sign in as ArchilJali on GitHub's own page. Never send your password or code in chat.", flush=True)
            result = subprocess.run([self.binary, "auth", "login", "--hostname", "github.com", "--git-protocol", "https",
                                     "--web", "--skip-ssh-key"], env=self.env)
            if result.returncode:
                raise PublishError("GitHub sign-in was not completed. No repository was created.")

    def call(self, method: str, endpoint: str, body=None):
        command = [self.binary, "api", "--hostname", "github.com", "--method", method,
                   "-H", "Accept: application/vnd.github+json", endpoint]
        payload = None
        if body is not None:
            command += ["--input", "-"]
            payload = json.dumps(body)
        result = subprocess.run(command, input=payload, capture_output=True, text=True, env=self.env, timeout=120)
        if result.returncode:
            match = re.search(r"HTTP (\d{3})", result.stderr)
            raise ApiError(int(match.group(1)) if match else 0, method, endpoint)
        return json.loads(result.stdout) if result.stdout.strip() else None


def optional(api, endpoint):
    try:
        return api.call("GET", endpoint)
    except ApiError as error:
        if error.status == 404:
            return None
        raise


def verify_private(metadata):
    if not metadata or metadata.get("private") is not True:
        raise PublishError("Refusing to upload: the target repository is not verified PRIVATE.")
    if metadata.get("full_name", "").lower() != REPOSITORY.lower():
        raise PublishError("The returned repository is not ArchilJali/Important-Contact.")
    if metadata.get("archived") or metadata.get("has_pages"):
        raise PublishError("Refusing an archived repository or one with GitHub Pages enabled.")


def read_json_blob(api, prefix, entry):
    blob = api.call("GET", prefix + "/git/blobs/" + entry["sha"])
    if blob.get("encoding") != "base64":
        raise PublishError("Unexpected remote metadata encoding.")
    return json.loads(base64.b64decode(blob["content"]))


def publish(api, files: dict) -> dict:
    user = api.call("GET", "/user")
    if str(user.get("login", "")).lower() != OWNER.lower():
        raise PublishError("Wrong GitHub account. Sign in as ArchilJali before publishing. No repository changes were made.")
    prefix = "/repos/" + REPOSITORY
    metadata = optional(api, prefix)
    created = metadata is None
    if created:
        print("Creating the separate PRIVATE repository ArchilJali/Important-Contact...", flush=True)
        metadata = api.call("POST", "/user/repos", {
            "name": "Important-Contact", "private": True, "auto_init": True,
            "description": "Private BHOC contact intelligence and veterinary workspace",
            "has_issues": False, "has_wiki": False,
        })
    verify_private(metadata)
    branch = metadata.get("default_branch") or "main"
    head_endpoint = prefix + "/git/ref/heads/" + quote(branch, safe="")
    try:
        head = optional(api, head_endpoint)
    except ApiError as error:
        if error.status != 409:
            raise
        head = None
    if head is None:
        api.call("PUT", prefix + "/contents/" + MARKER, {
            "message": "Initialize private Important Contact workspace",
            "content": base64.b64encode(files[MARKER]["data"]).decode(), "branch": branch,
        })
        head = api.call("GET", head_endpoint)
    base_sha = head["object"]["sha"]
    commit = api.call("GET", prefix + "/git/commits/" + base_sha)
    tree = api.call("GET", prefix + "/git/trees/" + commit["tree"]["sha"] + "?recursive=1")
    if tree.get("truncated"):
        raise PublishError("Remote file listing is truncated. No project content will be uploaded.")
    remote = {r["path"]: r for r in tree["tree"] if r["type"] == "blob"}
    if any(r["path"].startswith(".github/workflows/") for r in tree["tree"]):
        raise PublishError("An existing workflow may act on this upload. Review it first; no project data was uploaded.")
    if MARKER in remote:
        identity = read_json_blob(api, prefix, remote[MARKER])
        if identity.get("project_id") != PROJECT_ID:
            raise PublishError("An unrelated project already exists at this name. Nothing was overwritten.")
    elif set(remote) - {"README.md"}:
        raise PublishError("This repository already has unrecognised content. Nothing was overwritten.")
    previous = {}
    if MANIFEST in remote:
        old = read_json_blob(api, prefix, remote[MANIFEST])
        previous = {f["path"]: f.get("git_blob_sha") for f in old.get("files", [])}
    changes = []
    for name, item in sorted(files.items()):
        prior = remote.get(name)
        if prior and prior["sha"] == item["sha"] and prior.get("mode") == item["mode"]:
            continue
        if prior:
            initial_readme = name == "README.md" and MARKER not in remote and set(remote) <= {"README.md"}
            owned_unchanged = previous.get(name) == prior["sha"]
            # The manifest is an index, not user data, and is regenerated for every package.
            if not initial_readme and not owned_unchanged and name != MANIFEST:
                raise PublishError(f"Remote file differs from this release or was edited: {name}. Refusing to overwrite it.")
        changes.append((name, item))
    if changes:
        verify_private(api.call("GET", prefix))
        entries = []
        for name, item in changes:
            row = {"path": name, "mode": item["mode"], "type": "blob"}
            try:
                row["content"] = item["data"].decode("utf-8")
            except UnicodeDecodeError:
                blob = api.call("POST", prefix + "/git/blobs", {
                    "content": base64.b64encode(item["data"]).decode(), "encoding": "base64"})
                row["sha"] = blob["sha"]
            entries.append(row)
        print(f"Uploading {len(changes)} manifest-checked files to the private repository...", flush=True)
        made_tree = api.call("POST", prefix + "/git/trees", {"base_tree": commit["tree"]["sha"], "tree": entries})
        new_commit = api.call("POST", prefix + "/git/commits", {
            "message": "Add private Important Contact veterinary workspace and persistent access",
            "tree": made_tree["sha"], "parents": [base_sha]})
        verify_private(api.call("GET", prefix))
        fresh_head = api.call("GET", head_endpoint)
        if fresh_head["object"]["sha"] != base_sha:
            raise PublishError("Another commit arrived during upload. The branch was not overwritten; reconcile it before retrying.")
        api.call("PATCH", prefix + "/git/refs/heads/" + quote(branch, safe=""),
                 {"sha": new_commit["sha"], "force": False})
        expected_sha, expected_tree = new_commit["sha"], made_tree["sha"]
    else:
        expected_sha, expected_tree = base_sha, commit["tree"]["sha"]
    verify_private(api.call("GET", prefix))
    final_ref = api.call("GET", head_endpoint)
    if final_ref["object"]["sha"] != expected_sha:
        raise PublishError("The branch moved after publication. Inspect GitHub before treating this upload as verified.")
    final_tree = api.call("GET", prefix + "/git/trees/" + expected_tree + "?recursive=1")
    final = {r["path"]: r for r in final_tree["tree"] if r["type"] == "blob"}
    if final_tree.get("truncated") or any(
        p not in final or final[p]["sha"] != v["sha"] or final[p]["mode"] != v["mode"] for p, v in files.items()
    ):
        raise PublishError("Remote content verification failed. Do not treat the upload as completed.")
    return {"status": "verified", "repository": REPOSITORY, "private": True, "branch": branch,
            "commit": expected_sha, "files_verified": len(files), "created_repository": created,
            "verified_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "veterinary_url": f"https://github.com/{REPOSITORY}/tree/{quote(branch, safe='')}/veterinary",
            "web_application_deployed": False, "scheduler_activated": False, "invitations_sent": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-only", action="store_true", help="Validate the local manifest only; no network, authentication or writes.")
    args = parser.parse_args()
    if sys.version_info < (3, 9):
        raise PublishError("Python 3.9 or later is required for the publisher.")
    files = load_payload(ROOT)
    print(f"Local package verified: {len(files)} files; target {REPOSITORY}; PRIVATE only.", flush=True)
    if args.check_only:
        return
    client = GitHubCLI(find_cli())
    client.authenticate()
    result = publish(client, files)
    (ROOT / "PUBLISH-RESULT.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("VERIFIED PRIVATE UPLOAD", flush=True)
    print("Commit:", result["commit"])
    print(result["veterinary_url"])
    print("This uploads the repository only. The web application, email access and research scheduler are not deployed.")
    webbrowser.open(result["veterinary_url"])


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Publication interrupted. No forced update was performed.", file=sys.stderr)
        sys.exit(130)
    except (PublishError, OSError, ValueError, subprocess.SubprocessError) as error:
        print("STOPPED:", str(error), file=sys.stderr)
        print("No success has been claimed. Fix the reported condition before retrying.", file=sys.stderr)
        sys.exit(1)
