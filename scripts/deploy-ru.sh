#!/usr/bin/env bash
#
# deploy-ru.sh — .ru 프론트(Vite) 빌드 후 얀덱스 VM(/var/www/semo-ru)에 배포
# npm run ship 마지막 단계에서 자동 호출. 단독: npm run deploy:ru
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=deploy-ru.config.sh
source "$(dirname "$0")/deploy-ru.config.sh"
YANDEX_ENV_FILE="$(cd "$(dirname "$YANDEX_ENV_FILE")" 2>/dev/null && pwd)/$(basename "$YANDEX_ENV_FILE")"

load_dotenv_var() {
  local key="$1"
  local file="$ROOT/.env"
  [[ -f "$file" ]] || return 0
  local line
  line="$(grep -E "^${key}=" "$file" | tail -1 || true)"
  [[ -n "$line" ]] || return 0
  printf '%s' "${line#*=}" | sed "s/^['\"]//;s/['\"]$//"
}

if [[ ! -f "$YANDEX_ENV_FILE" ]]; then
  echo "ERROR: YANDEX_ENV_FILE 없음: $YANDEX_ENV_FILE" >&2
  echo "  → 얀덱스/env.backup 경로 확인 또는 YANDEX_ENV_FILE 환경변수 설정" >&2
  exit 1
fi

ANON_KEY="$(grep -E '^ANON_KEY=' "$YANDEX_ENV_FILE" | cut -d= -f2- | tr -d '\r\n')"
if [[ -z "$ANON_KEY" ]]; then
  echo "ERROR: $YANDEX_ENV_FILE 에 ANON_KEY 없음" >&2
  exit 1
fi

# .env 에 있으면 공유 키도 가져옴 (피부 API, 지도, 텔레그램 등)
for key in VITE_SKIN_API_URL VITE_SKIN_API_KEY VITE_GOOGLE_MAPS_API_KEY VITE_TELEGRAM_BOT_USERNAME; do
  val="$(load_dotenv_var "$key")"
  if [[ -n "$val" ]]; then
    export "$key=$val"
  fi
done

export VITE_SUPABASE_URL VITE_SITE_REGION VITE_CROSS_REGION_NOTICE
export VITE_YANDEX_REDIRECT_URI VITE_YANDEX_CLIENT_ID
export VITE_SUPABASE_ANON_KEY="$ANON_KEY"

echo "==> [.ru] Vite build (region=$VITE_SITE_REGION, api=$VITE_SUPABASE_URL)"
cd "$ROOT"
npm run build

TAR="/tmp/semo-ru-dist-$$.tgz"
tar czf "$TAR" -C dist .
echo "    dist → $TAR ($(du -h "$TAR" | cut -f1))"

SSH=(ssh -i "$SSH_KEY" -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new)
SCP=(scp -i "$SSH_KEY" -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new)

echo "==> [.ru] upload → $VM_USER@$VM_IP:$REMOTE_DIR"
"${SCP[@]}" "$TAR" "$VM_USER@$VM_IP:/tmp/semo-ru-dist.tgz"

"${SSH[@]}" "$VM_USER@$VM_IP" "set -e
  sudo rm -rf ${REMOTE_DIR}/*
  sudo tar xzf /tmp/semo-ru-dist.tgz -C ${REMOTE_DIR} 2>/dev/null || sudo tar xzf /tmp/semo-ru-dist.tgz -C ${REMOTE_DIR}
  sudo chown -R caddy:caddy ${REMOTE_DIR}
  rm -f /tmp/semo-ru-dist.tgz
  echo deployed_js=\$(ls ${REMOTE_DIR}/assets/index-*.js | tail -1)
"

rm -f "$TAR"
echo "✅ .ru 배포 완료 → https://semo-box.ru"
