# .ru(Yandex VM) 프론트 배포 설정 — 비밀 아닌 기본값 (커밋 OK)
_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
YANDEX_ENV_FILE="${YANDEX_ENV_FILE:-${_SCRIPT_DIR}/../../../얀덱스/env.backup}"

VM_IP="${VM_IP:-51.250.25.251}"
VM_USER="${VM_USER:-ubuntu}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/semo-ru}"

VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-https://api.semo-box.ru}"
VITE_SITE_REGION=ru
VITE_CROSS_REGION_NOTICE=off
VITE_YANDEX_REDIRECT_URI="${VITE_YANDEX_REDIRECT_URI:-https://semo-box.ru/auth/yandex/callback}"
VITE_YANDEX_CLIENT_ID="${VITE_YANDEX_CLIENT_ID:-e8ef57f3e98c4b77aca212e009988eb4}"
