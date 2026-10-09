// M6 R2 acceptance probe for review R1 (and the form side of R3). Same technique as the reviewer's reviewer-r1-form-probe.mjs:
// the REAL RegisterDialog.tsx and the REAL runSaveFlow (utils/saveFlow) are bundled with esbuild; React hooks, the API and the
// surrounding UI are deterministic adapters. The API adapter is a small fake SERVER: it keeps records, honours the request id
// (a repeated add returns the first record), applies edits, counts attachments, and can lose a response after committing.
// Not a browser. Run from the repo root: node docs/workflow/MATERIAL-SUBMITTAL-M6-evidence/r2-form-probe.mjs
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(resolve('react-app/package.json'));
const { build } = require('esbuild');
const tmp = mkdtempSync(join(tmpdir(), 'm6-r2-form-'));
const stub = `
const G=globalThis;
export function useState(v){const i=G.cursor++;if(!(i in G.slots))G.slots[i]=typeof v==='function'?v():v;return [G.slots[i],x=>G.slots[i]=typeof x==='function'?x(G.slots[i]):x]}
export function useRef(v){const i=G.cursor++;return G.slots[i]??=({current:v})}
export const createElement=(type,props,...children)=>({type,props:{...props,children}});
export default {createElement};
export const toast={warning(m){G.toasts.push(['warning',m])},error(m){G.toasts.push(['error',m])}};
export const useLanguage=()=>({t:k=>k});export const useMaterialText=()=>((k,p)=>p?k+':'+JSON.stringify(p):k);
export const useDraftGuard=()=>({requestClose:f=>f(),release(){}});
export const MATERIAL_ENTITY='material_rev',PHOTO_CATEGORY='photo';
const S=()=>G.server;
const item=(r)=>({...r.fields,submittalId:r.id,revisionId:'rev-'+r.id,documentNumber:'MSA-'+r.n,vendorId:r.vendorId,result:r.fields.resultCode});
export async function findDuplicateMaterials(pid,p){S().dupCalls++;await G.wait();if(S().dupFail)throw new Error('dup check down');return S().dups}
export async function registerMaterialOnce(body,rid){const s=S();s.posts++;await G.wait();
  let r=s.records.find(x=>x.rid===rid);
  if(!r){const {projectId,vendorId,...fields}=body;r={id:'s'+(s.records.length+1),n:s.records.length+1,rid,vendorId,fields:{...fields}};s.records.push(r)}
  if(s.loseNext){s.loseNext=false;const e=new Error('response lost');throw e}
  return item(r)}
export async function updateRegistered(id,changes){const s=S();s.puts.push(changes);await G.wait();const r=s.records.find(x=>x.id===id);Object.assign(r.fields,changes);return item(r)}
export async function uploadFiles(entity,rev,files){const s=S();await G.wait();if(s.photoFail>0){s.photoFail--;const e=new Error('photo failed');e.response={status:500};throw e}
  s.attachments[rev]=(s.attachments[rev]??0)+files.length;return files.map(()=>({}))}
export async function deleteFile(){}
export function classifyWriteFailure(e){const st=e?.response?.status;return st===undefined||st>=500?{kind:'unknown'}:{kind:'rejected'}}
export const describeSaveError=(e)=>String(e?.message??e);
export const presentOutcome=o=>({close:o.status==='saved'||o.status==='saved-reload-failed',notice:o.status==='failed'?{level:'error',text:o.message}:null});
`;
let failures = 0;
const results = [];
const check = (label, fn) => { try { fn(); results.push('PASS ' + label); } catch (e) { failures++; results.push('FAIL ' + label + ' — ' + e.message); } };
try {
    await build({ entryPoints: [resolve('react-app/src/components/MaterialSubmittal/RegisterDialog.tsx')], bundle: true, platform: 'node', format: 'esm',
        tsconfigRaw: { compilerOptions: { jsx: 'react' } }, outfile: join(tmp, 'form.mjs'), logLevel: 'error',
        plugins: [{ name: 'adapters', setup(b) {
            b.onResolve({ filter: /.*/ }, (a) => {
                if (a.kind === 'entry-point' || a.path.includes('saveFlow')) return;
                if (a.path === 'react' || a.path === 'sonner' || /LanguageContext|materialApi|services\/api|LeaveGuard|materialText|saveErrors|utils\/materialSubmittal/.test(a.path)) return { path: 'adapter', namespace: 'adapter' };
                return { path: a.path, namespace: 'ui' };
            });
            b.onLoad({ filter: /.*/, namespace: 'adapter' }, () => ({ contents: stub, loader: 'js' }));
            b.onLoad({ filter: /.*/, namespace: 'ui' }, (a) => ({ contents: a.path.endsWith('.css') ? 'export default {}' : 'export default function UI(){}', loader: 'js' }));
        } }] });
    const { default: Form } = await import(pathToFileURL(join(tmp, 'form.mjs')));
    let editItem = null, closed = 0;
    const reset = (item = null) => {
        editItem = item; closed = 0;
        Object.assign(globalThis, { slots: [], cursor: 0, toasts: [], wait: () => new Promise((r) => setTimeout(r, 2)),
            server: { records: [], posts: 0, puts: [], dupCalls: 0, dups: [], dupFail: false, loseNext: false, photoFail: 0, attachments: {} } });
    };
    const render = () => { globalThis.cursor = 0; return Form({ projectId: 'P1', vendors: [{ id: 'V1', name: 'V' }, { id: 'V2', name: 'W' }], item: editItem, onClose() { closed++; }, onSaved() {}, onReload: async () => true }); };
    const find = (x, p) => { if (!x || typeof x !== 'object') return null; if (p(x)) return x; for (const v of Object.values(x)) { if (Array.isArray(v)) { for (const c of v) { const r = find(c, p); if (r) return r; } } else { const r = find(v, p); if (r) return r; } } return null; };
    const byId = (id) => find(render(), (x) => x.props?.['data-testid'] === id);
    const confirm = () => find(render(), (x) => x.props && 'isOpen' in x.props && 'onConfirm' in x.props);
    const settle = () => new Promise((r) => setTimeout(r, 60));
    const type = (id, value) => byId(id).props.onChange({ target: { value } });
    const photos = (n) => find(render(), (x) => x.props?.id === 'material-register-photos').props.onPendingFilesChange(Array.from({ length: n }, () => ({})));
    const save = async () => { byId('register-save').props.onClick(); await settle(); };
    const fill = () => { type('register-vendor', 'V1'); type('register-name', 'Material A'); };
    const srv = () => globalThis.server;

    // 1. record created, photo fails; the user changes the name and retries → same record edited, not a second one
    reset(); fill(); photos(1); srv().photoFail = 1;
    await save();
    check('1a record created once although the photo failed', () => assert.equal(srv().records.length, 1));
    type('register-name', 'Material B'); await save();
    check('1b retry after edit: still ONE record, edited in place', () => { assert.equal(srv().records.length, 1); assert.equal(srv().posts, 1); assert.deepEqual(srv().puts, [{ name: 'Material B' }]); });
    check('1c photo finished on the retry, exactly once', () => assert.deepEqual(srv().attachments, { 'rev-s1': 1 }));
    check('1d dialog closed after the complete save', () => assert.equal(closed, 1));

    // 2. A → B written (photo failed), back to A, retry → A is sent (baseline = last written, not the first values)
    reset(); fill(); photos(1); srv().photoFail = 2;
    await save(); type('register-name', 'Material B'); await save();
    type('register-name', 'Material A'); await save();
    check('2 A→B→A: final content A, one record, photo once', () => {
        assert.equal(srv().records.length, 1); assert.equal(srv().records[0].fields.name, 'Material A');
        assert.deepEqual(srv().puts, [{ name: 'Material B' }, { name: 'Material A' }]); assert.deepEqual(srv().attachments, { 'rev-s1': 1 });
    });

    // 3. the add commits but the answer is lost → retry is safe (same request id) and finishes the same record
    reset(); fill(); photos(2); srv().loseNext = true;
    await save();
    check('3a lost answer: user told it is safe to retry, Save usable, contractor locked', () => {
        assert.ok(globalThis.toasts.some(([, m]) => m === 'unknownRetrySafe'));
        assert.equal(byId('register-save').props.disabled, false); assert.equal(byId('register-vendor').props.disabled, true);
    });
    type('register-name', 'Material A2'); await save();
    check('3b retry: two requests, ONE record (returned by request id), then edited; photos once', () => {
        assert.equal(srv().posts, 2); assert.equal(srv().records.length, 1); assert.equal(srv().records[0].fields.name, 'Material A2');
        assert.deepEqual(srv().attachments, { 'rev-s1': 2 });
    });

    // 4. double click (also during the async duplicate check) → one check, one add
    reset(); fill();
    byId('register-save').props.onClick(); byId('register-save').props.onClick(); await settle();
    check('4 double click: 1 duplicate check, 1 POST, 1 record', () => { assert.equal(srv().dupCalls, 1); assert.equal(srv().posts, 1); assert.equal(srv().records.length, 1); });
    reset(); fill(); byId('register-save').props.onClick();
    check('4c button disabled immediately after the click', () => assert.equal(byId('register-save').props.disabled, true));
    await settle();

    // 5. a duplicate exists (server-side, any page): warn; cancel → nothing; continue → saved
    reset(); fill(); srv().dups = [{ submittalId: 'x', documentNumber: 'MSA-777' }];
    await save();
    check('5a duplicate: question shown with its number, nothing written', () => { assert.equal(confirm().props.isOpen, true); assert.match(confirm().props.message, /MSA-777/); assert.equal(srv().posts, 0); });
    confirm().props.onCancel(); await settle();
    check('5b cancel: nothing written', () => assert.equal(srv().posts, 0));
    await save(); confirm().props.onConfirm(); await settle();
    check('5c save anyway: one record', () => assert.equal(srv().records.length, 1));

    // 6. the duplicate check fails: said so (not "no duplicate"); re-check or skip
    reset(); fill(); srv().dupFail = true;
    await save();
    check('6a check failed: told, nothing written', () => { assert.equal(confirm().props.title, 'duplicateCheckFailedTitle'); assert.equal(confirm().props.confirmText, 'saveWithoutCheck'); assert.equal(srv().posts, 0); });
    confirm().props.onCancel(); srv().dupFail = false; srv().dups = [{ submittalId: 'x', documentNumber: 'MSA-9' }];
    await save();
    check('6b Save again re-checks and now finds the duplicate', () => { assert.equal(srv().dupCalls, 2); assert.equal(confirm().props.title, 'duplicateTitle'); });
    confirm().props.onCancel(); srv().dupFail = true; await save(); confirm().props.onConfirm(); await settle();
    check('6c skip the failed check and save: one record', () => assert.equal(srv().records.length, 1));

    // 7. edit an existing record: A → B written, photo failed, back to A → A is sent
    reset({ submittalId: 's1', revisionId: 'rev-s1', documentNumber: 'MSA-1', vendorId: 'V1', name: 'Material A', result: 'Approved', approvedDate: '2026-10-01' });
    srv().records.push({ id: 's1', n: 1, rid: null, vendorId: 'V1', fields: { name: 'Material A', resultCode: 'Approved', approvedDate: '2026-10-01' } });
    photos(1); srv().photoFail = 1; type('register-name', 'Material B'); await save();
    type('register-name', 'Material A'); await save();
    check('7 edit A→B→A: both changes sent, final A, no add request', () => {
        assert.equal(srv().posts, 0); assert.deepEqual(srv().puts.map((p) => p.name), ['Material B', 'Material A']);
        assert.equal(srv().records[0].fields.name, 'Material A'); assert.deepEqual(srv().attachments, { 'rev-s1': 1 });
    });
} catch (e) {
    failures++; results.push('ERROR ' + (e.stack || e));
} finally {
    rmSync(tmp, { recursive: true, force: true });
}
console.log(results.join('\n'));
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} passed, ${failures} failed`);
process.exitCode = failures ? 1 : 0;
