#!/usr/bin/env bash
set -Eeuo pipefail

# Chạy từ Git Bash trên Windows; thư mục dự án có thể có dấu và khoảng trắng.
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
node_dir="$repo_dir/.tools/node-v22.23.3-win-x64"
if [[ -f "$node_dir/node.exe" ]]; then
  export PATH="$(cygpath -u "$node_dir"):$PATH"
fi

usage() {
  cat <<'HELP'
Cách dùng: ./scripts/lams.sh <lệnh>
doctor | setup | bootstrap | smoke | seed-demo | core | insight | desktop | web
quality | e2e | desktop-e2e | build-desktop | stop
Các lệnh core, insight, desktop và web chạy ở foreground; Ctrl+C sẽ dừng lệnh đó.
HELP
}

if [[ $# -ne 1 ]]; then usage; exit 2; fi
command_name="$1"

port_busy() { (echo >/dev/tcp/127.0.0.1/"$1") >/dev/null 2>&1; }
require_free_port() {
  if port_busy "$1"; then
    printf 'Cổng %s đang được sử dụng; kiểm tra service đang chạy trước khi mở thêm.\n' "$1" >&2
    exit 1
  fi
}

run_ps() {
  local script_name="$1"
  shift
  if ! command -v pwsh.exe >/dev/null 2>&1; then
    printf 'Không tìm thấy PowerShell 7 (pwsh.exe).\n' >&2
    exit 1
  fi
  # Tắt chuyển đường dẫn tự động của MSYS; -File nhận đường dẫn Windows từ cygpath.
  export MSYS_NO_PATHCONV=1
  exec pwsh.exe -NoLogo -NoProfile -File "$(cygpath -w "$repo_dir/scripts/$script_name")" "$@"
}

case "$command_name" in
  doctor) run_ps doctor.ps1 ;;
  setup) run_ps setup-desktop.ps1 ;;
  bootstrap) run_ps bootstrap-local.ps1 ;;
  smoke) run_ps smoke-test.ps1 ;;
  seed-demo) run_ps seed-demo-catalog.ps1 ;;
  core) require_free_port 8080; run_ps start-core.ps1 ;;
  insight) require_free_port 3000; run_ps start-insight.ps1 ;;
  desktop) run_ps start-desktop.ps1 ;;
  web)
    require_free_port 5173
    if ! command -v npm.cmd >/dev/null 2>&1; then
      printf 'Không tìm thấy npm; chạy setup trước.\n' >&2
      exit 1
    fi
    cd -- "$repo_dir/frontend"
    exec npm.cmd run dev -- --host 127.0.0.1
    ;;
  quality) run_ps check-quality.ps1 ;;
  e2e) run_ps test-phase1-e2e.ps1 ;;
  desktop-e2e) run_ps test-phase1-e2e.ps1 -Desktop ;;
  build-desktop) run_ps build-desktop.ps1 ;;
  stop) run_ps stop-infra.ps1 ;;
  *) usage; exit 2 ;;
esac
