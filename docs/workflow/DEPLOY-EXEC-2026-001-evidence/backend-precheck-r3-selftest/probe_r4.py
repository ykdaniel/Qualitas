"""R4 targeted analyzer probe (synthetic inputs, no Docker/NAS). Extracts the embedded analyzer verbatim."""
from pathlib import Path
import copy, hashlib, json, os, subprocess, sys, tempfile

SCRIPT = Path('/Users/nook/Documents/Qualitas/docs/workflow/DEPLOY-EXEC-2026-001-backend-precheck.sh')
s = SCRIPT.read_text()
code = s.split("<<'PY'\n", 1)[1].split('\nPY\n', 1)[0]
SHA = '95208d8af5c231f4f3de22b4fc74f7e0e5d604d79bac191ceceb80f768e78e6d'
SECRETS = ['SECRETVAL1', 'SECRETVAL2', 'LOGTOKEN3']

ref_hc = {"Binds": None, "LogConfig": {"Type": "json-file", "Config": {}}, "NetworkMode": "none", "PortBindings": {},
          "RestartPolicy": {"Name": "no", "MaximumRetryCount": 0}, "CapAdd": None, "DnsOptions": [], "IpcMode": "private",
          "Privileged": False, "SecurityOpt": None, "ShmSize": 67108864, "Memory": 0, "NanoCpus": 0, "CpuShares": 0,
          "MemorySwappiness": None, "Ulimits": [], "Tmpfs": None, "OomKillDisable": False, "PidsLimit": None,
          "MaskedPaths": ["/proc/kcore"], "ReadonlyPaths": ["/proc/sys"]}
ref_cfg = {"Hostname": "ref", "Domainname": "", "User": "", "Tty": False, "OpenStdin": False, "StdinOnce": False,
           "Cmd": ["sleep", "infinity"], "Image": "sha256:abc", "Volumes": None, "WorkingDir": "/app", "Entrypoint": None,
           "Labels": {"org.image": "1"}, "Env": ["PATH=/bin", "IMGKEY=SECRETVAL2"]}
img = {"Id": "sha256:abc", "Config": {"Cmd": ["sleep", "infinity"], "Env": ["PATH=/bin", "IMGKEY=SECRETVAL2"],
                                       "WorkingDir": "/app", "Labels": {"org.image": "1"}}}
run_hc = copy.deepcopy(ref_hc)
run_hc.update({"NetworkMode": "p_default", "RestartPolicy": {"Name": "unless-stopped", "MaximumRetryCount": 0},
               "DnsOptions": None})  # [] vs null representation difference must not fail
ctr = {"Id": "abc", "Name": "/p-backend-1", "Image": "sha256:abc", "RestartCount": 0,
       "Config": {"Hostname": "x", "Domainname": "", "User": "", "Tty": False, "OpenStdin": False, "StdinOnce": False,
                  "Cmd": ["sleep", "infinity"], "Image": "p-backend", "Volumes": None, "WorkingDir": "/app",
                  "Entrypoint": None, "Env": ["PATH=/bin", "IMGKEY=SECRETVAL2", "SECRET_KEY=SECRETVAL1"],
                  "Labels": {"org.image": "1", "com.docker.compose.project": "p"}},
       "HostConfig": run_hc, "State": {"Status": "running", "Restarting": False}, "Mounts": [],
       "NetworkSettings": {"Networks": {"p_default": {"IPAMConfig": None, "Links": None, "Aliases": ["backend"]}}}}
cfg = {"name": "p", "networks": {"default": {"name": "p_default"}},
       "services": {"backend": {"restart": "unless-stopped", "environment": {"SECRET_KEY": "SECRETVAL1"}}}}
ref = {"Id": "ref", "Config": ref_cfg, "HostConfig": ref_hc}

def case_edits(name, c, i, f, r):
    hc, cc, ic, svc = c["HostConfig"], c["Config"], i["Config"], f["services"]["backend"]
    if name == "baseline": pass
    # --- reviewer's five reproduced cases ---
    elif name == "rev-missing-HostConfig": del c["HostConfig"]
    elif name == "rev-missing-Env-both": del cc["Env"]; del ic["Env"]
    elif name == "rev-redacted-workingdir-mismatch": ic["WorkingDir"] = "/app/a:b"; cc["WorkingDir"] = "/app/c:d"
    elif name == "rev-undeclared-resource-limit": hc["Memory"] = 536870912
    elif name == "rev-restart-retry-mismatch":
        svc["restart"] = "on-failure"; hc["RestartPolicy"] = {"Name": "on-failure", "MaximumRetryCount": 5}
    # --- additional R4 regressions ---
    elif name == "redacted-equal-workingdir": ic["WorkingDir"] = "/app/a:b"; cc["WorkingDir"] = "/app/a:b"
    elif name == "redacted-network-mismatch":
        f["networks"]["default"]["name"] = "p net;a"; c["NetworkSettings"]["Networks"] = {"p net;b": {}}; hc["NetworkMode"] = "p net;b"
    elif name == "redacted-image-ref-mismatch": svc["image"] = "img a"; cc["Image"] = "img b"
    elif name == "redacted-container-name-mismatch": svc["container_name"] = "n a"; c["Name"] = "/n b"
    elif name == "missing-Env-container-only": del cc["Env"]
    elif name == "missing-Env-image-only": del ic["Env"]
    elif name == "missing-RestartPolicy-MaxRetry": del hc["RestartPolicy"]["MaximumRetryCount"]
    elif name == "missing-User-container": del cc["User"]
    elif name == "missing-PortBindings": del hc["PortBindings"]
    elif name == "missing-HostConfig-key-vs-reference": del hc["ShmSize"]
    elif name == "wrong-type-RestartCount": c["RestartCount"] = "0"
    elif name == "reference-stage-failed": r.clear(); r["__fail__"] = True
    elif name == "reference-missing-HostConfig": del r["HostConfig"]
    elif name == "restart-on-failure-5-match":
        svc["restart"] = "on-failure:5"; hc["RestartPolicy"] = {"Name": "on-failure", "MaximumRetryCount": 5}
    elif name == "restart-on-failure-5-vs-3":
        svc["restart"] = "on-failure:5"; hc["RestartPolicy"] = {"Name": "on-failure", "MaximumRetryCount": 3}
    elif name == "restart-unsupported-form": svc["restart"] = "sometimes"
    elif name == "undeclared-cpu": hc["NanoCpus"] = 1500000000
    elif name == "undeclared-ulimits": hc["Ulimits"] = [{"Name": "nofile", "Soft": 1024, "Hard": 2048}]
    elif name == "undeclared-security-opt": hc["SecurityOpt"] = ["no-new-privileges:true"]
    elif name == "undeclared-logging": hc["LogConfig"] = {"Type": "splunk", "Config": {"splunk-token": "LOGTOKEN3"}}
    elif name == "undeclared-memswappiness-0": hc["MemorySwappiness"] = 0
    elif name == "undeclared-tmpfs": hc["Tmpfs"] = {"/run": "size=64m"}
    elif name == "undeclared-unknown-key": hc["SomeFutureKnob"] = "on"
    elif name == "undeclared-stop-signal": cc["StopSignal"] = "SIGINT"
    elif name == "undeclared-tty": cc["Tty"] = True
    elif name == "undeclared-label": cc["Labels"]["custom.owner"] = "x"
    elif name == "static-ip-endpoint": c["NetworkSettings"]["Networks"]["p_default"]["IPAMConfig"] = {"IPv4Address": "172.20.0.9"}
    elif name == "compose-network-options": svc["networks"] = {"default": {"aliases": ["x"]}}
    elif name == "networkmode-not-compose": hc["NetworkMode"] = "bridge"
    elif name == "omitempty-image-fields-ok": ic.pop("WorkingDir"); cc["WorkingDir"] = ""   # legit omitempty
    elif name == "svc-field-wrong-type": svc["environment"] = 12345
    else: raise SystemExit("unknown case " + name)

EXPECT_PASS = {"baseline", "restart-on-failure-5-match", "omitempty-image-fields-ok"}
CASES = ["baseline", "rev-missing-HostConfig", "rev-missing-Env-both", "rev-redacted-workingdir-mismatch",
         "rev-undeclared-resource-limit", "rev-restart-retry-mismatch", "redacted-equal-workingdir",
         "redacted-network-mismatch", "redacted-image-ref-mismatch", "redacted-container-name-mismatch",
         "missing-Env-container-only", "missing-Env-image-only", "missing-RestartPolicy-MaxRetry", "missing-User-container",
         "missing-PortBindings", "missing-HostConfig-key-vs-reference", "wrong-type-RestartCount", "reference-stage-failed",
         "reference-missing-HostConfig", "restart-on-failure-5-match", "restart-on-failure-5-vs-3", "restart-unsupported-form",
         "undeclared-cpu", "undeclared-ulimits", "undeclared-security-opt", "undeclared-logging", "undeclared-memswappiness-0",
         "undeclared-tmpfs", "undeclared-unknown-key", "undeclared-stop-signal", "undeclared-tty", "undeclared-label",
         "static-ip-endpoint", "compose-network-options", "networkmode-not-compose", "omitempty-image-fields-ok",
         "svc-field-wrong-type"]

out, mismatches = [], 0
for name in CASES:
    c, i, f, r = (copy.deepcopy(x) for x in (ctr, img, cfg, ref))
    case_edits(name, c, i, f, r)
    with tempfile.TemporaryDirectory(prefix="qualitas-precheck-r3-probe-") as d:
        bodies = [json.dumps(c), json.dumps(i), json.dumps(f), "", SHA + "\n644 0:0 100", SHA + "\n644 0:0 100\nPython 3.11.17",
                  None if r.get("__fail__") else json.dumps(r)]
        paths = []
        for n, body in enumerate(bodies):
            p = Path(d) / str(n)
            p.write_text((body + "\n__RC__=0\n") if body is not None else "__RC__=96\n")
            paths.append(str(p))
        env = dict(os.environ, PRECHECK_ARGS="\x1f".join(["sha256:abc", "p-backend", "sha256:abc", "p", "/proj/compose.yml", "/proj",
              "/proj/.env", "backend", "2.20.1", "2.20.1", SHA, "401", SHA, "/app/core/docx_builder.py",
              "/app/qualitas.db,/app/uploads,/app/backups,/app/logs", "probe-temp", "probe-ref"]))
        r_ = subprocess.run([sys.executable, "-", *paths], input=code, text=True, capture_output=True, env=env)
    text = r_.stdout + r_.stderr
    leaks = sum(text.count(x) for x in SECRETS)
    exp = 0 if name in EXPECT_PASS else 1
    ok = r_.returncode == exp and leaks == 0
    mismatches += not ok
    out.append("%-38s exit=%s expected=%s secret_hits=%d %s" % (name, r_.returncode, exp, leaks, "OK" if ok else "MISMATCH"))
    out += ["    " + x for x in r_.stdout.splitlines() if x.startswith("[FAIL]") or x.startswith("INTERNAL")]
print("script sha256=" + hashlib.sha256(s.encode()).hexdigest())
print("analyzer run with python", sys.version.split()[0])
print("\n".join(out))
print("\nTOTAL cases=%d mismatches=%d" % (len(CASES), mismatches))
sys.exit(1 if mismatches else 0)
