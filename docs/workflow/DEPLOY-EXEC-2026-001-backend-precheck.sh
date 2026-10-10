#!/usr/bin/env bash
# DEPLOY-EXEC-2026-001 — 後端診斷預檢 r3（v3 §3 ＋ 門檻 G）
# 在 NAS 上以 ykdaniel 執行；啟動指令見 DEPLOY-EXEC-2026-001-backend-precheck.md（先比對完整 SHA-256）。
#
# 狀態變更（不是零變更）：
#   - 建立並自動刪除一個臨時容器 qualitas-precheck-<UTC>（--rm --network none --read-only），只讀原映像內 helper；
#   - 以同一映像 `docker create`（不啟動、--network none）一個參照容器 qualitas-precheck-ref-<UTC>，
#     只讀取它的預設執行設定後立即刪除（用來判斷正式容器有哪些重建後會遺失的非預設設定）；
#   - 在 $HOME 寫一份報告（600）。
# 不重啟、不建置、不打標籤、不改正式容器、檔案或設定。
#
# 輸出採明確允許清單：容器／映像識別、compose 標籤（路徑）、掛載路徑、網路、docker diff 路徑、
# helper 雜湊與權限、使用者／工作目錄／連接埠、環境變數「鍵名」與檢查結果。
# Cmd／Entrypoint／build 細節／環境變數值只在記憶體比較，只輸出相同／不同與鍵名；
# 各收集階段的 stderr 一律丟棄，只記階段名與退出碼。
#
# 退出碼：0＝全部 PASS；1＝有 FAIL；3＝分析程式內部錯誤；10＝sudo 驗證失敗；20＝報告寫入失敗；其他＝收集失敗。
set -uo pipefail
umask 077

D=${PRECHECK_DOCKER:-/usr/local/bin/docker}          # PRECHECK_* 覆寫只供本機自測
DC=${PRECHECK_COMPOSE:-/usr/local/bin/docker-compose}
C=${PRECHECK_CONTAINER:-qualitas-backend}
P=${PRECHECK_PROJECT_DIR:-/volume1/docker/Qualitas}
PROBE_URL=${PRECHECK_PROBE_URL:-https://qualitas.rokusumi.net/api/user/profile}
DATA_MOUNTS=${PRECHECK_DATA_MOUNTS:-/app/qualitas.db,/app/uploads,/app/backups,/app/logs}
HELPER=/app/core/docx_builder.py
BASE_SHA=95208d8af5c231f4f3de22b4fc74f7e0e5d604d79bac191ceceb80f768e78e6d
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$HOME/qualitas-backend-precheck-$TS.txt"
TMPC="qualitas-precheck-$TS"
REFC="qualitas-precheck-ref-$TS"

echo "需要 sudo 密碼（只在本機終端機輸入，不會寫入報告）："
sudo -v || { echo "sudo 驗證失敗，停止"; exit 10; }

# 收集器：stdout 交給分析程式，stderr 丟棄，最後一行附上退出碼
emit() { "$@" 2>/dev/null; echo "__RC__=$?"; }
lbl() { sudo "$D" inspect -f "{{index .Config.Labels \"$1\"}}" "$C" 2>/dev/null; }

main() {
  echo "== DEPLOY-EXEC-2026-001 backend diagnostic precheck r3 =="
  echo "utc=$TS host=$(hostname) user=$(id -un)"

  local IMG CFG_IMAGE TAG_ID L_PROJECT L_FILES L_WORKDIR L_ENVFILE L_SERVICE L_VERSION EXEC_VER H_HOST PROBE
  IMG=$(sudo "$D" inspect -f '{{.Image}}' "$C" 2>/dev/null)
  CFG_IMAGE=$(sudo "$D" inspect -f '{{.Config.Image}}' "$C" 2>/dev/null)
  TAG_ID=""
  [ -n "$CFG_IMAGE" ] && TAG_ID=$(sudo "$D" image inspect -f '{{.Id}}' "$CFG_IMAGE" 2>/dev/null)
  L_PROJECT=$(lbl com.docker.compose.project)
  L_FILES=$(lbl com.docker.compose.project.config_files)
  L_WORKDIR=$(lbl com.docker.compose.project.working_dir)
  L_ENVFILE=$(lbl com.docker.compose.project.environment_file)
  L_SERVICE=$(lbl com.docker.compose.service)
  L_VERSION=$(lbl com.docker.compose.version)
  EXEC_VER=$("$DC" version --short 2>/dev/null)
  H_HOST=$(sha256sum "$P/backend/core/docx_builder.py" 2>/dev/null | cut -d' ' -f1)
  PROBE=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$PROBE_URL" 2>/dev/null)

  # compose config 參數：依容器標籤的設定檔（順序不變）與 env-file
  local CF_ARGS=() _files=() f
  IFS=',' read -r -a _files <<< "$L_FILES"
  for f in ${_files[@]+"${_files[@]}"}; do [ -n "$f" ] && CF_ARGS+=(-f "$f"); done
  [ -n "$L_ENVFILE" ] && CF_ARGS+=(--env-file "$L_ENVFILE")

  compose_cfg() {
    if [ -z "$L_PROJECT" ] || [ -z "$L_WORKDIR" ] || [ ${#CF_ARGS[@]} -eq 0 ]; then echo "__RC__=98"; return; fi
    if ! cd "$L_WORKDIR" 2>/dev/null; then echo "__RC__=97"; return; fi
    emit sudo "$DC" -p "$L_PROJECT" --project-directory "$L_WORKDIR" ${CF_ARGS[@]+"${CF_ARGS[@]}"} config --format json
  }
  helper_img() {
    if [ -z "$IMG" ]; then echo "__RC__=98"; return; fi
    emit sudo "$D" run --rm --name "$TMPC" --network none --read-only --entrypoint sh "$IMG" \
      -c "sha256sum $HELPER | cut -d' ' -f1; stat -c '%a %u:%g %s' $HELPER; python --version 2>&1"
  }
  ref_inspect() {   # 參照容器：同映像、不啟動；inspect 後一定刪除，刪除失敗也回報
    if [ -z "$IMG" ]; then echo "__RC__=98"; return; fi
    if ! sudo "$D" create --name "$REFC" --network none "$IMG" >/dev/null 2>&1; then echo "__RC__=96"; return; fi
    sudo "$D" inspect "$REFC" 2>/dev/null
    local rc=$?
    sudo "$D" rm "$REFC" >/dev/null 2>&1 || rc=95
    echo "__RC__=$rc"
  }

  PRECHECK_ARGS=$(printf '%s\x1f' "$IMG" "$CFG_IMAGE" "$TAG_ID" "$L_PROJECT" "$L_FILES" "$L_WORKDIR" \
    "$L_ENVFILE" "$L_SERVICE" "$L_VERSION" "$EXEC_VER" "$H_HOST" "$PROBE" "$BASE_SHA" "$HELPER" "$DATA_MOUNTS" "$TMPC" "$REFC") \
  python3 - \
    <(emit sudo "$D" inspect "$C") \
    <(if [ -n "$IMG" ]; then emit sudo "$D" image inspect "$IMG"; else echo "__RC__=98"; fi) \
    <(compose_cfg) \
    <(emit sudo "$D" diff "$C") \
    <(emit sudo "$D" exec "$C" sh -c "sha256sum $HELPER | cut -d' ' -f1; stat -c '%a %u:%g %s' $HELPER") \
    <(helper_img) \
    <(ref_inspect) \
    <<'PY'
import json, os, re, sys

(img_id, cfg_image, tag_id, project, files, workdir, envfile, service, cver, exec_ver,
 h_host, probe, base_sha, helper, data_mounts, tmpc, refc) = os.environ["PRECHECK_ARGS"].split("\x1f")[:17]
f_ctr, f_img, f_cfg, f_diff, f_hc, f_hi, f_ref = sys.argv[1:8]
DATA_MOUNTS = set(x for x in data_mounts.split(",") if x)
HEX64 = re.compile(r"^[0-9a-f]{64}$")
MODE = re.compile(r"^[0-7]{3,4} \d+:\d+ \d+$")
PYVER = re.compile(r"^Python \d+\.\d+\.\d+$")
SAFE_PATH = re.compile(r"^/[A-Za-z0-9._/@+ -]*$")
SAFE_REL = re.compile(r"^[A-Za-z0-9._/-]+$")
SAFE_REF = re.compile(r"^[A-Za-z0-9._/:@-]+$")

results = []
def check(name, ok, detail=""):
    results.append(("PASS" if ok else "FAIL", name, detail))
def info(name, detail):
    results.append(("INFO", name, detail))

def stage(path, name):
    """回傳 (內容, 退出碼字串)；只報告階段名與退出碼，不輸出原始 stderr。"""
    try:
        with open(path) as fh:
            raw = fh.read()
    except Exception:
        check("stage %s readable" % name, False, "unreadable")
        return None, "unreadable"
    lines = raw.rstrip("\n").split("\n")
    if not lines or not lines[-1].startswith("__RC__="):
        check("stage %s completed" % name, False, "no exit marker")
        return None, "no-marker"
    rc = lines[-1][len("__RC__="):]
    print("stage %-17s rc=%s" % (name, rc))
    check("stage %s rc=0" % name, rc == "0", "rc=" + rc)
    return ("\n".join(lines[:-1]) if rc == "0" else None), rc

def stage_json(path, name):
    body, rc = stage(path, name)
    if body is None:
        return None
    try:
        data = json.loads(body)
    except Exception:
        check("stage %s json" % name, False, "not json")
        return None
    if isinstance(data, list):
        data = data[0] if len(data) == 1 else None
    if not isinstance(data, dict):
        check("stage %s json" % name, False, "unexpected shape")
        return None
    return data

def envmap(lst):
    out = {}
    for e in lst or []:
        k, sep, v = e.partition("=")
        out[k] = v if sep else None
    return out

def norm_list(v):
    return list(v) if v else []

def safe_path(p):
    return p if isinstance(p, str) and SAFE_PATH.match(p) else "<redacted>"

def safe_ref(r):
    return r if isinstance(r, str) and SAFE_REF.match(r) else "<redacted>"

def is_ancestor(a, b):
    return b != a and b.startswith(a.rstrip("/") + "/")

# ---- 必要欄位：缺鍵或型別不符一律 FAIL；只有 Docker 以 omitempty 省略的欄位才視為合法空值 ----
MISSING = object()
NONE = type(None)
def field(d, path):
    cur = d
    for k in path.split("."):
        if not isinstance(cur, dict) or k not in cur:
            return MISSING
        cur = cur[k]
    return cur
def bad_fields(label, d, required, optional=()):
    bad = []
    for path, types in required:
        v = field(d, path)
        if v is MISSING or not isinstance(v, types):
            bad.append(label + "." + path)
    for path, types in optional:
        v = field(d, path)
        if v is not MISSING and not isinstance(v, types):
            bad.append(label + "." + path)
    return bad
CTR_REQUIRED = [("Id", str), ("Name", str), ("Image", str), ("RestartCount", int),
    ("State.Status", str), ("State.Restarting", bool), ("Mounts", (list, NONE)), ("NetworkSettings.Networks", dict),
    ("Config", dict), ("Config.Image", str), ("Config.Env", (list, NONE)), ("Config.Cmd", (list, NONE)),
    ("Config.Entrypoint", (list, NONE)), ("Config.User", str), ("Config.WorkingDir", str), ("Config.Labels", (dict, NONE)),
    ("HostConfig", dict), ("HostConfig.RestartPolicy", dict), ("HostConfig.RestartPolicy.Name", str),
    ("HostConfig.RestartPolicy.MaximumRetryCount", int), ("HostConfig.PortBindings", (dict, NONE)),
    ("HostConfig.NetworkMode", str)]
CTR_OPTIONAL = [("Config.ExposedPorts", (dict, NONE))]                     # omitempty
IMG_REQUIRED = [("Id", str), ("Config", dict), ("Config.Env", (list, NONE)), ("Config.Cmd", (list, NONE))]
IMG_OPTIONAL = [("Config.Entrypoint", (list, NONE)), ("Config.User", str), ("Config.WorkingDir", str),
    ("Config.ExposedPorts", (dict, NONE)), ("Config.Labels", (dict, NONE))]  # 新版引擎 omitempty
REF_REQUIRED = [("Config", dict), ("HostConfig", dict)]
SVC_TYPES = [("build", (dict, NONE)), ("command", (list, NONE)), ("container_name", (str, NONE)),
    ("entrypoint", (list, NONE)), ("environment", (dict, list, NONE)), ("networks", (dict, NONE)),
    ("restart", (str, NONE)), ("volumes", (list, NONE)), ("image", (str, NONE)), ("ports", (list, NONE)),
    ("expose", (list, NONE)), ("user", (str, NONE)), ("working_dir", (str, NONE))]

def deep_norm(v):
    """比較用正規化：None／""／[]／{}／False 視為同一個「未設定」；0 仍是有效值（例：MemorySwappiness=0）。"""
    if isinstance(v, dict):
        out = {}
        for k, x in v.items():
            nx = deep_norm(x)
            if nx is not None:
                out[k] = nx
        return out or None
    if isinstance(v, list):
        out = [deep_norm(x) for x in v]
        return out or None
    if v is None or v == "" or v is False:
        return None
    return v

def main():
    print("\n-- collection stages --")
    ctr = stage_json(f_ctr, "container-inspect")
    img = stage_json(f_img, "image-inspect")
    cfg = stage_json(f_cfg, "compose-config")
    diff_body, _ = stage(f_diff, "docker-diff")
    hc_body, _ = stage(f_hc, "helper-container")
    hi_body, _ = stage(f_hi, "helper-image")
    ref = stage_json(f_ref, "reference-create")
    print("temp container name =", tmpc, " reference container name =", refc)

    print("\n-- required fields (missing key or wrong type = FAIL) --")
    bad = []
    if ctr:
        bad += bad_fields("container", ctr, CTR_REQUIRED, CTR_OPTIONAL)
    if img:
        bad += bad_fields("image", img, IMG_REQUIRED, IMG_OPTIONAL)
    if ref:
        bad += bad_fields("reference", ref, REF_REQUIRED)
    print("  missing/invalid =", bad or "none")
    check("required inspect fields present and well-typed", bool(ctr and img and ref) and not bad,
          "missing/invalid=%s" % bad if bad else "inputs unavailable")

    # ---------- 3.1 identity ----------
    print("\n-- 3.1 container / image identity --")
    cc, ic, hcfg, st = {}, {}, {}, {}
    if ctr:
        cc, hcfg, st = ctr.get("Config") or {}, ctr.get("HostConfig") or {}, ctr.get("State") or {}
        print("container_id =", ctr.get("Id"))
        print("name =", ctr.get("Name"), " image_id =", ctr.get("Image"), " config_image =", safe_ref(cc.get("Image")))
        print("status =", st.get("Status"), " restarting =", st.get("Restarting"),
              " restart_count =", ctr.get("RestartCount"), " started =", st.get("StartedAt"))
    if img:
        ic = img.get("Config") or {}
        print("image_id =", img.get("Id"), " tags =", [safe_ref(t) for t in img.get("RepoTags") or []], " created =", img.get("Created"))
    check("container running, not restarting", bool(ctr) and st.get("Status") == "running" and st.get("Restarting") is False)
    check("container image id == inspected image id", bool(ctr and img) and ctr.get("Image") == img.get("Id") == img_id)
    check("container Config.Image tag still points to running image", bool(tag_id) and tag_id == img_id,
          "" if tag_id == img_id else "tag moved or unresolved")

    # ---------- mounts ----------
    print("\n-- mounts (running) --")
    run_mounts = list((ctr or {}).get("Mounts") or [])
    for m in run_mounts:
        print("  %s %s -> %s rw=%s" % (m.get("Type"), safe_path(m.get("Source")), safe_path(m.get("Destination")), m.get("RW")))
    dsts = [m.get("Destination") or "" for m in run_mounts]
    code_mounts = [d for d in dsts if d == helper or is_ancestor(d, helper) or d in ("/", "/app")]
    other_mounts = [d for d in dsts if d not in DATA_MOUNTS and d not in code_mounts]
    print("  approved data mounts =", sorted(DATA_MOUNTS))
    check("no mount covers application code / helper", bool(ctr) and not code_mounts,
          "code_mounts=%s" % [safe_path(d) for d in code_mounts])
    check("all mounts are approved data mounts", bool(ctr) and not other_mounts,
          "unapproved=%s" % [safe_path(d) for d in other_mounts])
    nets = sorted(((ctr or {}).get("NetworkSettings") or {}).get("Networks") or {})
    print("networks =", nets)

    # ---------- 3.2 docker diff ----------
    print("\n-- 3.2 docker diff (full, no truncation) --")
    entries, unparsable = [], []
    for line in (diff_body or "").splitlines():
        mt = re.match(r"^([ACD]) (/.*)$", line)
        if mt:
            entries.append((mt.group(1), mt.group(2)))
        elif line.strip():
            unparsable.append(line)
    paths = [p for _, p in entries]
    cats = [("cache", []), ("tmp", []), ("mountpoint", []), ("parent-dir", []), ("sqlite-sidecar", []), ("UNEXPLAINED", [])]
    cat = dict(cats)
    sidecar_base = [d for d in DATA_MOUNTS if d.endswith(".db")]
    for kind, p in entries:
        parts = p.split("/")
        if kind in "AC" and "__pycache__" in parts and (p.endswith("/__pycache__") or p.endswith(".pyc")):
            cat["cache"].append((kind, p))
        elif p == "/tmp" or p.startswith("/tmp/"):
            cat["tmp"].append((kind, p))
        elif any(p == b + s for b in sidecar_base for s in ("-wal", "-shm", "-journal")):
            cat["sqlite-sidecar"].append((kind, p))
        elif kind in "AC" and any(p == d or is_ancestor(p, d) for d in dsts):
            cat["mountpoint"].append((kind, p))
        elif kind == "C" and any(is_ancestor(p, q) for q in paths):
            cat["parent-dir"].append((kind, p))
        else:
            cat["UNEXPLAINED"].append((kind, p))
    print("total entries =", len(entries), " unparsable lines =", len(unparsable))
    for name, items in cats:
        print("  [%s] %d" % (name, len(items)))
        for kind, p in items:
            print("    %s %s" % (kind, safe_path(p)))
    check("docker diff collected", diff_body is not None)
    check("docker diff: no unexplained changes (incl. outside /app)",
          diff_body is not None and not cat["UNEXPLAINED"] and not unparsable,
          "%d unexplained, %d unparsable" % (len(cat["UNEXPLAINED"]), len(unparsable)))
    check("docker diff: no SQLite sidecar in container layer (would be lost on recreate)",
          diff_body is not None and not cat["sqlite-sidecar"], "%d sidecar entries" % len(cat["sqlite-sidecar"]))

    # ---------- 3.3 helper ----------
    print("\n-- 3.3 helper %s --" % helper)
    def parse_helper(body, want_py):
        ls = (body or "").splitlines()
        sha = ls[0] if len(ls) > 0 and HEX64.match(ls[0]) else None
        mode = ls[1] if len(ls) > 1 and MODE.match(ls[1]) else None
        py = (ls[2] if len(ls) > 2 and PYVER.match(ls[2]) else None) if want_py else "-"
        return sha, mode, py
    c_sha, c_mode, _ = parse_helper(hc_body, False)
    i_sha, i_mode, i_py = parse_helper(hi_body, True)
    print("container: sha=%s mode=%s" % (c_sha or "<unparsable>", c_mode or "<unparsable>"))
    print("image    : sha=%s mode=%s %s" % (i_sha or "<unparsable>", i_mode or "<unparsable>", i_py or "<unparsable>"))
    print("host     : sha=%s" % (h_host if HEX64.match(h_host or "") else "<unparsable>"))
    check("helper container sha == image sha", bool(c_sha) and c_sha == i_sha)
    check("helper image sha == pre-fix base 95208d8a…", i_sha == base_sha)
    check("helper mode/owner/size equal in container and image, mode 644", bool(c_mode) and c_mode == i_mode and c_mode.startswith("644 "))
    check("image python version readable", bool(i_py))
    info("host helper sha == base", str(h_host == base_sha))

    # ---------- 3.4 probe ----------
    print("\n-- 3.4 API probe baseline --")
    code = probe if re.match(r"^\d{3}$", probe or "") else "<none>"
    print("GET /api/user/profile (no auth) ->", code)
    check("probe baseline is 401", code == "401", code)

    # ---------- G1/G2/G3 ----------
    print("\n-- G1/G2/G3 compose labels / executor --")
    for k, v in (("project", project), ("config_files", files), ("working_dir", workdir),
                 ("environment_file", envfile), ("service", service), ("version", cver)):
        shown = ",".join(safe_path(x) for x in v.split(",")) if v and k in ("config_files", "working_dir", "environment_file") \
            else (safe_ref(v) if v else "(missing)")
        print("  com.docker.compose.%s = %s" % (k, shown))
    print("  executor docker-compose version =", safe_ref(exec_ver) if exec_ver else "(unreadable)")
    check("G1 labels present", all([project, files, workdir, service, cver]))
    check("G1 service label is backend", service == "backend", safe_ref(service) if service else "(missing)")
    check("G2 executor version == label version", bool(cver) and bool(exec_ver) and exec_ver.lstrip("v") == cver.lstrip("v"))
    check("G3 env-file determined from label", bool(envfile))

    # ---------- G4 ----------
    print("\n-- G4 effective config vs running (values compared in memory only) --")
    if not (cfg and ctr and img):
        check("G4 inputs available (container, image, compose config)", False)
        return
    svcs = cfg.get("services") or {}
    print("  compose name =", safe_ref(cfg.get("name")), " services =", sorted(svcs), " top-level keys =", sorted(cfg))
    check("G4 compose project name == label", cfg.get("name") == project)
    svc = svcs.get(service)
    if not isinstance(svc, dict):
        check("G4 service present in compose config", False, safe_ref(service) if service else "(missing)")
        return
    SUPPORTED = {"build", "command", "container_name", "entrypoint", "environment", "networks",
                 "restart", "volumes", "image", "ports", "expose", "user", "working_dir"}
    print("  service keys =", sorted(svc))
    unsupported = sorted(set(svc) - SUPPORTED)
    check("G4 service uses only supported keys", not unsupported, "unsupported=%s" % unsupported)
    svc_bad = [k for k, t in SVC_TYPES if k in svc and not isinstance(svc[k], t)]
    if svc_bad:
        check("G4 service field types supported", False, "invalid=%s" % svc_bad)
        return

    build = svc.get("build")
    if build is not None:
        if isinstance(build, dict):
            df = build.get("dockerfile")
            print("  build keys =", sorted(build), " context =", safe_path(build.get("context")),
                  " dockerfile =", df if isinstance(df, str) and SAFE_REL.match(df) else "<redacted>",
                  " arg keys =", sorted(build.get("args") or {}))
        else:
            print("  build = <non-dict, redacted>")
        check("G4 build uses only context/dockerfile/args", isinstance(build, dict) and set(build) <= {"context", "dockerfile", "args"},
              "keys=%s" % (sorted(build) if isinstance(build, dict) else "<non-dict>"))
        check("G4 build context is a local absolute path",
              isinstance(build, dict) and isinstance(build.get("context"), str) and bool(SAFE_PATH.match(build.get("context"))))

    def same(name, expected, actual, show=None):
        """原值比較；show 只負責輸出遮蔽。值無法以安全格式顯示時直接 FAIL（不支援的格式）。"""
        ok = expected == actual
        if show is None:
            check("G4 %s" % name, ok, "" if ok else "differs (values not printed)")
            return
        e_s, a_s = show(expected), show(actual)
        if "<redacted>" in repr(e_s) or "<redacted>" in repr(a_s):
            check("G4 %s" % name, False, "unsupported value format (raw values %s, not printed)" % ("equal" if ok else "differ"))
            return
        check("G4 %s" % name, ok, "" if ok else "expected=%s running=%s" % (e_s, a_s))
    def show_list(fn):
        return lambda xs: [fn(x) for x in xs]

    # image reference / container name / restart policy（完整：名稱＋重試上限）
    exp_image = svc.get("image") or "%s-%s" % (project, service)
    same("image reference", exp_image, cc.get("Image"), safe_ref)
    same("container_name", svc.get("container_name") or "%s-%s-1" % (project, service),
         (ctr.get("Name") or "").lstrip("/"), safe_ref)
    rs = svc.get("restart")
    mt = re.match(r"^(no|always|unless-stopped|on-failure)(?::(\d+))?$", rs) if isinstance(rs, str) else None
    if rs is None:
        exp_rp = ("no", 0)
    elif mt and (mt.group(2) is None or mt.group(1) == "on-failure"):
        exp_rp = (mt.group(1), int(mt.group(2) or 0))
    else:
        exp_rp = None
        check("G4 restart policy form supported", False, "unsupported restart value")
    rp = hcfg.get("RestartPolicy") if isinstance(hcfg.get("RestartPolicy"), dict) else {}
    run_rp = (rp.get("Name") or "no", rp.get("MaximumRetryCount", MISSING))
    print("  restart policy expected=%s running=%s" % (exp_rp, (safe_ref(run_rp[0]), run_rp[1] if run_rp[1] is not MISSING else "<missing>")))
    if exp_rp is not None:
        same("restart policy (name, max retries)", exp_rp, run_rp,
             lambda t: "%s:%s" % (safe_ref(t[0]), t[1] if isinstance(t[1], int) else "<redacted>"))

    # entrypoint / command（不輸出內容）
    for key in ("entrypoint", "command"):
        if svc.get(key) is not None and not isinstance(svc.get(key), list):
            check("G4 %s form supported (list)" % key, False, "non-list form")
    exp_ep = svc.get("entrypoint") if svc.get("entrypoint") is not None else ic.get("Entrypoint")
    if svc.get("command") is not None:
        exp_cmd = svc.get("command")
    elif svc.get("entrypoint") is not None:
        exp_cmd = None
    else:
        exp_cmd = ic.get("Cmd")
    print("  entrypoint argc expected/running = %d/%d" % (len(norm_list(exp_ep)), len(norm_list(cc.get("Entrypoint")))))
    print("  command argc expected/running = %d/%d" % (len(norm_list(exp_cmd)), len(norm_list(cc.get("Cmd")))))
    same("entrypoint", norm_list(exp_ep), norm_list(cc.get("Entrypoint")))
    same("command", norm_list(exp_cmd), norm_list(cc.get("Cmd")))

    # user / working_dir
    exp_user = svc.get("user") if svc.get("user") is not None else ic.get("User")
    exp_wd = svc.get("working_dir") if svc.get("working_dir") is not None else ic.get("WorkingDir")
    show_user = lambda v: safe_ref(v) if v else "(empty)"
    show_wd = lambda v: safe_path(v) if v else "(empty)"
    print("  user expected=%s running=%s; working_dir expected=%s running=%s" % (
        show_user(exp_user or ""), show_user(cc.get("User") or ""), show_wd(exp_wd or ""), show_wd(cc.get("WorkingDir") or "")))
    same("user", exp_user or "", cc.get("User") or "", show_user)
    same("working_dir", exp_wd or "", cc.get("WorkingDir") or "", show_wd)

    # ports
    exp_bind, port_problem = {}, []
    for p in svc.get("ports") or []:
        if not isinstance(p, dict) or "-" in str(p.get("published", "")):
            port_problem.append("unsupported port form")
            continue
        key = "%s/%s" % (p.get("target"), p.get("protocol") or "tcp")
        exp_bind.setdefault(key, set()).add((p.get("host_ip") or "", str(p.get("published") or "")))
    run_bind = {}
    for key, lst in (hcfg.get("PortBindings") or {}).items():
        run_bind[key] = set((b.get("HostIp") or "", str(b.get("HostPort") or "")) for b in (lst or []))
    print("  port bindings expected =", {k: sorted(v) for k, v in exp_bind.items()},
          " running =", {k: sorted(v) for k, v in run_bind.items()})
    check("G4 port bindings", not port_problem and exp_bind == run_bind, "; ".join(port_problem) or "differs (shown above)")
    exp_expose = set((ic.get("ExposedPorts") or {}).keys()) | set(exp_bind)
    for e in svc.get("expose") or []:
        e = str(e)
        exp_expose.add(e if "/" in e else e + "/tcp")
    run_expose = set((cc.get("ExposedPorts") or {}).keys())
    print("  exposed expected =", sorted(exp_expose), " running =", sorted(run_expose))
    same("exposed ports", sorted(exp_expose), sorted(run_expose), show_list(safe_ref))

    # networks
    top_nets = cfg.get("networks") or {}
    svc_nets = svc.get("networks") or {"default": None}
    exp_nets = sorted(((top_nets.get(n) or {}).get("name") or "%s_%s" % (project, n)) for n in svc_nets)
    print("  networks expected =", [safe_ref(n) for n in exp_nets], " running =", [safe_ref(n) for n in nets])
    same("networks", exp_nets, nets, show_list(safe_ref))
    net_opts = sorted(n for n, v in svc_nets.items() if v is not None)
    check("G4 no per-network options (aliases/static IP) in compose", not net_opts, "networks_with_options=%s" % net_opts)
    eps = ((ctr.get("NetworkSettings") or {}).get("Networks") or {})
    ep_bad = sorted(n for n, ep in eps.items() if not isinstance(ep, dict) or deep_norm(ep.get("IPAMConfig")) or deep_norm(ep.get("Links")))
    check("G4 running endpoints have no static IP/links", not ep_bad, "endpoints=%s" % ep_bad)
    check("G4 NetworkMode is one of the compose networks", hcfg.get("NetworkMode") in exp_nets,
          "running NetworkMode not in expected networks")

    # volumes
    exp_m, vol_problem = set(), []
    for v in svc.get("volumes") or []:
        if not isinstance(v, dict) or v.get("type") != "bind":
            vol_problem.append("non-bind volume")
            continue
        exp_m.add((v.get("source"), v.get("target"), not v.get("read_only", False)))
    run_m = set((m.get("Source"), m.get("Destination"), bool(m.get("RW"))) for m in run_mounts if m.get("Type") == "bind")
    non_bind_running = [safe_path(m.get("Destination")) for m in run_mounts if m.get("Type") != "bind"]
    check("G4 volumes == running bind mounts", not vol_problem and not non_bind_running and exp_m == run_m,
          "%s cfg-only=%s run-only=%s non-bind-running=%s" % (
              "; ".join(vol_problem), sorted(safe_path(t) for _, t, _ in exp_m - run_m),
              sorted(safe_path(t) for _, t, _ in run_m - exp_m), non_bind_running))

    # environment：image 預設 + compose 覆寫 = 預期；全部有效值比較，不輸出值
    img_env, run_env = envmap(ic.get("Env")), envmap(cc.get("Env"))
    cenv = svc.get("environment") or {}
    if isinstance(cenv, list):
        cenv = envmap(cenv)
    expected = dict(img_env)
    unset = sorted(k for k, v in cenv.items() if v is None)
    for k, v in cenv.items():
        if v is not None:
            expected[k] = str(v)
    missing = sorted(set(expected) - set(run_env))
    extra = sorted(set(run_env) - set(expected))
    differ = sorted(k for k in expected if k in run_env and expected[k] != run_env[k])
    inherited_changed = sorted(k for k in differ if k not in cenv)
    print("  env key counts: image=%d compose=%d expected=%d running=%d" % (len(img_env), len(cenv), len(expected), len(run_env)))
    print("  image env keys =", sorted(img_env))
    print("  compose env keys =", sorted(cenv))
    check("G4 env: no compose keys without value", not unset, "unset=%s" % unset)
    check("G4 env: running keys == image+compose keys", not missing and not extra, "missing=%s extra=%s" % (missing, extra))
    check("G4 env: all effective values equal (not printed)", not differ,
          "differ_keys=%s inherited_changed=%s" % (differ, inherited_changed))

    # 重建後會遺失的非預設執行設定：與同映像參照容器（本機 daemon 預設值）逐鍵比較，只輸出鍵名
    if not (ref and isinstance(ref.get("HostConfig"), dict) and isinstance(ref.get("Config"), dict)):
        check("G4 reference container (daemon defaults) available", False)
        return
    rh, rcfg = ref["HostConfig"], ref["Config"]
    MANAGED_HC = {"Binds", "Mounts", "PortBindings", "RestartPolicy", "NetworkMode"}   # 已在上方逐項比對
    hc_missing = sorted(k for k in rh if k not in MANAGED_HC and k not in hcfg)
    hc_diff = sorted(k for k in set(rh) | set(hcfg)
                     if k not in MANAGED_HC and k not in hc_missing and deep_norm(hcfg.get(k)) != deep_norm(rh.get(k)))
    if "MemorySwappiness" in rh and "MemorySwappiness" not in hc_diff and hcfg.get("MemorySwappiness") != rh.get("MemorySwappiness"):
        hc_diff.append("MemorySwappiness")
    print("  reference HostConfig keys =", len(rh), " compose-managed (compared above) =", sorted(MANAGED_HC))
    print("  HostConfig keys missing vs reference =", hc_missing or "none")
    print("  HostConfig keys differing from daemon defaults =", hc_diff or "none")
    check("G4 HostConfig has every key the reference has", not hc_missing, "missing=%s" % hc_missing)
    check("G4 HostConfig equals daemon defaults except compose-managed keys (memory/CPU/security/ulimits/logging/...)",
          not hc_diff, "non-default keys=%s" % hc_diff)
    CMP_CONFIG = ("Domainname", "Tty", "OpenStdin", "StdinOnce", "StopSignal", "StopTimeout", "Healthcheck",
                  "OnBuild", "Shell", "ArgsEscaped", "NetworkDisabled", "MacAddress", "Volumes")
    cfg_diff = sorted(k for k in CMP_CONFIG if deep_norm(cc.get(k)) != deep_norm(rcfg.get(k)))
    print("  runtime Config keys differing from reference =", cfg_diff or "none")
    check("G4 runtime Config fields equal reference (tty/stdin/stop signal+timeout/healthcheck/...)",
          not cfg_diff, "differ=%s" % cfg_diff)
    rl, il = cc.get("Labels") or {}, ic.get("Labels") or {}
    extra_l = sorted(k for k in rl if not k.startswith("com.docker.compose.") and k not in il)
    changed_l = sorted(k for k in il if rl.get(k, MISSING) != il[k])
    check("G4 no undeclared container labels; image labels unchanged", not extra_l and not changed_l,
          "extra=%s changed=%s" % (extra_l, changed_l))

try:
    main()
except Exception as e:
    tb = sys.exc_info()[2]
    while tb.tb_next:
        tb = tb.tb_next
    print("\nINTERNAL ERROR %s at line %d (details suppressed)" % (type(e).__name__, tb.tb_lineno))
    print("OVERALL = ERROR")
    sys.exit(3)

print("\n-- checks --")
for status, name, detail in results:
    print("[%s] %s%s" % (status, name, (" :: " + detail) if detail and status != "PASS" else ""))
fails = [r for r in results if r[0] == "FAIL"]
print("\nOVERALL =", "PASS" if not fails else "FAIL (%d)" % len(fails))
sys.exit(0 if not fails else 1)
PY
}

main 2>&1 | tee "$OUT"
PS=("${PIPESTATUS[@]}")
RC=${PS[0]}
TEE_RC=${PS[1]:-1}
chmod 600 "$OUT" 2>/dev/null
if [ "$TEE_RC" -ne 0 ] && [ "$RC" -eq 0 ]; then RC=20; fi
echo
echo "報告：$OUT（不含環境變數值）"
echo "PRECHECK_EXIT=$RC"
exit "$RC"
