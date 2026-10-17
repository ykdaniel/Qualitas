#!/bin/sh
# Run the full backend suite on Python 3.11 (the production runtime, backend/Dockerfile python:3.11-slim)
# against a tree on disk, without touching it.
# Usage: sh docs/workflow/py311-full-suite.sh <repo-or-worktree-root> <output-file>
# The tree must have backend/ and react-app/; tests use their own throwaway DB (tests/conftest).
# The tree is first copied (minus node_modules/dist) into a staging dir under $HOME, because Docker Desktop
# cannot see /private/tmp or /var/folders paths (scratchpad worktrees) and would mount them as empty dirs.
set -u
ROOT=$(cd "$1" && pwd); OUT=$2
if [ ! -f "$ROOT/backend/requirements.txt" ] || [ ! -d "$ROOT/backend/tests" ]; then
  echo "py311-full-suite: $ROOT has no backend/requirements.txt or backend/tests" >&2; exit 2
fi
HEAD=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null)
STAGE=$(mktemp -d "$HOME/.qualitas-py311.XXXXXX") || exit 2
trap 'rm -rf "$STAGE"' EXIT
( cd "$ROOT" && tar cf - --exclude=./react-app/node_modules --exclude=./react-app/dist --exclude='__pycache__' backend react-app ) \
  | ( cd "$STAGE" && tar xf - ) || { echo "py311-full-suite: staging copy failed" >&2; exit 2; }
{ echo "# start $(date -u +%FT%TZ) tree=$ROOT head=$HEAD staged=$STAGE"
  docker run --rm -v "$STAGE:/s:ro" -e PYTHONDONTWRITEBYTECODE=1 python:3.11-slim sh -c '
    set -u; mkdir /q; cp -a /s/backend /q/backend; cp -a /s/react-app /q/react-app; cd /q/backend
    test -f requirements.txt || { echo "pip_exit=NO_REQUIREMENTS (empty mount?)"; exit 3; }
    python --version
    pip install -q --disable-pip-version-check -r requirements.txt -r requirements-dev.txt >/tmp/pip.log 2>&1; rc=$?; echo pip_exit=$rc
    [ $rc -eq 0 ] || { tail -n 20 /tmp/pip.log; exit 4; }
    python -m pytest -q -p no:cacheprovider -rfE tests; echo pytest_exit=$?'
  echo "# end $(date -u +%FT%TZ)"; } > "$OUT" 2>&1
tail -n 3 "$OUT"
grep -q '^pytest_exit=0$' "$OUT"
