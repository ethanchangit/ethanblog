#!/usr/bin/env bash
# Ensure remote Cloudflare bindings exist before Pages deploy.
# - D1 database ethanblog (auth / bookmarks / progress)
# - KV namespace SESSION (Astro adapter session storage)
set -euo pipefail

DB_NAME="ethanblog"
KV_TITLE="SESSION"
KV_BINDING="SESSION"
WRANGLER_CONFIG="${WRANGLER_CONFIG:-wrangler.toml}"

require_env() {
  if [ -z "${!1:-}" ]; then
    echo "Missing required env var: $1" >&2
    exit 1
  fi
}

require_env CLOUDFLARE_API_TOKEN
require_env CLOUDFLARE_ACCOUNT_ID

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

patch_toml_value() {
  local key="$1"
  local value="$2"
  sed -i "s/^${key} = .*/${key} = \"${value}\"/" "$WRANGLER_CONFIG"
}

ensure_d1() {
  local db_id
  db_id="$(npx wrangler d1 list --json | jq -r ".[] | select(.name==\"$DB_NAME\") | .uuid" | head -1)"

  if [ -z "$db_id" ] || [ "$db_id" = "null" ]; then
    echo "Creating D1 database: $DB_NAME"
    npx wrangler d1 create "$DB_NAME"
    db_id="$(npx wrangler d1 list --json | jq -r ".[] | select(.name==\"$DB_NAME\") | .uuid" | head -1)"
  fi

  if [ -z "$db_id" ] || [ "$db_id" = "null" ]; then
    echo "Failed to resolve D1 database ID for $DB_NAME" >&2
    exit 1
  fi

  echo "Using D1 database ID: $db_id"
  patch_toml_value database_id "$db_id"

  echo "Applying remote D1 migrations..."
  npx wrangler d1 migrations apply "$DB_NAME" --remote
}

ensure_session_kv() {
  local kv_id
  kv_id="$(npx wrangler kv namespace list | jq -r ".[] | select(.title==\"$KV_TITLE\") | .id" | head -1)"

  if [ -z "$kv_id" ] || [ "$kv_id" = "null" ]; then
    echo "Creating KV namespace: $KV_TITLE"
    local create_output
    create_output="$(npx wrangler kv namespace create "$KV_TITLE")"
    echo "$create_output"
    kv_id="$(echo "$create_output" | sed -n 's/.*id = "\([^"]*\)".*/\1/p' | head -1)"
    if [ -z "$kv_id" ]; then
      kv_id="$(npx wrangler kv namespace list | jq -r ".[] | select(.title==\"$KV_TITLE\") | .id" | head -1)"
    fi
  fi

  if [ -z "$kv_id" ] || [ "$kv_id" = "null" ]; then
    echo "Failed to resolve KV namespace ID for $KV_TITLE" >&2
    exit 1
  fi

  echo "Using KV namespace ID: $kv_id"

  if grep -q '^\[\[kv_namespaces\]\]' "$WRANGLER_CONFIG"; then
    patch_toml_value id "$kv_id"
  else
    cat >>"$WRANGLER_CONFIG" <<EOF

[[kv_namespaces]]
binding = "$KV_BINDING"
id = "$kv_id"
EOF
  fi
}

if ! grep -q '^database_id = ' "$WRANGLER_CONFIG"; then
  echo "database_id not found in $WRANGLER_CONFIG" >&2
  exit 1
fi

ensure_d1
ensure_session_kv
