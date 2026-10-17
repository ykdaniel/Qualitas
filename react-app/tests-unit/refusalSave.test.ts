// REFUSAL-DIALOG-2026-002: refused / failed saves in the refusal dialog (utils/refusal.ts).
// D1 a 422 lists its fields one per line; D3 a save whose form stayed open says the input is kept, worded differently
// for a refusal (4xx: "correct it and save again") and a failure (5xx / network: "could not confirm whether it was saved").
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeRefusal } from '../src/utils/refusal';
import { describeSaveError, fieldErrorLines } from '../src/utils/saveErrors';

const fs = await import('node:fs');

// a stub dictionary: just enough to prove which keys are used (the real wording is checked at the end)
const DICT: Record<string, string> = {
    'refusal.title.save': '無法儲存',
    'refusal.title.saveFailed': '儲存失敗',
    'refusal.title.delete': '無法刪除',
    'refusal.title.deleteFailed': '刪除失敗',
    'refusal.fieldErrors': 'FIELDS',
    'refusal.keptInput': 'KEPT',
    'refusal.keptInputUnconfirmed': 'KEPT?',
    'refusal.keptInputOnly': 'KEPT.',
    'refusal.uncoded': 'UNCODED',
    'refusal.unexpected': 'UNEXPECTED',
    'refusal.network': 'NETWORK',
    'refusal.server': 'SERVER {status}',
    'refusal.notFound': 'GONE',
    'refusal.forbidden': 'FORBIDDEN',
    'refusal.conflict': 'CONFLICT',
    'refusal.listSep': '、',
    'refusal.code.PERMISSION_DENIED': 'NO PERMISSION {permissions}',
    'common.saveFailed': '儲存失敗',
    'dateField.raiseDate': '提出日期',
    'dateField.closeoutDate': '結案日期',
    'dateIssue.invalid_calendar': '不是有效日期',
    'dateIssue.closeout_after_due': '晚於到期日',
    'dateIssue.unknown': '有問題',
};
const t = (key: string, params?: Record<string, string | number>) => {
    let v = DICT[key] ?? key;
    for (const [k, val] of Object.entries(params ?? {})) v = v.replace(new RegExp(`{${k}}`, 'g'), String(val));
    return v;
};
const axiosErr = (status: number | undefined, data?: unknown) => ({ isAxiosError: true, message: 'Request failed with status code 422', response: status === undefined ? undefined : { status, data } });
const dateErrors = axiosErr(422, { detail: [
    { loc: ['body', 'raiseDate'], code: 'invalid_calendar', msg: 'date is not a real calendar date' },
    { loc: ['body', 'closeoutDate'], code: 'closeout_after_due', msg: 'x' },
    { loc: ['body', 'raiseDate'], code: 'invalid_calendar', msg: 'again' },
] });

test('D1: a 422 is one line per field (de-duplicated), never the raw list or the axios message', () => {
    const v = describeRefusal(dateErrors, t, 'save', 'zh')!;
    assert.deepEqual(v, { title: '無法儲存', message: 'FIELDS', items: ['提出日期：不是有效日期', '結案日期：晚於到期日'] });
    // a Pydantic item without a code: label (or raw field name) plus its own message
    const plain = describeRefusal(axiosErr(422, { detail: [{ loc: ['body', 'weird'], msg: 'field required' }] }), t, 'save', 'en')!;
    assert.deepEqual(plain.items, ['weird：field required']);
    // an empty list says something generic rather than an empty dialog
    assert.deepEqual(describeRefusal(axiosErr(422, { detail: [] }), t, 'save', 'zh'), { title: '無法儲存', message: 'UNEXPECTED' });
});

test('fieldErrorLines and describeSaveError agree (describeSaveError joins the same lines)', () => {
    const detail = (dateErrors.response!.data as { detail: unknown[] }).detail;
    assert.deepEqual(fieldErrorLines(detail, t), ['提出日期：不是有效日期', '結案日期：晚於到期日']);
    assert.equal(describeSaveError(dateErrors, t), '提出日期：不是有效日期；結案日期：晚於到期日');
    assert.deepEqual(fieldErrorLines([null, { msg: '' }, 'x'], t), []);
});

test('D3: a refused save whose form stayed open says the input is kept: "correct it and save again"', () => {
    for (const err of [
        dateErrors,
        axiosErr(400, { detail: 'Cannot close: missing fields' }),
        axiosErr(403, { detail: 'x', code: 'PERMISSION_DENIED', params: { permissions: ['ncr:close:all'] } }),
        axiosErr(409, {}),
    ]) {
        const v = describeRefusal(err, t, 'save', 'zh', { keepsInput: true })!;
        assert.equal(v.title, '無法儲存');
        assert.equal(v.note, 'KEPT', JSON.stringify(err.response));
    }
    // the coded reason itself is unchanged by the note
    const coded = describeRefusal(axiosErr(403, { detail: 'x', code: 'PERMISSION_DENIED', params: { permissions: ['ncr:close:all'] } }), t, 'save', 'zh', { keepsInput: true })!;
    assert.equal(coded.message, 'NO PERMISSION ncr:close:all');
});

test('D3: a failed save (5xx, network, unexpected) says it could not confirm the save, and still never shows the body', () => {
    const server = describeRefusal(axiosErr(500, { detail: 'Traceback ...' }), t, 'save', 'zh', { keepsInput: true })!;
    assert.deepEqual(server, { title: '儲存失敗', message: 'SERVER 500', note: 'KEPT?' });
    assert.equal(describeRefusal(axiosErr(undefined), t, 'save', 'en', { keepsInput: true })!.note, 'KEPT?');
    assert.equal(describeRefusal(new Error('boom'), t, 'save', 'zh', { keepsInput: true })!.note, 'KEPT?');
    assert.equal(describeRefusal(undefined, t, 'save', 'zh', { keepsInput: true })!.note, 'KEPT?');   // a page-side "failed" without an error
});

test('D3: no "correct it and save again" when saving again cannot work: the record is gone (404) or changed meanwhile', () => {
    const gone = describeRefusal(axiosErr(404, { detail: 'NCR not found' }), t, 'save', 'zh', { keepsInput: true })!;
    assert.deepEqual(gone, { title: '無法儲存', message: 'GONE' });
    const stale = describeRefusal(axiosErr(409, { detail: 'x', code: 'VERSION_CONFLICT', params: { docType: 'KM', number: 'W' } }), t, 'save', 'zh', { keepsInput: true })!;
    assert.equal(stale.note, undefined);
    assert.equal(describeRefusal(axiosErr(400, { detail: 'x', code: 'VERSION_CONFLICT', params: {} }), t, 'save', 'zh', { keepsInput: true })!.note, undefined);
});

test('D3 (user 2026-10-14, option a): a locked record only says the input is kept, never "correct it and save again"', () => {
    for (const kind of ['record', 'publish', 'qualityFields', 'evidence']) {
        const v = describeRefusal(axiosErr(400, { detail: 'x', code: 'RECORD_LOCKED', params: { docType: 'PQP', number: 'P-1', status: 'Approved', kind } }), t, 'save', 'zh', { keepsInput: true })!;
        assert.equal(v.note, 'KEPT.', kind);
    }
    // other refusals keep their wording; a 5xx stays "could not confirm"
    assert.equal(describeRefusal(axiosErr(400, { detail: 'x', code: 'INVALID_TRANSITION', params: {} }), t, 'save', 'zh', { keepsInput: true })!.note, 'KEPT');
    assert.equal(describeRefusal(axiosErr(500, { code: 'RECORD_LOCKED' }), t, 'save', 'zh', { keepsInput: true })!.note, 'KEPT?');
});

test('D3: no note unless asked, never for a delete, and never for a 401', () => {
    assert.equal(describeRefusal(axiosErr(400, { detail: 'x' }), t, 'save', 'zh')!.note, undefined);
    assert.equal(describeRefusal(axiosErr(400, { detail: 'x' }), t, 'save', 'zh', { keepsInput: false })!.note, undefined);
    assert.equal(describeRefusal(axiosErr(400, { detail: 'x' }), t, 'delete', 'zh', { keepsInput: true })!.note, undefined);
    assert.equal(describeRefusal(axiosErr(401, { detail: 'x' }), t, 'save', 'zh', { keepsInput: true }), null);
});

test('the new wording exists in both languages (LanguageContext)', () => {
    const src = fs.readFileSync('src/context/LanguageContext.tsx', 'utf8').replace(/\r\n/g, '\n');
    const zhStart = src.indexOf('\n  zh: {');
    assert.ok(zhStart > 0, 'zh block not found');
    for (const [lang, part] of [['en', src.slice(0, zhStart)], ['zh', src.slice(zhStart)]] as const) {
        for (const key of ['refusal.fieldErrors', 'refusal.keptInput', 'refusal.keptInputUnconfirmed', 'refusal.keptInputOnly']) {
            assert.match(part, new RegExp(`^ {4}'${key.replace(/\./g, '\\.')}': '[^']+',$`, 'm'), `${lang} ${key}`);
        }
    }
});

// ---- the six shared save codes, against the real dictionaries ------------------------------------------------------------
const REAL = (() => {
    const src = fs.readFileSync('src/context/LanguageContext.tsx', 'utf8').replace(/\r\n/g, '\n');
    const zhStart = src.indexOf('\n  zh: {');
    const dict = (part: string) => Object.fromEntries([...part.matchAll(/^ {4}'([^']+)': '((?:[^'\\]|\\.)*)',$/gm)].map(m => [m[1], m[2]]));
    const tr = (d: Record<string, string>) => (key: string, params?: Record<string, string | number>) => {
        let v = d[key] ?? key;
        for (const [k, val] of Object.entries(params ?? {})) v = v.replace(new RegExp(`{${k}}`, 'g'), String(val));
        return v;
    };
    return { en: tr(dict(src.slice(0, zhStart))), zh: tr(dict(src.slice(zhStart))) };
})();
const coded = (status: number, code: string, params: Record<string, unknown>) => axiosErr(status, { detail: 'English detail', code, params });

test('SCOPE_FORBIDDEN: one wording per reason, a generic one for an unknown reason', () => {
    const v = describeRefusal(coded(403, 'SCOPE_FORBIDDEN', { reason: 'reassignContractor' }), REAL.zh, 'save', 'zh', { keepsInput: true })!;
    assert.deepEqual(v, { title: '無法儲存', message: '不能把資料改到其他承包商。', items: undefined, note: '您填寫的內容都已保留，修正後再按儲存即可。' });
    assert.equal(describeRefusal(coded(403, 'SCOPE_FORBIDDEN', { reason: 'noWorkingProject' }), REAL.en, 'save', 'en')!.message,
        'You are not working in any project (you are not a member of one, or no project was chosen at sign-in). Sign in again and choose a project.');
    assert.equal(describeRefusal(coded(403, 'SCOPE_FORBIDDEN', { reason: 'somethingNew' }), REAL.zh, 'save', 'zh')!.message, '這不在您所屬的專案或承包商範圍內。');
});

test('INVALID_TRANSITION, REFERENCE_NOT_FOUND, ASSIGNEE_UNAVAILABLE, VERSION_CONFLICT read their parameters', () => {
    assert.equal(describeRefusal(coded(400, 'INVALID_TRANSITION', { docType: 'MeetingMinutes', fromStatus: 'Void', toStatus: 'Draft' }), REAL.zh, 'save', 'zh')!.message,
        '會議記錄 不能從「Void」改為「Draft」。');
    assert.equal(describeRefusal(coded(400, 'INVALID_TRANSITION', { docType: 'NCR', fromStatus: 'Closed', toStatus: 'Open' }), REAL.en, 'save', 'en')!.message,
        'NCR cannot go from "Closed" to "Open".');
    assert.equal(describeRefusal(coded(400, 'REFERENCE_NOT_FOUND', { docType: 'NOI', field: 'reference number', value: 'QTS-RKS-HL-NOI-000009' }), REAL.zh, 'save', 'zh')!.message,
        '找不到 NOI QTS-RKS-HL-NOI-000009，請確認編號是否正確。');
    assert.equal(describeRefusal(coded(400, 'ASSIGNEE_UNAVAILABLE', { field: 'assignedTo' }), REAL.zh, 'save', 'zh')!.message, '指派對象不存在或已停用，請選擇啟用中的使用者。');
    assert.equal(describeRefusal(coded(409, 'VERSION_CONFLICT', { docType: 'KM', number: 'Welding' }), REAL.zh, 'save', 'zh')!.message,
        'KM 文章 Welding 已被其他人修改。請重新載入後再修改一次。');
});

test('RECORD_LOCKED: a whole locked record, and the three narrower locks', () => {
    const lock = (kind: string, docType = 'NCR') => describeRefusal(coded(400, 'RECORD_LOCKED', { docType, number: 'N-1', status: 'Closed', kind }), REAL.zh, 'save', 'zh')!.message;
    assert.equal(describeRefusal(coded(400, 'RECORD_LOCKED', { docType: 'PQP', number: 'P-1', status: 'Approved', kind: 'publish' }), REAL.zh, 'save', 'zh', { keepsInput: true })!.note,
        '您填寫的內容都已保留。');
    assert.equal(lock('record', 'FollowUp'), 'Follow-up N-1 的狀態為「Closed」，已鎖定，不能修改。');
    assert.equal(lock('qualityFields'), 'NCR N-1 的狀態為「Closed」，品質相關欄位不能再修改。');
    assert.equal(lock('evidence', 'OBS'), 'Observation N-1 的狀態為「Closed」，改善內容與照片證據不能再修改。');
    assert.match(lock('publish', 'PQP'), /請用「Publish」建立新版次。$/);
    // a kind this page does not know yet falls back to the plain wording, never to "refusal.code..." or an empty dialog
    assert.equal(lock('brandNew', 'NOI'), 'NOI N-1 的狀態為「Closed」，已鎖定，不能修改。');
});

test('D1 with the real wording: an Audit start/end 422 names both the field and the problem (seen in the 2a preview as "end_date：有問題")', () => {
    const err = axiosErr(422, { detail: [{ type: 'value_error.date', loc: ['body', 'end_date'], msg: 'Start date must be before or equal to end date', code: 'start_after_end' }] });
    assert.deepEqual(describeRefusal(err, REAL.zh, 'save', 'zh', { keepsInput: true }), {
        title: '無法儲存', message: '有欄位內容不正確，請修正後再儲存：', items: ['結束日期：早於開始日期'], note: '您填寫的內容都已保留，修正後再按儲存即可。',
    });
    assert.deepEqual(describeRefusal(err, REAL.en, 'save', 'en')!.items, ['End date：is earlier than the start date']);
});

// ---- REFUSAL-DIALOG-2026-003 (2b-1): duplicates, NCR closure, locks, the generic `date` label ----------------------------
test('DUPLICATE_NAME: the record type and name, and its own wording for an account e-mail / username', () => {
    assert.equal(describeRefusal(coded(400, 'DUPLICATE_NAME', { docType: 'contractor', name: 'Hailong' }), REAL.zh, 'save', 'zh')!.message,
        '承包商「Hailong」已經存在，請改用其他名稱。');
    assert.equal(describeRefusal(coded(409, 'DUPLICATE_NAME', { docType: 'auditTemplate', name: 'ISO 9001' }), REAL.en, 'save', 'en')!.message,
        'Audit template "ISO 9001" already exists. Use another name.');
    assert.equal(describeRefusal(coded(400, 'DUPLICATE_NAME', { docType: 'user', field: 'email', name: 'a@b.com' }), REAL.zh, 'save', 'zh')!.message,
        'Email a@b.com 已經被其他帳號使用。');
    assert.equal(describeRefusal(coded(400, 'DUPLICATE_NAME', { docType: 'personnel', name: 'Lee' }), REAL.zh, 'save', 'zh')!.message, '人員「Lee」已經存在，請改用其他名稱。');
});

test('NCR_CLOSE_MISSING_FIELDS lists the fields in the UI language, with the reason as a variant', () => {
    const params = { fields: ['productDisposition', 'improvementPhotos'], labelsZh: ['產品處置', '改善照片'], labelsEn: ['Product disposition', 'Improvement photos'], photoProblems: [] };
    assert.equal(describeRefusal(coded(400, 'NCR_CLOSE_MISSING_FIELDS', { ...params, reason: 'none' }), REAL.zh, 'save', 'zh')!.message,
        '這張 NCR 還不能結案，請先填寫：產品處置、改善照片。');
    assert.match(describeRefusal(coded(400, 'NCR_CLOSE_MISSING_FIELDS', { ...params, reason: 'noPhoto' }), REAL.zh, 'save', 'zh')!.message, /在「改善照片」上傳至少一張照片後再結案。$/);
    assert.match(describeRefusal(coded(400, 'NCR_CLOSE_MISSING_FIELDS', { ...params, reason: 'createDirect' }), REAL.en, 'save', 'en')!.message, /^An NCR cannot be created already Closed/);
});

test('module codes read their parameters (NOI, ITR, Checklist, meeting Rev)', () => {
    assert.equal(describeRefusal(coded(400, 'NOI_CLOSE_OPEN_NCRS', { number: 'NOI-1', count: 2, ncrs: ['NCR-1', 'NCR-2'] }), REAL.zh, 'save', 'zh')!.message,
        'NOI NOI-1 不能結案：還有 2 筆 NCR 未結（NCR-1、NCR-2），請先結案或作廢。');
    assert.equal(describeRefusal(coded(400, 'ITR_APPROVE_CHECKLIST_NOT_PASSED', { checklists: ['CHK-1 (Ongoing)'] }), REAL.zh, 'save', 'zh')!.message,
        'ITR 不能核准：下列檢查表尚未通過：CHK-1 (Ongoing)。');
    assert.equal(describeRefusal(coded(400, 'MEETING_REV_DUPLICATE', { number: 'MOM-1', rev: '1.0' }), REAL.zh, 'save', 'zh')!.message,
        '會議記錄 MOM-1 已經有 Rev 1.0，請改用其他版次。');
    assert.equal(describeRefusal(coded(400, 'NCR_CLOSE_NEEDS_OWNER_APPROVAL', { disposition: 'Repair' }), REAL.en, 'save', 'en')!.message,
        'Disposition "Repair" needs the owner / engineering approval (Owner approval = Approved) before the NCR can be closed.');
});

test('a locked Checklist result is a lock: the note only says the input is kept', () => {
    const v = describeRefusal(coded(400, 'CHECKLIST_RESULTS_LOCKED', { number: 'CHK-1', status: 'Pass' }), REAL.zh, 'save', 'zh', { keepsInput: true })!;
    assert.equal(v.message, '檢查表 CHK-1 的狀態為「Pass」，檢驗結果不能修改。請先按「重開檢查表」，再儲存結果。');
    assert.equal(v.note, '您填寫的內容都已保留。');
    // not a lock: still "correct it and save again"
    const locked = describeRefusal(coded(400, 'NOI_CONTRACTOR_LOCKED', { number: 'NOI-1', references: [{ type: 'ITR', count: 2 }, { type: 'Follow-up', count: 1 }] }),
        REAL.zh, 'save', 'zh', { keepsInput: true })!;
    assert.equal(locked.message, 'NOI NOI-1 底下已有下列文件，不能更換承包商：');
    assert.deepEqual(locked.items, [REAL.zh('refusal.refItem', { count: 2, type: 'ITR' }), REAL.zh('refusal.refItem', { count: 1, type: 'Follow-up' })]);
    assert.equal(locked.note, '您填寫的內容都已保留，修正後再按儲存即可。');
});

test('`date` is labelled generically now (R3 P3-1): a Checklist or agenda date is not called a start date', () => {
    const err = axiosErr(422, { detail: [{ loc: ['body', 'date'], code: 'invalid_calendar', msg: 'x' }] });
    assert.deepEqual(describeRefusal(err, REAL.zh, 'save', 'zh')!.items, ['日期：不是有效的日期'.replace('不是有效的日期', REAL.zh('dateIssue.invalid_calendar'))]);
    assert.deepEqual(describeRefusal(err, REAL.en, 'save', 'en')!.items, [`Date：${REAL.en('dateIssue.invalid_calendar')}`]);
});
