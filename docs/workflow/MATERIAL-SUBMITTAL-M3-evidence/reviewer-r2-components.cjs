// Independent component callback probe. Fake hooks/API, actual transpiled component logic; NOT a DOM/browser test.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root, 'react-app/node_modules/typescript'));
let active;
const React = {
 createElement(type, props, ...children) { return {type, props: {...props, children}}; },
 useState(init) { const h=active, i=h.i++; if (!(i in h.s)) h.s[i]=typeof init==='function'?init():init; return [h.s[i], v=>{h.s[i]=typeof v==='function'?v(h.s[i]):v;}]; },
 useReducer(reduce,arg,init) { const h=active,i=h.i++; if (!(i in h.s)) h.s[i]=init?init(arg):arg; return [h.s[i],a=>{h.s[i]=reduce(h.s[i],a);}]; },
 useRef(value) { return React.useState(()=>({current:value}))[0]; },
 useCallback(fn) { return fn; },
 useEffect(fn,deps) { const h=active,i=h.i++; if (!h.s[i] || deps.some((x,j)=>x!==h.s[i][j])) { h.s[i]=deps; h.effects.push(fn); } }
};
let api={getAuthenticatedFileUrl:url=>url};
const service = new Proxy({}, {get:(_,key)=>(...args)=>api[key](...args)});
const cache={};
function load(rel) {
 const filename=path.join(root,'react-app/src',rel);
 if(cache[filename]) return cache[filename];
 const mod={exports:{}};
 const localRequire=(name)=>{
  if(name==='react') return React;
  if(name.endsWith('.css')) return {};
  if(name.endsWith('/api')) return service;
  if(name.endsWith('/materialApi')) return { ...Object.fromEntries(['recordResult','correctResult','getSubmittal'].map(k=>[k,(...a)=>api[k](...a)])), MATERIAL_ENTITY:'material_rev',REPLY_CATEGORY:'reply',SUBMISSION_CATEGORIES:['catalogue'],RESULT_CODES:['Approved'] };
  if(name==='./materialText') return {useMaterialText:()=>k=>k};
  if(name==='./parts') return {Field:'Field',Modal:'Modal',Notice:'Notice'};
  return load(path.relative(path.join(root,'react-app/src'),path.resolve(path.dirname(filename),name))+'.ts');
 };
 const js=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 vm.runInNewContext('(function(require,module,exports){'+js+'\n})',{console,Date})(localRequire,mod,mod.exports);
 return cache[filename]=mod.exports;
}
function mount(component,props) { const h={s:[],i:0,effects:[],props}; h.render=()=>{active=h;h.i=0;h.tree=component(h.props);h.effects.splice(0).forEach(f=>f());return h.tree;};h.render();return h; }
function nodes(x) {if(!x || typeof x!=='object')return [];if(Array.isArray(x))return x.flatMap(nodes);return [x,...nodes(x.props?.children),...nodes(x.props?.footer)];}
function find(h,id) {return nodes(h.render()).find(x=>(x.props?.['data-testid'] ?? x.props?.testId)===id);}
const tick=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {resolve,reject,promise};}
(async()=>{
 const Files=load('components/MaterialSubmittal/RevisionFiles.tsx').default;
 const calls=[]; api.getEntityFiles=(_,id)=>{const d=deferred();calls.push({id,...d});return d.promise;};
 const props=id=>({revisionId:id,revNo:0,canUploadSubmission:true,canUploadReply:false,showReply:false});
 const a=mount(Files,props('A')),b=mount(Files,props('B')); // key={rev.id}: separate instances
 assert(find(b,'files-loading'));assert(!find(b,'upload-catalogue'));
 calls[1].resolve([{id:'B-file',category:'catalogue'}]);await tick();
 calls[0].resolve([{id:'A-file',category:'catalogue'}]);await tick();
 assert.equal(nodes(b.render()).find(x=>x.props?.['data-file-id'])?.props['data-file-id'],'B-file');
 b.props={...b.props,reloadToken:1};b.render();b.props={...b.props,reloadToken:2};b.render();
 calls[3].resolve([{id:'B-new',category:'catalogue'}]);await tick();calls[2].resolve([{id:'B-old',category:'catalogue'}]);await tick();
 assert.equal(nodes(b.render()).find(x=>x.props?.['data-file-id'])?.props['data-file-id'],'B-new');
 console.log('PASS R1 actual component: separate keyed instances, loading controls hidden, late A ignored by B, same-revision stale reload ignored.');
 api.getEntityFiles=async()=>[{id:'B-new',category:'catalogue'}];
 for(const unknown of [false,true]) {
  api.uploadFiles=async()=>{throw unknown?new Error('lost'):{response:{status:403,data:{detail:'denied'}}};};
  find(b,'upload-catalogue').props.onChange({target:{files:[{name:'x'}],value:'x'}});await tick();
  assert(find(b,unknown?'files-notice-unknown':'files-notice-rejected'));
 }
 api.deleteFile=async()=>{throw {response:{status:403,data:{detail:'locked'}}};};
 find(b,'delete-B-new').props.onClick();await tick();assert(find(b,'files-notice-rejected'));
 find(b,'files-notice-dismiss').props.onClick();assert(!find(b,'files-notice-rejected'));
 console.log('PASS R2 actual callbacks: upload rejected/unknown and delete rejected remain after successful GET; dismiss clears.');
 const Record=load('components/MaterialSubmittal/ResultDialogs.tsx').RecordResultDialog;
 const events=[],stored=[];let tries=0,done=0;
 api.getEntityFiles=async()=>stored.slice();
 api.uploadFiles=async(_,id,files)=>{events.push('upload:'+files.map(f=>f.name).join(','));stored.push(...files.map(f=>({id:f.name,file_name:f.name})));};
 api.recordResult=async()=>{events.push('result');if(++tries===1)throw {response:{status:403,data:{detail:'denied'}}};return {};};
 const d=mount(Record,{detail:{id:'S'},revisionId:'R',revNo:0,onClose(){},onDone(){done++;},onRefresh(){}});await tick();
 const fields=nodes(d.render()).find(x=>x.props?.f);fields.props.f.set('externalDecisionMaker','Reviewer');
 find(d,'reply-files').props.onChange({target:{files:[{name:'A.pdf'}]}});
 find(d,'save-result').props.onClick();await tick();
 assert(find(d,'retry-result'));assert(!find(d,'reply-pending'));
 find(d,'reply-files').props.onChange({target:{files:[{name:'B.pdf'}]}});
 find(d,'retry-result').props.onClick();await tick();
 assert.deepEqual(events,['upload:A.pdf','result','upload:B.pdf','result']);assert.equal(done,1);
 console.log('PASS R3 actual save/retry callbacks: upload A, rejected result, select B, upload B then result; A not resent; pending cleared.');
 api.recordResult=async()=>{throw new Error('lost');};api.getSubmittal=async()=>{throw new Error('offline');};
 const u=mount(Record,{detail:{id:'S'},revisionId:'R',revNo:0,onClose(){},onDone(){},onRefresh(){}});await tick();
 find(u,'save-result').props.onClick();await tick();assert.equal(find(u,'reply-files').props.disabled,true);assert(find(u,'recheck'));assert.equal(find(u,'save-result').props.disabled,true);
 console.log('PASS unknown result: picker and save disabled, recheck available.');
})().catch(e=>{console.error(e);process.exitCode=1;});
