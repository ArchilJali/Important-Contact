#!/bin/bash
# Publishes only this private project through your own GitHub browser sign-in.
set -u
cd "$(dirname "$0")" || exit 1
printf '\nImportant Contact | Private GitHub publication\n\n'
printf 'Target: ArchilJali/Important-Contact, PRIVATE, veterinary/\n'
printf 'No public site, email invitations or scheduled jobs will be created.\n\n'
PYTHON=''
for candidate in python3 /opt/homebrew/bin/python3 /usr/local/bin/python3; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3,9) else 1)' >/dev/null 2>&1; then
    PYTHON="$candidate"
    break
  fi
done
if [ -z "$PYTHON" ]; then
  printf 'Python 3.9 or newer is required. Install Python from python.org, then run this file again.\n'
  printf 'Nothing has been uploaded.\n'
  read -r -p 'Press Enter to close.' _
  exit 1
fi
"$PYTHON" scripts/publish_github.py
result=$?
printf '\n'
read -r -p 'Press Enter to close.' _
exit "$result"
