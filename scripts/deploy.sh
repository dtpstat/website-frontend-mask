#!/bin/sh
# Build and deploy using targets from .env.
# Do not source .env as shell code: Node parses it as dotenv.
set -eu
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then
  echo "Missing .env; copy .env.example and set deployment targets" >&2
  exit 1
fi
exec node --env-file=.env scripts/deploy.mjs
