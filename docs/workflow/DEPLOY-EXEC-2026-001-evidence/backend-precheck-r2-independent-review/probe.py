from pathlib import Path
import tempfile,json,os,subprocess,hashlib
s=Path('/Users/nook/Documents/Qualitas/docs/workflow/DEPLOY-EXEC-2026-001-backend-precheck.sh').read_text()
code=s.split("<<'PY'\n",1)[1].split('\nPY\n',1)[0]
sha='95208d8af5c231f4f3de22b4fc74f7e0e5d604d79bac191ceceb80f768e78e6d'
basecc={'Image':'p-backend','Entrypoint':None,'Cmd':['sleep','infinity'],'User':'','WorkingDir':'/app','Env':['PATH=/bin'],'ExposedPorts':{}}
basehc={'RestartPolicy':{'Name':'no','MaximumRetryCount':0},'PortBindings':{}}
img={'Id':'sha256:abc','Config':basecc.copy()}
ctr={'Id':'abc','Name':'/p-backend-1','Image':'sha256:abc','Config':basecc.copy(),'HostConfig':basehc,'State':{'Status':'running','Restarting':False},'Mounts':[],'NetworkSettings':{'Networks':{'p_default':{}}}}
cfg={'name':'p','services':{'backend':{}},'networks':{'default':{'name':'p_default'}}}
out=[]
for case in ['baseline','missing-HostConfig','missing-Env-both','redacted-workingdir-mismatch','undeclared-resource-limit','restart-retry-mismatch']:
 c=json.loads(json.dumps(ctr)); i=json.loads(json.dumps(img)); f=json.loads(json.dumps(cfg))
 if case=='missing-HostConfig':del c['HostConfig']
 if case=='missing-Env-both':del c['Config']['Env'];del i['Config']['Env']
 if case=='redacted-workingdir-mismatch':i['Config']['WorkingDir']='/app/a:b';c['Config']['WorkingDir']='/app/c:d'
 if case=='undeclared-resource-limit':c['HostConfig']['Memory']=536870912
 if case=='restart-retry-mismatch':f['services']['backend']['restart']='on-failure';c['HostConfig']['RestartPolicy']={'Name':'on-failure','MaximumRetryCount':5}
 with tempfile.TemporaryDirectory(prefix='qualitas-review-r2-') as d:
  paths=[]
  for n,v in enumerate([json.dumps(c),json.dumps(i),json.dumps(f),'',sha+'\n644 0:0 100',sha+'\n644 0:0 100\nPython 3.11.17']):
   p=Path(d)/str(n);p.write_text(v+'\n__RC__=0\n');paths.append(str(p))
  env=os.environ.copy();env['PRECHECK_ARGS']='\x1f'.join(['sha256:abc','p-backend','sha256:abc','p','/proj/compose.yml','/proj','/proj/.env','backend','2.20.1','2.20.1',sha,'401',sha,'/app/core/docx_builder.py','/app/qualitas.db,/app/uploads,/app/backups,/app/logs','review-temp'])
  r=subprocess.run(['python3','-',*paths],input=code,text=True,capture_output=True,env=env)
  out.append(case+': exit='+str(r.returncode)+' '+r.stdout.splitlines()[-1]);out += [x for x in r.stdout.splitlines() if '[FAIL]' in x]
print('script sha256='+hashlib.sha256(s.encode()).hexdigest());print('\n'.join(out))
