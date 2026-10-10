#!/bin/bash
# DEPLOY-EXEC-2026-001 backend precheck r2 — local self-test harness (Colima mock, unique resource names)
set -u
S=$(cd "$(dirname "$0")" && pwd)  # r3 R4 real-docker subset
SCRIPT=/Users/nook/Documents/Qualitas/docs/workflow/DEPLOY-EXEC-2026-001-backend-precheck.sh
REAL_DOCKER=$(command -v docker)
DH=$(docker context inspect -f '{{.Endpoints.docker.Host}}')
export DOCKER_HOST="$DH"
NET=qbr3-selftest_net
CTR=qbr3-selftest
IMG=qbr3test-backend
SECRETS='SECRETCMD111|ENTSECRET222|ENVSECRET333|BUILDARGSECRET444|CTXSECRET555|ERRSECRET666|INLINESECRET777|IMGENVSECRET888|CHANGEDSECRET999'
RESULTS="$S/results.txt"; : > "$RESULTS"

CM="$HOME/Documents/Qualitas-deploy-artifacts/DEPLOY-EXEC-2026-001/selftest-codemount-$(date -u +%Y%m%dT%H%M%SZ)"  # Colima VM only sees $HOME
mkdir -p "$S/bin" "$S/ctx/core" "$S/proj/backend/uploads" "$S/proj/backend/core" "$CM"
git -C /Users/nook/Documents/Qualitas show 056c245c:backend/core/docx_builder.py > "$S/ctx/core/docx_builder.py"
cp "$S/ctx/core/docx_builder.py" "$S/proj/backend/core/docx_builder.py"
cp "$S/ctx/core/docx_builder.py" "$CM/docx_builder.py"; chmod 755 "$CM"; chmod 644 "$CM/docx_builder.py"
touch "$S/proj/docker-compose.yml" "$S/proj/.env.tunnel"
cat > "$S/ctx/Dockerfile" <<'EOF'
FROM python:3.11-slim
WORKDIR /app
COPY core /app/core
RUN useradd -u 10001 app && chmod 644 /app/core/docx_builder.py && chown -R 10001:10001 /app
ENV IMGKEY=IMGENVSECRET888
EXPOSE 8000
USER 10001
ENTRYPOINT ["/bin/sh","-c","exec \"$@\"","entry-ENTSECRET222"]
CMD ["sh","-c","sleep infinity # SECRETCMD111"]
EOF

cat > "$S/bin/sudo" <<'EOF'
#!/bin/bash
[ "$1" = "-v" ] && exit 0
exec "$@"
EOF
cat > "$S/bin/docker-shim" <<EOF
#!/bin/bash
if [ "\${FAKE_EXEC_FAIL:-0}" = 1 ] && [ "\$1" = exec ]; then echo "boom ERRSECRET666" >&2; echo "ERRSECRET666"; exit 1; fi
if [ "\${FAKE_RUN_FAIL:-0}" = 1 ] && [ "\$1" = run ]; then echo "boom ERRSECRET666" >&2; echo "ERRSECRET666"; exit 1; fi
exec "$REAL_DOCKER" "\$@"
EOF
cat > "$S/bin/fake-compose" <<'EOF'
#!/bin/bash
if [ "$1" = version ]; then echo 2.20.1; exit 0; fi
if [ "${FAKE_COMPOSE_FAIL:-0}" = 1 ]; then echo "error ERRSECRET666" >&2; echo "{\"partial\":\"ERRSECRET666\"}"; exit 1; fi
cat "$FAKE_CFG"
EOF
chmod +x "$S/bin/"*

docker build -q -t "$IMG" "$S/ctx" >/dev/null || { echo build failed; exit 1; }
docker network create "$NET" >/dev/null 2>&1

# base compose config; per-case python edits passed as $1
mkcfg() {
python3 - "$S" "$1" > "$S/cfg.json" <<'PY'
import json, sys
S, edit = sys.argv[1], sys.argv[2]
cfg = {"name": "qbr3test", "networks": {"net": {"name": "qbr3-selftest_net"}},
       "services": {"backend": {
           "container_name": "qbr3-selftest", "restart": "unless-stopped", "command": None, "entrypoint": None,
           "build": {"context": S + "/proj/backend", "dockerfile": "Dockerfile", "args": {"TOKEN": "BUILDARGSECRET444"}},
           "environment": {"SECRET_KEY": "ENVSECRET333", "ALGORITHM": "HS256"},
           "networks": {"net": None},
           "volumes": [{"type": "bind", "source": S + "/proj/backend/uploads", "target": "/app/uploads"}]}}}
b = cfg["services"]["backend"]
exec(edit)
print(json.dumps(cfg))
PY
}

start_ctr() {  # extra docker run args...
  docker rm -f "$CTR" >/dev/null 2>&1
  docker run -d --name "$CTR" --network "$NET" --restart unless-stopped \
    -e SECRET_KEY=ENVSECRET333 -e ALGORITHM=HS256 \
    -v "$S/proj/backend/uploads:/app/uploads" \
    --label com.docker.compose.project=qbr3test \
    --label com.docker.compose.project.config_files="$S/proj/docker-compose.yml" \
    --label com.docker.compose.project.working_dir="$S/proj" \
    --label com.docker.compose.project.environment_file="$S/proj/.env.tunnel" \
    --label com.docker.compose.service=backend \
    --label com.docker.compose.version=2.20.1 \
    "$@" "$IMG" ${CTR_CMD:-} >/dev/null || { echo "start failed: $*"; return 1; }
  sleep 1
  docker exec "$CTR" sh -c 'mkdir -p /app/core/__pycache__ && touch /app/core/__pycache__/docx_builder.cpython-311.pyc' 2>/dev/null
}

run_case() {  # name expected_rc [env...]
  local name=$1 exp=$2; shift 2
  local home="$S/home-$name"; mkdir -p "$home"
  ( cd "$S" && env PATH="$S/bin:$PATH" HOME="$home" FAKE_CFG="$S/cfg.json" \
      PRECHECK_DOCKER="$S/bin/docker-shim" PRECHECK_COMPOSE="$S/bin/fake-compose" \
      PRECHECK_CONTAINER="$CTR" PRECHECK_PROJECT_DIR="$S/proj" "$@" \
      bash "$SCRIPT" ) > "$S/out-$name.txt" 2>&1
  local rc=$?
  local leaks; leaks=$(cat "$S/out-$name.txt" "$home"/*.txt 2>/dev/null | grep -c -E "$SECRETS")
  local verdict=OK; [ "$rc" = "$exp" ] && [ "$leaks" = 0 ] || verdict=MISMATCH
  printf '%-22s exit=%s expected=%s secret_hits=%s %s\n' "$name" "$rc" "$exp" "$leaks" "$verdict" | tee -a "$RESULTS"
}

# A pass (real docker; reference container created+removed)
mkcfg "pass"; start_ctr; run_case A-pass 0
# R4 real-docker cases
mkcfg "pass"; start_ctr --memory 512m; run_case R4-memory-limit 1
mkcfg "b['restart']='on-failure'"; start_ctr --restart on-failure:5; run_case R4-restart-retries 1
mkcfg "b['restart']='on-failure:5'"; start_ctr --restart on-failure:5; run_case R4-restart-retries-match 0
mkcfg "pass"; start_ctr --ulimit nofile=1024:2048; run_case R4-ulimit 1
mkcfg "pass"; start_ctr --security-opt no-new-privileges:true; run_case R4-security-opt 1
mkcfg "pass"; start_ctr --log-opt max-size=10m; run_case R4-log-opt 1
echo "leftover precheck containers: $(docker ps -a --filter name=qualitas-precheck --format '{{.Names}}' | wc -l | tr -d ' ')" | tee -a "$RESULTS"
docker rm -f "$CTR" >/dev/null 2>&1; docker network rm "$NET" >/dev/null 2>&1; docker rmi "$IMG" >/dev/null 2>&1
rm -rf "$CM"; echo "removed $CM"
echo "cleanup done (container/network/image $CTR/$NET/$IMG)" | tee -a "$RESULTS"
