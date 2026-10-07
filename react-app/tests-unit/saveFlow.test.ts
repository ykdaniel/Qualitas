import test from 'node:test';
import assert from 'node:assert/strict';
import { followUpOf, runSaveFlow, sameWrite, SaveFlowSteps, SaveOutcome } from '../src/utils/saveFlow';
import { describeSaveError, presentOutcome } from '../src/utils/saveErrors';

const file = (name: string) => ({ name } as unknown as File);
const axiosErr = (status: number | undefined, data?: unknown) => ({ isAxiosError: true, message: 'x', response: status === undefined ? undefined : { status, data } });

// zh-like dictionary, just enough to prove which keys are used
const DICT: Record<string, string> = {
    'common.saveFailed': '儲存失敗',
    'dateField.raiseDate': '提出日期',
    'dateField.closeoutDate': '結案日期',
    'dateIssue.invalid_calendar': '不是有效日期',
    'dateIssue.closeout_after_due': '晚於到期日',
    'dateIssue.unknown': '有問題',
    'saveFlow.network': '網路連線失敗',
    'saveFlow.server': '伺服器錯誤 {status}',
    'saveFlow.forbidden': '沒有權限',
    'saveFlow.conflict': '衝突',
    'saveFlow.failedKeep': '尚未保存，內容已保留。{message}',
    'saveFlow.savedIncomplete': '已保存但未完成：{details}',
    'saveFlow.savedReloadFailed': '已保存，重新載入失敗',
    'saveFlow.step.upload': '上傳{what}失敗（{message}）',
    'saveFlow.step.delete': '移除檔案失敗（{message}）',
    'saveFlow.category.attachment': '附件',
    'saveFlow.category.defectPhoto': '缺失照片',
};
const t = (key: string, params?: Record<string, string | number>) => {
    let v = DICT[key] ?? key;
    for (const [k, val] of Object.entries(params ?? {})) v = v.replace(new RegExp(`{${k}}`, 'g'), String(val));
    return v;
};

const steps = (over: Partial<SaveFlowSteps> = {}) => {
    const calls: string[] = [];
    const base: SaveFlowSteps = {
        writeRecord: async () => { calls.push('write'); return 'REC-1'; },
        uploads: [], deletedFileIds: [],
        upload: async (id, g) => { calls.push(`upload:${id}:${g.category}`); return [{ id: `f-${g.category}` }]; },
        remove: async (id) => { calls.push(`remove:${id}`); },
        reload: async () => { calls.push('reload'); return true; },
        describe: (e) => `E(${(e as Error).message})`,
    };
    return { calls, s: { ...base, ...over } as SaveFlowSteps };
};

test('clean success: write, deletes, uploads, reload — and the outcome says saved', async () => {
    const { calls, s } = steps({ uploads: [{ category: 'attachment', files: [file('a')] }], deletedFileIds: ['d1', 'd1', 'd2'] });
    const out = await runSaveFlow(s);
    assert.deepEqual(out, { status: 'saved' });
    assert.deepEqual(calls, ['write', 'remove:d1', 'remove:d2', 'upload:REC-1:attachment', 'reload']);   // duplicate delete ids collapse
});

test('record write fails: nothing else is attempted and the outcome is failed with the described message', async () => {
    const base = steps();
    base.s.writeRecord = async () => { base.calls.push('write'); throw new Error('422'); };
    base.s.uploads = [{ category: 'attachment', files: [file('a')] }];
    base.s.deletedFileIds = ['d1'];
    const out = await runSaveFlow(base.s);
    assert.deepEqual(out, { status: 'failed', message: 'E(422)' });
    assert.deepEqual(base.calls, ['write']);        // no delete, no upload, no reload
});

test('an upload failing after the record was written is NOT reported as "not saved": incomplete, id kept, only the failed group remains', async () => {
    const { calls, s } = steps({
        uploads: [{ category: 'defectPhoto', files: [file('a')] }, { category: 'attachment', files: [file('b')] }],
        upload: async (id, g) => { calls.push(`upload:${g.category}`); if (g.category === 'attachment') throw new Error('net'); return [{ id: 'f1' }]; },
    });
    const out = await runSaveFlow(s) as Extract<SaveOutcome, { status: 'saved-incomplete' }>;
    assert.equal(out.status, 'saved-incomplete');
    assert.equal(out.id, 'REC-1');
    assert.deepEqual(out.uploadedCategories, ['defectPhoto']);
    assert.deepEqual(out.remainingUploads.map(g => g.category), ['attachment']);
    assert.deepEqual(out.failures, [{ step: 'upload', category: 'attachment', message: 'E(net)' }]);
    assert.deepEqual(out.uploaded, { defectPhoto: [{ id: 'f1' }] });
    assert.equal(out.reloadFailed, false);
    assert.ok(calls.includes('reload'), 'the list is still reloaded so it shows the saved record');
});

test('a failed delete stays in the retry list; the ones that worked do not', async () => {
    const { s } = steps({ deletedFileIds: ['ok', 'bad'], remove: async (id) => { if (id === 'bad') throw new Error('gone'); } });
    const out = await runSaveFlow(s) as Extract<SaveOutcome, { status: 'saved-incomplete' }>;
    assert.equal(out.status, 'saved-incomplete');
    assert.deepEqual(out.remainingDeletes, ['bad']);
    assert.deepEqual(out.failures, [{ step: 'delete', message: 'E(gone)' }]);
});

test('retry with reuseId: the record is not written again and only the leftover files are processed (no duplicate upload, no repeat delete)', async () => {
    const { calls, s } = steps({ reuseId: 'REC-1', uploads: [{ category: 'attachment', files: [file('b')] }], deletedFileIds: ['bad'] });
    const out = await runSaveFlow(s);
    assert.deepEqual(out, { status: 'saved' });
    assert.deepEqual(calls, ['remove:bad', 'upload:REC-1:attachment', 'reload']);   // no 'write'
});

test('only the reload fails: everything is stored, nothing to retry — saved-reload-failed (a throw counts too)', async () => {
    const a = await runSaveFlow(steps({ reload: async () => false }).s);
    assert.deepEqual(a, { status: 'saved-reload-failed', id: 'REC-1' });
    const b = await runSaveFlow(steps({ reload: async () => { throw new Error('boom'); } }).s);
    assert.deepEqual(b, { status: 'saved-reload-failed', id: 'REC-1' });
});

test('file failure AND reload failure: incomplete, with reloadFailed set', async () => {
    const out = await runSaveFlow(steps({ deletedFileIds: ['x'], remove: async () => { throw new Error('n'); }, reload: async () => false }).s) as Extract<SaveOutcome, { status: 'saved-incomplete' }>;
    assert.equal(out.status, 'saved-incomplete');
    assert.equal(out.reloadFailed, true);
});

test('onRecordSaved fires as soon as the id is known — also for reuseId — and before any follow-up', async () => {
    const seen: string[] = [];
    const { s } = steps({ onRecordSaved: (id) => seen.push(`saved:${id}`), remove: async (id) => { seen.push(`remove:${id}`); }, deletedFileIds: ['d'] });
    await runSaveFlow(s);
    assert.deepEqual(seen, ['saved:REC-1', 'remove:d']);
});

test('a record without a usable id never uploads to a made-up id: the groups stay pending', async () => {
    const { calls, s } = steps({ writeRecord: async () => '', uploads: [{ category: 'attachment', files: [file('a')] }] });
    const out = await runSaveFlow(s) as Extract<SaveOutcome, { status: 'saved-incomplete' }>;
    assert.equal(out.status, 'saved-incomplete');
    assert.deepEqual(out.remainingUploads.map(g => g.category), ['attachment']);
    assert.ok(!calls.some(c => c.startsWith('upload')));
});

test('groups without files are skipped', async () => {
    const { calls, s } = steps({ uploads: [{ category: 'attachment', files: [] }] });
    await runSaveFlow(s);
    assert.ok(!calls.some(c => c.startsWith('upload')));
});

test('sameWrite: only an identical payload for the same record id counts as already written', () => {
    const last = { id: 'A', key: JSON.stringify({ x: 1 }) };
    assert.equal(sameWrite(last, 'A', { x: 1 }), true);
    assert.equal(sameWrite(last, 'A', { x: 2 }), false);
    assert.equal(sameWrite(last, 'B', { x: 1 }), false);
    assert.equal(sameWrite(null, 'A', { x: 1 }), false);
    assert.equal(sameWrite(last, 'new', { x: 1 }), false);
    assert.equal(sameWrite(last, null, { x: 1 }), false);
});

// ---- describeSaveError ----------------------------------------------------------------------------------------------------

test('a date 422 becomes "<field label>：<reason>", one line per distinct problem, no Pydantic text or loc path', () => {
    const e = axiosErr(422, { detail: [{ type: 'value_error.date', loc: ['body', 'raiseDate'], msg: 'date is not a real calendar date', input: '2026-02-30', code: 'invalid_calendar' }] });
    assert.equal(describeSaveError(e, t), '提出日期：不是有效日期');
    const two = axiosErr(422, { detail: [
        { loc: ['body', 'raiseDate'], msg: 'm', code: 'invalid_calendar' },
        { loc: ['body', 'closeoutDate'], msg: 'm', code: 'closeout_after_due' },
        { loc: ['body', 'raiseDate'], msg: 'm', code: 'invalid_calendar' },
    ] });
    assert.equal(describeSaveError(two, t), '提出日期：不是有效日期；結案日期：晚於到期日');
    assert.equal(describeSaveError(axiosErr(422, { detail: [{ loc: ['body', 'raiseDate'], msg: 'm', code: 'brand_new_code' }] }), t), '提出日期：有問題');
});

test('an unknown field name is shown as sent, a plain-text detail (403/409/400) as written', () => {
    assert.equal(describeSaveError(axiosErr(422, { detail: [{ loc: ['body', 'weird'], msg: 'field required' }] }), t), 'weird：field required');
    assert.equal(describeSaveError(axiosErr(403, { detail: 'Closed NCR needs the close permission' }), t), 'Closed NCR needs the close permission');
    assert.equal(describeSaveError(axiosErr(409, { detail: 'Record was modified by someone else' }), t), 'Record was modified by someone else');
    assert.equal(describeSaveError(axiosErr(403, {}), t), '沒有權限');
    assert.equal(describeSaveError(axiosErr(409, {}), t), '衝突');
});

test('network failure, server error and unknown errors: friendly fixed lines, the response body is never shown', () => {
    assert.equal(describeSaveError(axiosErr(undefined), t), '網路連線失敗');
    const dump = axiosErr(500, { detail: 'ResponseValidationError: 1 validation error for NCR\n  raiseDate\n    Value error ...' });
    assert.equal(describeSaveError(dump, t), '伺服器錯誤 500');
    assert.equal(describeSaveError(axiosErr(503, 'html'), t), '伺服器錯誤 503');
    assert.equal(describeSaveError(new Error('Cannot read properties of undefined'), t), '儲存失敗');
    assert.equal(describeSaveError('x', t), '儲存失敗');
    assert.equal(describeSaveError(axiosErr(400, {}), t), '儲存失敗');
});

// ---- presentOutcome -------------------------------------------------------------------------------------------------------

test('presentOutcome: incomplete saves use the banner only; other outcomes keep their toast', () => {
    assert.deepEqual(presentOutcome({ status: 'saved' }, t), { close: true });
    assert.deepEqual(presentOutcome({ status: 'saved-reload-failed', id: 'A' }, t), { close: true, notice: { level: 'warning', text: '已保存，重新載入失敗' } });
    assert.deepEqual(presentOutcome({ status: 'failed', message: '提出日期：不是有效日期' }, t), { close: false, notice: { level: 'error', text: '尚未保存，內容已保留。提出日期：不是有效日期' } });
    const inc = presentOutcome({
        status: 'saved-incomplete', id: 'A', reloadFailed: false, remainingDeletes: [], uploadedCategories: [], uploaded: {}, remainingUploads: [],
        failures: [{ step: 'upload', category: 'attachment', message: 'E(net)' }, { step: 'delete', message: 'E(gone)' }],
    }, t);
    assert.equal(inc.close, false);
    assert.equal(inc.notice, undefined);
    const reloadFailure = presentOutcome({ status: 'saved-incomplete', id: 'A', reloadFailed: true, remainingDeletes: [], uploadedCategories: [], uploaded: {}, remainingUploads: [], failures: [] }, t);
    assert.deepEqual(reloadFailure, { close: false });
});

test('followUpOf: only an incomplete save leaves work; categories are de-duplicated; `created` is carried through', () => {
    const inc = { status: 'saved-incomplete', id: 'A', failures: [], remainingUploads: [{ category: 'attachment', files: [file('a')] }, { category: 'attachment', files: [file('b')] }, { category: 'defectPhoto', files: [file('c')] }], remainingDeletes: ['x', 'y'], uploadedCategories: [], uploaded: {}, reloadFailed: false } as SaveOutcome;
    assert.deepEqual(followUpOf(inc, true), { id: 'A', created: true, categories: ['attachment', 'defectPhoto'], deletes: 2, failures: [], reloadFailed: false });
    if (inc.status === 'saved-incomplete') {
        inc.failures = [{ step: 'delete', message: 'remove failed' }];
        inc.reloadFailed = true;
        assert.deepEqual(followUpOf(inc, true)?.failures, inc.failures);
        assert.equal(followUpOf(inc, true)?.reloadFailed, true);
    }
    assert.deepEqual(followUpOf(inc, false)?.created, false);
    for (const o of [{ status: 'saved' }, { status: 'saved-reload-failed', id: 'A' }, { status: 'failed', message: 'm' }] as SaveOutcome[]) assert.equal(followUpOf(o, true), null, o.status);
});
