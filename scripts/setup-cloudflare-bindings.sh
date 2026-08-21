#!/usr/bin/env bash
# One-shot Cloudflare Pages bindings setup for ethanblog.
#
# Prerequisites:
#   export CLOUDFLARE_API_TOKEN=...   # Pages + D1 + KV edit permissions
#   export CLOUDFLARE_ACCOUNT_ID=...
#
# OAuth secrets file (pick one):
#   SECRETS_FILE=.env.production  (default)
#   or copy .dev.vars.example → .dev.vars and set SECRETS_FILE=.dev.vars
#
# Usage:
#   cp .dev.vars.example .env.production   # fill values
#   npm run setup:cloudflare
#
set -euo pipefail

PROJECT_NAME="${PAGES_PROJECT_NAME:-ethanblog}"
SECRETS_FILE="${SECRETS_FILE:-.env.production}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

require_env() {
  if [ -z "${!1:-}" ]; then
    echo "Missing required env var: $1" >&2
    exit 1
  fi
}

require_env CLOUDFLARE_API_TOKEN
require_env CLOUDFLARE_ACCOUNT_ID

cd "$ROOT"

echo "==> Step 1/2: Ensure D1 (DB) + SESSION KV bindings in wrangler.toml"
bash scripts/ensure-d1.sh

if [ ! -f "$SECRETS_FILE" ]; then
  echo ""
  echo "OAuth secrets file not found: $SECRETS_FILE" >&2
  echo "Copy .dev.vars.example → $SECRETS_FILE, fill in values, then re-run." >&2
  exit 1
fi

missing=()
for key in BETTER_AUTH_SECRET GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do
  if ! grep -qE "^${key}=.+$" "$SECRETS_FILE"; then
    missing+=("$key")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "Missing or empty keys in $SECRETS_FILE:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo ""
echo "==> Step 2/2: Upload OAuth secrets to Pages project: $PROJECT_NAME"
npx wrangler pages secret bulk "$SECRETS_FILE" --project-name="$PROJECT_NAME"

echo ""
echo "Done. Bindings configured:"
echo "  - D1 DB (binding: DB) — see database_id in wrangler.toml"
echo "  - KV SESSION — see [[kv_namespaces]] in wrangler.toml"
echo "  - OAuth secrets uploaded to Pages ($PROJECT_NAME)"
echo "  - Guestbook mail: deploy workers/guestbook, then Pages [[services]] GUESTBOOK"
echo ""
echo "Next: commit wrangler.toml if database_id / kv id changed, then redeploy."
echo "  npm run deploy"
