// Executes the actual RegisterDialog + runSaveFlow with deterministic hook/API/UI adapters (not a browser).
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd();const require=createRequire(resolve('react-app/package.json'));const {build}=require('esbuild');
const tmp=mkdtempSync(join(tmpdir(),'m6-form-review-'));
const stub=`
const G=globalThis;
export function useState(v){const i=G.cursor++;if(!(i in G.slots))G.slots[i]=typeof v==='function'?v():v;return [G.slots[i],x=>G.slots[i]=typeof x==='function'?x(G.slots[i]):x]}
export function useRef(v){const i=G.cursor++;return G.slots[i]??=( {current:v} )}
export function useMemo(f){const i=G.cursor++;return G.slots[i]??=f()}
export const createElement=(type,props,...children)=>({type,props:{...props,children}});
export default {createElement};
export const toast={warning(){},error(){}};
export const useLanguage=()=>({t:k=>k});export const useMaterialText=()=>((k)=>k);
export const useDraftGuard=()=>({requestClose:f=>f(),release(){}});
export const MATERIAL_ENTITY='material_rev',PHOTO_CATEGORY='photo';
export async function listApproved(){return {items:[],total:0}}
export async function registerMaterial(p){G.creates++; if(G.unknown)throw new Error('lost response');return {submittalId:'s'+G.creates,revisionId:'r'+G.creates,...p}}
export async function updateRegistered(id,p){G.updates++;return {submittalId:id,revisionId:'r1',...p}}
export async function uploadFiles(){throw new Error('photo failed')}
export async function deleteFile(){}
export const classifyWriteFailure=()=>({kind:'unknown'});
export const describeSaveError=()=> 'failure';export const presentOutcome=o=>({close:o.status==='saved'});
`;
try{
 await build({entryPoints:[resolve('react-app/src/components/MaterialSubmittal/RegisterDialog.tsx')],bundle:true,platform:'node',format:'esm',tsconfigRaw:{compilerOptions:{jsx:'react'}},outfile:join(tmp,'form.mjs'),plugins:[{name:'review-adapters',setup(b){
 b.onResolve({filter:/.*/},args=>{
 if(args.kind==='entry-point'||args.path.includes('saveFlow'))return;
 if(args.path==='react'||args.path==='sonner'||/LanguageContext|materialApi|services\/api|LeaveGuard|materialText|saveErrors|utils\/materialSubmittal/.test(args.path))return {path:'adapter',namespace:'review'};
 return {path:args.path,namespace:'ui'};
 });
 b.onLoad({filter:/.*/,namespace:'review'},()=>({contents:stub,loader:'js'}));
 b.onLoad({filter:/.*/,namespace:'ui'},args=>({contents:args.path.endsWith('.css')?'export default {}':'export default function UI(){}',loader:'js'}));
 }}]});
 const {default:Form}=await import(pathToFileURL(join(tmp,'form.mjs')));
 function reset(){Object.assign(globalThis,{slots:[],cursor:0,creates:0,updates:0,unknown:false})}
 function render(){globalThis.cursor=0;return Form({projectId:'P1',vendors:[{id:'V1',name:'V'}],onClose(){},onSaved(){},onReload:async()=>true})}
 function find(x,p){if(!x||typeof x!=='object')return null;if(p(x))return x;for(const v of Object.values(x)){if(Array.isArray(v)){for(const c of v){const r=find(c,p);if(r)return r}}else{const r=find(v,p);if(r)return r}}return null}
 const byId=(id)=>find(render(),x=>x.props?.['data-testid']===id);
 const tick=()=>new Promise(r=>setTimeout(r,10));
 function fields(){byId('register-vendor').props.onChange({target:{value:'V1'}});byId('register-name').props.onChange({target:{value:'Material A'}})}
 reset();fields();find(render(),x=>x.props?.id==='material-register-photos').props.onPendingFilesChange([{}]);
 byId('register-save').props.onClick();await tick();
 console.log('partial photo failure: creates after first save =',globalThis.creates);
 byId('register-name').props.onChange({target:{value:'Material B'}});byId('register-save').props.onClick();await tick();
 console.log('partial failure + changed form + retry: creates =',globalThis.creates,'updates =',globalThis.updates,'(expected creates 1, update original)');
 reset();fields();globalThis.unknown=true;byId('register-save').props.onClick();await tick();
 const retry=byId('register-save');console.log('unknown record outcome: Save disabled =',retry.props.disabled);
 retry.props.onClick();await tick();console.log('unknown outcome + retry: POST calls =',globalThis.creates,'(expected no blind repeat)');
 reset();fields();const click=byId('register-save').props.onClick;click();click();await tick();
 console.log('two clicks during async duplicate check: POST calls =',globalThis.creates,'(expected 1)');
}finally{rmSync(tmp,{recursive:true,force:true})}
