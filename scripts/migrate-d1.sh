#!/usr/bin/env bash
# Apply D1 migrations locally or to production.
# Usage:
#   ./scripts/migrate-d1.sh local
#   ./scripts/migrate-d1.sh remote
set -euo pipefail
TARGET="${1:-local}"
wrangler d1 migrations apply ethanblog "--${TARGET}"
