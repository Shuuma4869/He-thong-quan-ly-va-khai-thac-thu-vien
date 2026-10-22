#!/usr/bin/env bash
# Linux CI: cùng suite Playwright với Windows, database tạm riêng từng lượt.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(node --version)" == v22.* ]] || { echo 'Cần Node 22'; exit 1; }
docker info >/dev/null
run_id=$(node -e 'console.log(crypto.randomUUID())')
export LAMS_E2E_CONTAINER="lams-phase1-e2e-$run_id" LAMS_E2E_OWNER="$run_id"
export POSTGRES_PASSWORD=$(node -e 'console.log(crypto.randomUUID())')
export LAMS_JWT_SECRET=$(node -e 'console.log(crypto.randomBytes(48).toString("hex"))')
export CORE_DATABASE_USERNAME=lams CORE_DATABASE_PASSWORD="$POSTGRES_PASSWORD"
export CORE_PORT=18081 INSIGHT_PORT=13001 AUTH_COOKIE_SECURE=false
export CORE_API_URL=http://127.0.0.1:18081/api/v1
export VITE_CORE_API_URL="$CORE_API_URL" LAMS_E2E_CORE_URL="$CORE_API_URL"
export VITE_INSIGHT_API_URL=http://127.0.0.1:13001/api/v1
export LAMS_E2E_INSIGHT_URL="$VITE_INSIGHT_API_URL"
export LAMS_E2E_FRONTEND_URL=http://127.0.0.1:15174
export FRONTEND_ORIGIN="$LAMS_E2E_FRONTEND_URL" CORS_ALLOWED_ORIGINS="$LAMS_E2E_FRONTEND_URL"
export GOOGLE_BOOKS_ENABLED=false GOOGLE_BOOKS_API_KEY='' LAMS_E2E_DESKTOP_CDP=''
mkdir -p backend/core-service/target/e2e-ci
pids=()
created=false
cleanup() {
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  if [[ "$created" == true ]] && [[ "$(docker inspect --format '{{index .Config.Labels "lams.phase1-e2e"}}' "$LAMS_E2E_CONTAINER" 2>/dev/null)" == "$run_id" ]]; then
    docker rm -f "$LAMS_E2E_CONTAINER" >/dev/null
  fi
}
trap cleanup EXIT
docker run -d --name "$LAMS_E2E_CONTAINER" --label "lams.phase1-e2e=$run_id" \
  -e POSTGRES_USER=lams -e POSTGRES_PASSWORD -e POSTGRES_DB=lams_core \
  -p 127.0.0.1::5432 postgres:17.6-alpine >/dev/null
created=true
binding=$(docker port "$LAMS_E2E_CONTAINER" 5432/tcp)
[[ "$binding" =~ ^127\.0\.0\.1:([0-9]+)$ ]] || exit 1
db_port="${BASH_REMATCH[1]}"
export CORE_DATABASE_URL="jdbc:postgresql://127.0.0.1:$db_port/lams_core"
export INSIGHT_DATABASE_URL="postgresql://lams:$POSTGRES_PASSWORD@127.0.0.1:$db_port/lams_insight_test"
ready=false
for attempt in {1..40}; do
  if docker exec "$LAMS_E2E_CONTAINER" pg_isready -U lams >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || exit 1
docker exec "$LAMS_E2E_CONTAINER" createdb -U lams lams_insight_test
# Regression Maven chạy đầy đủ ở job core; đây chỉ là đóng gói server cho E2E.
(cd backend/core-service && ./mvnw -B -DskipTests package)
(cd backend/insight-service && npm run prisma:generate && npm run prisma:deploy && npm run build)
java -jar backend/core-service/target/core-service-0.1.0-SNAPSHOT.jar >backend/core-service/target/e2e-ci/core.log 2>&1 &
pids+=("$!")
node backend/insight-service/dist/main.js >backend/core-service/target/e2e-ci/insight.log 2>&1 &
pids+=("$!")
(cd frontend && exec node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 15174 --strictPort) >backend/core-service/target/e2e-ci/frontend.log 2>&1 &
pids+=("$!")
wait_http() {
  for attempt in {1..90}; do
    if curl --silent --fail --max-time 2 "$1" >/dev/null; then return; fi
    sleep 1
  done
  echo "Dịch vụ E2E chưa sẵn sàng: $1"; return 1
}
wait_http "$CORE_API_URL/health"
wait_http "$VITE_INSIGHT_API_URL/health"
wait_http "$LAMS_E2E_FRONTEND_URL/"
(cd frontend && npm run test:e2e)
