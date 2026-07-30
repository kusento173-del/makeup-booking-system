#!/usr/bin/env sh
set -eu

action="${1:-renew}"
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
project_dir="$(dirname "$script_dir")"
env_file="${SINGLE_SERVER_ENV_FILE:-$script_dir/single-server.env}"

test -f "$env_file" || {
  echo "Missing environment file: $env_file" >&2
  exit 1
}

set -a
. "$env_file"
set +a

: "${PUBLIC_IP:?PUBLIC_IP is required}"
: "${CERTBOT_EMAIL:?CERTBOT_EMAIL is required}"

acme_dir="$script_dir/acme-webroot"
letsencrypt_dir="$script_dir/letsencrypt"
tls_dir="$script_dir/tls"
mkdir -p "$acme_dir" "$letsencrypt_dir" "$tls_dir"

certbot() {
  docker run --rm \
    --user "$(id -u):$(id -g)" \
    --volume "$acme_dir:/var/www/certbot" \
    --volume "$letsencrypt_dir:/etc/letsencrypt" \
    certbot/certbot:v5.4.0 \
    --work-dir /tmp/certbot-work \
    --logs-dir /tmp/certbot-logs \
    "$@"
}

case "$action" in
  issue)
    certbot certonly \
      --non-interactive \
      --agree-tos \
      --email "$CERTBOT_EMAIL" \
      --preferred-profile shortlived \
      --webroot \
      --webroot-path /var/www/certbot \
      --ip-address "$PUBLIC_IP"
    ;;
  renew)
    certbot renew --non-interactive
    ;;
  *)
    echo "Usage: $0 issue|renew" >&2
    exit 1
    ;;
esac

live_dir="$letsencrypt_dir/live/$PUBLIC_IP"
test -f "$live_dir/fullchain.pem" && test -f "$live_dir/privkey.pem" || {
  echo "Certificate files were not produced for $PUBLIC_IP" >&2
  exit 1
}

certificate_changed=false
if ! cmp -s "$live_dir/fullchain.pem" "$tls_dir/fullchain.pem" ||
  ! cmp -s "$live_dir/privkey.pem" "$tls_dir/privkey.pem"; then
  certificate_changed=true
fi

if [ "$certificate_changed" = false ]; then
  echo "Certificate is unchanged; gateway reload skipped for $PUBLIC_IP"
  exit 0
fi

cp -L "$live_dir/fullchain.pem" "$tls_dir/fullchain.pem"
cp -L "$live_dir/privkey.pem" "$tls_dir/privkey.pem"
chmod 600 "$tls_dir/privkey.pem"

cd "$project_dir"
docker compose \
  --env-file "$env_file" \
  -f compose.single-server.yaml \
  up --detach --no-deps --build gateway

echo "IP certificate installed and gateway reloaded for $PUBLIC_IP"
