#!/usr/bin/env bash
# Package the WordPress plugin into the publicly served zip.
#
# Run from the repo root after any change under wordpress/topezia-chat/:
#   bash scripts/build-wp-plugin.sh
#
# The zip is committed (small, and it lets /employer/widget link a download
# with no build step on deploy). Bump the Version header + Stable tag first.
set -euo pipefail
cd "$(dirname "$0")/.."

if command -v php >/dev/null 2>&1; then
  for f in wordpress/topezia-chat/*.php; do php -l "$f"; done
else
  echo "php not on PATH — skipping syntax lint"
fi

mkdir -p public/downloads
rm -f public/downloads/topezia-chat.zip
(cd wordpress && zip -r -X ../public/downloads/topezia-chat.zip topezia-chat -x "*.DS_Store")
echo "Built public/downloads/topezia-chat.zip"
