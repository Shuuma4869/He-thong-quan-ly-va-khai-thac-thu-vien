#!/usr/bin/env bash
# Linux CI: cùng suite Playwright với Windows, database tạm riêng từng lượt.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(node --version)" == v22.* ]] || { echo 'Cần Node 22'; exit 1; }
docker info >/dev/null
run_id=$(node -e 'console.log(crypto.randomUUID())')
export LAMS_E2E_CONTAINER="lams-phase1-e2e-$run_id" LAMS_E2E_OWNER="$run_id"
KAFKA_CONTAINER="lams-phase1-e2e-kafka-$run_id"
KAFKA_HOST_PORT=$(node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')
export KAFKA_BOOTSTRAP_SERVERS="localhost:$KAFKA_HOST_PORT"
export POSTGRES_PASSWORD=$(node -e 'console.log(crypto.randomUUID())')
export LAMS_JWT_SECRET=$(node -e 'console.log(crypto.randomBytes(48).toString("hex"))')
export OUTBOX_ENABLED=true OUTBOX_JOB_ENABLED=true
export NOTIFICATIONS_ENABLED=true NOTIFICATIONS_GROUP_ID="lams-phase1-e2e-$run_id"
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
kafka_created=false
cleanup() {
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  if [[ "$created" == true ]] && [[ "$(docker inspect --format '{{index .Config.Labels "lams.phase1-e2e"}}' "$LAMS_E2E_CONTAINER" 2>/dev/null)" == "$run_id" ]]; then
    docker rm -f -v "$LAMS_E2E_CONTAINER" >/dev/null
  fi
  if [[ "$kafka_created" == true ]] && [[ "$(docker inspect --format '{{index .Config.Labels "lams.phase1-e2e"}}' "$KAFKA_CONTAINER" 2>/dev/null)" == "$run_id" ]]; then
    docker rm -f -v "$KAFKA_CONTAINER" >/dev/null
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
  # Initdb's temporary server accepts Unix sockets before the final TCP server starts.
  if MSYS_NO_PATHCONV=1 docker exec "$LAMS_E2E_CONTAINER" pg_isready -h 127.0.0.1 -U lams -d lams_core >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || exit 1
docker run -d --name "$KAFKA_CONTAINER" --label "lams.phase1-e2e=$run_id" \
  -p "127.0.0.1:$KAFKA_HOST_PORT:19092" \
  -e KAFKA_NODE_ID=1 -e KAFKA_PROCESS_ROLES=broker,controller \
  -e KAFKA_LISTENERS=INTERNAL://:29092,EXTERNAL://:19092,CONTROLLER://:29093 \
  -e KAFKA_ADVERTISED_LISTENERS="INTERNAL://localhost:29092,EXTERNAL://localhost:$KAFKA_HOST_PORT" \
  -e KAFKA_INTER_BROKER_LISTENER_NAME=INTERNAL -e KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER \
  -e KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,INTERNAL:PLAINTEXT,EXTERNAL:PLAINTEXT \
  -e KAFKA_CONTROLLER_QUORUM_VOTERS=1@localhost:29093 \
  -e KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1 -e KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=1 \
  -e KAFKA_TRANSACTION_STATE_LOG_MIN_ISR=1 -e KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS=0 \
  -e CLUSTER_ID=MkU3OEVBNTcwNTJENDM2Qk apache/kafka:4.1.2 >/dev/null
kafka_created=true
kafka_ready=false
for attempt in {1..60}; do
  if MSYS_NO_PATHCONV=1 docker exec "$KAFKA_CONTAINER" /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:29092 --list >/dev/null 2>&1; then
    kafka_ready=true; break
  fi
  sleep 1
done
if [[ "$kafka_ready" != true ]]; then
  docker logs --tail 80 "$KAFKA_CONTAINER" >&2 || true
  echo 'Kafka E2E chưa sẵn sàng'; exit 1
fi
for topic in lams.circulation.events.v1 lams.hold.events.v1; do
  docker exec "$KAFKA_CONTAINER" /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:29092 \
    --create --if-not-exists --topic "$topic" --partitions 1 --replication-factor 1 >/dev/null
done
MSYS_NO_PATHCONV=1 docker exec "$LAMS_E2E_CONTAINER" createdb -U lams lams_insight_test
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
notification_ready=false
for attempt in {1..60}; do
  if curl --silent --fail --max-time 2 "$VITE_INSIGHT_API_URL/health" |
      node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.exit(JSON.parse(s).notifications?.connected===true?0:1)}catch{process.exit(1)}})'; then
    notification_ready=true; break
  fi
  sleep 1
done
[[ "$notification_ready" == true ]] || { echo 'Insight notifications consumer chưa kết nối Kafka'; exit 1; }
(cd frontend && npm run test:e2e)
