#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
project_dir="$(dirname "$script_dir")"
env_file="${SINGLE_SERVER_ENV_FILE:-$script_dir/single-server.env}"

cd "$project_dir"
docker compose \
  --env-file "$env_file" \
  -f compose.single-server.yaml \
  --profile backup \
  run --rm backup

docker image prune --force --filter "until=168h"
docker builder prune --force --filter "until=168h"

used_percent="$(df -P "$project_dir" | awk 'NR == 2 { gsub("%", "", $5); print $5 }')"
if [ "$used_percent" -ge 80 ]; then
  echo "Disk usage is ${used_percent}%, manual cleanup is required" >&2
  exit 1
fi

echo "Backup completed; disk usage is ${used_percent}%"
