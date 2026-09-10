#!/usr/bin/env python3
"""Fail when private relationship or staging data enters the public repository."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN_KEYS = {
    "personal_connection",
    "linkedin_relationship",
    "follows_archil",
    "follows_bhoc",
    "bhoc_active_contact",
    "relationship_status",
    "internal_priority",
    "outreach_state",
    "previous_bhoc_oxyglobin_hboc_relationship",
    "priority",
}
FORBIDDEN_PATHS = {
    "wildlife-red-book/pending-review.json",
}
FORBIDDEN_SUFFIXES = {".db", ".sqlite", ".sqlite3", ".env"}
ERRORS: list[str] = []
ALLOWED_SITE_FILES = {
    "contacts-v7-core.js",
    "contacts-v7-data.js",
    "contacts-v7-ui.js",
    "contacts-v7.css",
    "contacts-v7.html",
    "directory-counts.js",
    "human-medicine.html",
    "version.txt",
    "wildlife-red-book.html",
    "wildlife-red-book.js",
}
FORBIDDEN_UI_MARKERS = {
    "follows_archil",
    "follows_bhoc",
    "personal_connection",
    "linkedin_relationship",
    "previous_bhoc_oxyglobin_hboc_relationship",
    "important-contact:relationship",
    "important-contact:linkedin-follow-signals",
    "important-contact:linkedin-connection-signals",
    "important-contact:wildlife-red-book:relationship",
}


def walk_json(value: object, relative: Path, trail: str = "$") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if key in FORBIDDEN_KEYS:
                ERRORS.append(f"{relative}: prohibited key {key!r} at {trail}")
            walk_json(child, relative, f"{trail}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            walk_json(child, relative, f"{trail}[{index}]")


def main() -> int:
    site = ROOT / "site"
    if site.exists():
        site_files = {
            str(path.relative_to(site))
            for path in site.rglob("*")
            if path.is_file()
        }
        unexpected = sorted(site_files - ALLOWED_SITE_FILES)
        if unexpected:
            ERRORS.append(f"site/: unexpected public UI files: {', '.join(unexpected)}")

    for relative_name in FORBIDDEN_PATHS:
        if (ROOT / relative_name).exists():
            ERRORS.append(f"{relative_name}: private staging file must not be public")

    for path in ROOT.rglob("*"):
        if not path.is_file() or ".git" in path.parts:
            continue
        relative = path.relative_to(ROOT)
        if path.suffix.lower() in FORBIDDEN_SUFFIXES or path.name.startswith(".env"):
            ERRORS.append(f"{relative}: prohibited private-data file type")
        if path.suffix.lower() == ".json":
            try:
                value = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                ERRORS.append(f"{relative}: invalid JSON: {exc}")
                continue
            walk_json(value, relative)

    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    if "Disallow: /" not in robots:
        ERRORS.append("robots.txt: expected a site-wide crawl disallow rule")

    index = (ROOT / "index.html").read_text(encoding="utf-8").lower()
    if "noindex" not in index:
        ERRORS.append("index.html: temporary public directory must remain noindex")

    public_ui_files = [ROOT / "index.html"]
    if site.exists():
        public_ui_files.extend(path for path in site.rglob("*") if path.is_file())
    public_ui_text = "\n".join(
        path.read_text(encoding="utf-8", errors="replace").lower()
        for path in public_ui_files
        if path.suffix.lower() in {".html", ".js", ".css", ".txt"}
    )
    for marker in sorted(FORBIDDEN_UI_MARKERS):
        if marker in public_ui_text:
            ERRORS.append(f"public UI: prohibited private-state marker {marker!r}")
    if re.search(r"<script[^>]+src=[\"']https?://", public_ui_text):
        ERRORS.append("public UI: external script source is not permitted")

    if ERRORS:
        print("Public-safety validation failed:", file=sys.stderr)
        for error in ERRORS:
            print(f"- {error}", file=sys.stderr)
        return 1

    json_count = sum(1 for path in ROOT.rglob("*.json") if ".git" not in path.parts)
    print(f"Validated {json_count} JSON files and the temporary read-only public boundary.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
