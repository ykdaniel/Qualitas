#!/usr/bin/env bash
# DEPLOY-EXEC-2026-001 — 後端唯讀預檢（v3 §3 ＋ 門檻 G）
# 在 NAS 上以 ykdaniel 執行：bash ~/qualitas-backend-precheck.sh
# - 只讀：docker inspect / image inspect / diff / exec(sha256sum, stat) / compose config；
#   另以 `docker run --rm --network none --read-only` 開一個用完即刪的臨時容器讀原映像內的 helper。
# - 不重啟、不建置、不打標籤、不改檔案、不改設定。
# - 原始 inspect／compose 設定只在管線記憶體中解析，不落地、不顯示；
#   報告只含容器識別、掛載、雜湊、鍵名與檢查結果，不含任何環境變數值。
set -u
umask 077

D=${PRECHECK_DOCKER:-/usr/local/bin/docker}          # 覆寫變數僅供本機自測
DC=${PRECHECK_COMPOSE:-/usr/local/bin/docker-compose}
C=${PRECHECK_CONTAINER:-qualitas-backend}
P=${PRECHECK_PROJECT_DIR:-/volume1/docker/Qualitas}
PROBE_URL=${PRECHECK_PROBE_URL:-https://qualitas.rokusumi.net/api/user/profile}
HELPER=/app/core/docx_builder.py
BASE_SHA=95208d8af5c231f4f3de22b4fc74f7e0e5d604d79bac191ceceb80f768e78e6d
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$HOME/qualitas-backend-precheck-$TS.txt"

echo "需要 sudo 密碼（只在本機終端機輸入，不會寫入報告）："
sudo -v || { echo "sudo 驗證失敗，停止"; exit 1; }

lbl() { sudo "$D" inspect -f "{{index .Config.Labels \"$1\"}}" "$C" 2>/dev/null; }

{
echo "== DEPLOY-EXEC-2026-001 backend read-only precheck =="
echo "utc=$TS host=$(hostname) user=$(id -un)"

IMG=$(sudo "$D" inspect -f '{{.Image}}' "$C" 2>/dev/null)
L_PROJECT=$(lbl com.docker.compose.project)
L_FILES=$(lbl com.docker.compose.project.config_files)
L_WORKDIR=$(lbl com.docker.compose.project.working_dir)
L_ENVFILE=$(lbl com.docker.compose.project.environment_file)
L_SERVICE=$(lbl com.docker.compose.service)
L_VERSION=$(lbl com.docker.compose.version)
EXEC_VER=$("$DC" version --short 2>/dev/null)

# 3.2 可寫層差異（只列 /app 底下、排除 __pycache__/.pyc）
DIFF_ALL=$(sudo "$D" diff "$C" 2>/dev/null); DIFF_RC=$?
DIFF_APP=$(printf '%s\n' "$DIFF_ALL" | grep -E '^[ACD] /app(/|$)' | grep -vE '__pycache__|\.pyc$' | head -n 80)

# 3.3 helper：容器、原映像（臨時容器，無網路、唯讀）、主機
H_CONT=$(sudo "$D" exec "$C" sh -c "sha256sum $HELPER | cut -d' ' -f1; stat -c '%a %u:%g %s' $HELPER" 2>&1 | tr '\n' '|')
H_IMG=$(sudo "$D" run --rm --network none --read-only --entrypoint sh "$IMG" -c "sha256sum $HELPER | cut -d' ' -f1; stat -c '%a %u:%g %s' $HELPER; python --version 2>&1" 2>&1 | tr '\n' '|')
H_HOST=$(sha256sum "$P/backend/core/docx_builder.py" 2>/dev/null | cut -d' ' -f1)

# 3.4 API 探針基準（只記狀態碼）
PROBE=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "$PROBE_URL" 2>&1)

# G4 compose 有效設定：依容器標籤的專案名／設定檔（順序不變）／env-file 組出 config 指令
CF_ARGS=()
_files=()
IFS=',' read -r -a _files <<< "$L_FILES"
for f in ${_files[@]+"${_files[@]}"}; do [ -n "$f" ] && CF_ARGS+=(-f "$f"); done
[ -n "$L_ENVFILE" ] && CF_ARGS+=(--env-file "$L_ENVFILE")
echo "compose_cmd=$DC -p $L_PROJECT --project-directory $L_WORKDIR ${CF_ARGS[*]+${CF_ARGS[*]}} config --format json"

python3 - "$IMG" "$L_PROJECT" "$L_FILES" "$L_WORKDIR" "$L_ENVFILE" "$L_SERVICE" "$L_VERSION" "$EXEC_VER" \
  "$DIFF_RC" "$DIFF_APP" "$H_CONT" "$H_IMG" "$H_HOST" "$PROBE" "$BASE_SHA" \
  <(sudo "$D" inspect "$C" 2>/dev/null) \
  <(sudo "$D" image inspect "$IMG" 2>/dev/null) \
  <(cd "$L_WORKDIR" 2>/dev/null && sudo "$DC" -p "$L_PROJECT" --project-directory "$L_WORKDIR" ${CF_ARGS[@]+"${CF_ARGS[@]}"} config --format json 2>/dev/null) \
  <<'PY'
import json, sys
(img_id, project, files, workdir, envfile, service, cver, exec_ver,
 diff_rc, diff_app, h_cont, h_img, h_host, probe, base_sha, f_ctr, f_img, f_cfg) = sys.argv[1:19]

def load(path):
    try:
        with open(path) as fh:
            data = json.load(fh)
        return data[0] if isinstance(data, list) else data
    except Exception as e:
        return {"__error__": type(e).__name__}

results = []
ctr, img, cfg = load(f_ctr), load(f_img), load(f_cfg)
for _n, _d in (("container inspect", ctr), ("image inspect", img)):
    if "__error__" in _d or not _d.get("Id"):
        results.append(("FAIL", _n + " readable", _d.get("__error__", "empty")))
def check(name, ok, detail=""):
    results.append(("PASS" if ok else "FAIL", name, detail))
def info(name, detail):
    results.append(("INFO", name, detail))
def keys(env_list):
    return sorted({e.split("=", 1)[0] for e in (env_list or [])})
def envmap(env_list):
    return dict(e.split("=", 1) if "=" in e else (e, None) for e in (env_list or []))

print("\n-- 3.1 container / image identity --")
st = ctr.get("State", {})
cc = ctr.get("Config", {})
print("container_id =", ctr.get("Id"))
print("name =", ctr.get("Name"), " image_id =", ctr.get("Image"), " config_image =", cc.get("Image"))
print("status =", st.get("Status"), " restarting =", st.get("Restarting"), " restart_count =", ctr.get("RestartCount"), " started =", st.get("StartedAt"))
ic = img.get("Config", {})
print("image: id =", img.get("Id"), " tags =", img.get("RepoTags"), " digests =", img.get("RepoDigests"), " created =", img.get("Created"))
for label, c in (("image ", ic), ("contnr", cc)):
    print("%s config: user=%r workdir=%r cmd=%s entrypoint=%s ports=%s" % (
        label, c.get("User"), c.get("WorkingDir"), json.dumps(c.get("Cmd")),
        json.dumps(c.get("Entrypoint")), json.dumps(sorted((c.get("ExposedPorts") or {}).keys()))))
img_keys, ctr_keys = keys(ic.get("Env")), keys(cc.get("Env"))
print("image env keys =", img_keys)
print("container env keys =", ctr_keys)
print("container-only env keys =", sorted(set(ctr_keys) - set(img_keys)))
check("container running, not restarting", st.get("Status") == "running" and not st.get("Restarting"))
check("container image id == inspected image id", ctr.get("Image") == img.get("Id") == img_id, img_id)

print("\n-- mounts / networks (running) --")
run_mounts = set()
for m in ctr.get("Mounts", []):
    print("  %s %s -> %s rw=%s" % (m.get("Type"), m.get("Source"), m.get("Destination"), m.get("RW")))
    run_mounts.add((m.get("Source"), m.get("Destination"), bool(m.get("RW"))))
run_nets = sorted((ctr.get("NetworkSettings", {}).get("Networks") or {}).keys())
hc = ctr.get("HostConfig", {})
print("networks =", run_nets, " restart_policy =", (hc.get("RestartPolicy") or {}).get("Name"))

print("\n-- 3.2 docker diff under /app (excluding __pycache__/.pyc) --")
diff_lines = [l for l in diff_app.splitlines() if l.strip()]
print("\n".join("  " + l for l in diff_lines) or "  (none)")
CODE_EXT = (".py", ".sh", ".js", ".json", ".toml", ".cfg", ".ini", ".txt", ".yml", ".yaml", ".so")
code_changes = [l for l in diff_lines if l.endswith(CODE_EXT)]
check("docker diff ran", diff_rc == "0", "rc=" + diff_rc)
check("no code-file changes under /app in writable layer", diff_rc == "0" and not code_changes, "; ".join(code_changes))

print("\n-- 3.3 helper docx_builder.py --")
print("container :", h_cont)
print("image     :", h_img)
print("host      :", h_host)
hc_sha = h_cont.split("|")[0]; hi_sha = h_img.split("|")[0]
hc_mode = h_cont.split("|")[1] if "|" in h_cont else ""
check("helper container sha == image sha", hc_sha == hi_sha and len(hc_sha) == 64)
check("helper image sha == pre-fix base 95208d8a…", hi_sha == base_sha)
check("helper file mode is 644", hc_mode.startswith("644 "), hc_mode)
info("host helper sha == base", str(h_host == base_sha))

print("\n-- 3.4 API probe baseline --")
print("GET /api/user/profile (no auth) ->", probe)
check("probe baseline is 401 (not 5xx/timeout)", probe == "401", probe)

print("\n-- G1/G2 compose labels / executor --")
for k, v in (("project", project), ("config_files", files), ("working_dir", workdir),
             ("environment_file", envfile), ("service", service), ("version", cver)):
    print("  com.docker.compose.%s = %s" % (k, v or "(missing)"))
print("  executor /usr/local/bin/docker-compose version =", exec_ver)
check("G1 labels present (project/config_files/working_dir/service/version)",
      all([project, files, workdir, service, cver]))
check("G1 service label is backend", service == "backend", service)
check("G2 executor version == label version", bool(cver) and exec_ver.lstrip("v") == cver.lstrip("v"),
      "%s vs %s" % (exec_ver, cver))
check("G3 env-file determined from label", bool(envfile), envfile or "label missing")

print("\n-- G4 effective compose config (structure only) --")
if "__error__" in cfg or "services" not in cfg:
    check("G4 compose config parsed", False, cfg.get("__error__", "no services"))
else:
    print("  services =", sorted(cfg["services"]))
    svc = cfg["services"].get(service or "backend", {})
    vols = svc.get("volumes") or []
    for v in vols:
        print("  volume %s %s -> %s read_only=%s" % (v.get("type"), v.get("source"), v.get("target"), v.get("read_only", False)))
    build = svc.get("build") or {}
    print("  build =", {k: v for k, v in build.items() if k != "args"}, " build_arg_keys =", sorted((build.get("args") or {}).keys()))
    print("  container_name =", svc.get("container_name"), " image =", svc.get("image"), " restart =", svc.get("restart"))
    print("  command =", json.dumps(svc.get("command")), " entrypoint =", json.dumps(svc.get("entrypoint")))
    top_nets = cfg.get("networks") or {}
    cfg_nets = sorted((top_nets.get(n) or {}).get("name") or n for n in (svc.get("networks") or {}))
    print("  networks (resolved) =", cfg_nets, " ports =", svc.get("ports"))
    env = svc.get("environment") or {}
    if isinstance(env, list):
        env = envmap(env)
    print("  environment keys =", sorted(env))
    cfg_mounts = {(v.get("source"), v.get("target"), not v.get("read_only", False)) for v in vols}
    check("G4 container_name matches", svc.get("container_name") == (ctr.get("Name") or "").lstrip("/"))
    check("G4 volumes == running mounts", cfg_mounts == run_mounts,
          "cfg-only=%s run-only=%s" % (sorted(cfg_mounts - run_mounts), sorted(run_mounts - cfg_mounts)))
    check("G4 networks == running networks", cfg_nets == run_nets, "%s vs %s" % (cfg_nets, run_nets))
    check("G4 restart policy matches", svc.get("restart") == (hc.get("RestartPolicy") or {}).get("Name"))
    cenv = envmap(cc.get("Env"))
    missing = sorted(k for k in env if k not in cenv)
    differ = sorted(k for k in env if k in cenv and env[k] is not None and cenv[k] != env[k])
    check("G4 compose env keys present in container", bool(cenv) and not missing, "missing=%s" % missing)
    check("G4 compose env values equal running (compared, not printed)", bool(cenv) and not missing and not differ, "differ_keys=%s" % differ)
    extra = sorted(set(cenv) - set(env) - set(img_keys))
    check("G4 container env keys explained by image+compose", bool(cenv) and not extra, "unexplained=%s" % extra)
    if svc.get("command") is not None:
        check("G4 compose command == running Cmd", svc.get("command") == cc.get("Cmd"))
    else:
        check("G4 running Cmd == image Cmd (no compose override)", cc.get("Cmd") is not None and cc.get("Cmd") == ic.get("Cmd"))

print("\n-- checks --")
for status, name, detail in results:
    print("[%s] %s%s" % (status, name, (" :: " + detail) if detail and status != "PASS" else ""))
fails = [r for r in results if r[0] == "FAIL"]
print("\nOVERALL =", "PASS" if not fails else "FAIL (%d)" % len(fails))
PY
} 2>&1 | tee "$OUT"
chmod 600 "$OUT"
echo
echo "報告已存：$OUT（不含環境變數值）"
