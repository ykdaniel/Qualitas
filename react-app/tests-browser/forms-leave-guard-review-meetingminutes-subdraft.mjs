import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';
const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));

// R5/R6: cross-checks state.root against isolated_stack.py's OWN on-disk marker/state files
// (not just the JSON string the caller happened to pass) — see
// forms-leave-guard-review-isolation-guard.mjs for what this actually verifies and
// forms-leave-guard-review-isolation-guard-selftest.mjs for the negative-path proof.
verifyIsolatedTarget(state);

// No hardcoded or defaulted test password anywhere in this repo — must match what the
// seed script was run with (see seed_forms_leave_guard_review.py's own env var requirement).
const PW = process.env.FORMS_TEST_PASSWORD;
if (!PW) throw new Error('FORMS_TEST_PASSWORD not set — export the same value used for seeding before running this script.');
const BASE = `http://127.0.0.1:${state.vite_port}`;
// FORMS-2026-005 (R2): each round must use its OWN output directory — see osd.mjs's comment.
const OUT = process.env.FORMS_REVIEW_EVIDENCE_DIR || '/private/tmp/claude-501/forms-2026-005-evidence';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);
let checks = 0;
const check = (v, msg) => { if (!v) throw new Error(`FAILED: ${msg}`); checks++; log('PASS', msg); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
page.setDefaultTimeout(15000);
await page.addInitScript(() => localStorage.setItem('language', 'en'));

await page.goto(`${BASE}/login`);
await page.fill('#email', 'forms_full');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'));
log('LOGIN OK');

const rawGet = async (path) => {
    const res = await page.evaluate(async (url) => {
        const r = await fetch(url, { credentials: 'same-origin' });
        return { status: r.status, body: await r.json().catch(() => null) };
    }, path);
    return res;
};

const actionTitleField = () => page.getByPlaceholder('Action Item').first();
const saveBtn = () => page.getByRole('button', { name: /^Save$/ });
const apiCalls = [];
page.on('request', r => { if (r.url().includes('/api/meeting-minutes') && ['POST', 'PUT'].includes(r.method())) apiCalls.push({ method: r.method(), postData: r.postData() }); });

// ═══════════════ 1a. R1 core: PRIMARY field (title) unconfirmed -> blocked ═══════════════
log('=== MM 1a. reproduce: action item TITLE typed, no Add, click Save ===');
await page.goto(`${BASE}/meeting-minutes`);
await page.waitForTimeout(500);
await page.getByRole('button', { name: /Add New Meeting/i }).click();
await page.waitForTimeout(600);
await actionTitleField().fill('UNCONFIRMED ACTION — should not be silently dropped');
apiCalls.length = 0;
await saveBtn().click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/mm-01a-blocked-title-only.png` });
check(apiCalls.length === 0, `MM 1a: Save blocked, exactly zero requests while unconfirmed title present (got ${apiCalls.length})`);
const toastCount1a = await page.locator('[data-sonner-toast]').count();
check(toastCount1a === 1, `MM 1a: EXACTLY one guidance toast shown (got ${toastCount1a})`);
check((await actionTitleField().inputValue()) === 'UNCONFIRMED ACTION — should not be silently dropped', 'MM 1a: the unconfirmed text is preserved');

// ═══════════════ 1b. R1 CORE FIX: NON-PRIMARY field only (action assignee) -> still blocked ═══════════════
// This is the exact defect the independent review found: the old check only looked at
// newAction.title, so filling ONLY the assignee (leaving title blank) sailed straight through
// and got silently dropped on save. Clear title first to isolate the non-primary field.
log('=== MM 1b. R1 FIX: action item ASSIGNEE-ONLY (title blank) still blocks save ===');
await actionTitleField().fill('');
const assigneeField = page.getByPlaceholder('Assigned To').first();
await assigneeField.fill('Non-Primary-Field QA Lead');
apiCalls.length = 0;
await saveBtn().click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/mm-01b-blocked-assignee-only.png` });
check(apiCalls.length === 0, `MM 1b (the R1 defect): assignee-only (title blank) still blocks save, zero requests (got ${apiCalls.length})`);
check((await assigneeField.inputValue()) === 'Non-Primary-Field QA Lead', 'MM 1b: the assignee-only text is preserved, not lost');
await assigneeField.fill('');

// ═══════════════ 1c. R1 CORE FIX: attendee COMPANY-ONLY (name blank) -> still blocked ═══════════════
log('=== MM 1c. R1 FIX: attendee COMPANY-ONLY (name blank) still blocks save ===');
const attendeeCompanyField = page.getByPlaceholder('Company').first();
await attendeeCompanyField.fill('Non-Primary-Field Co.');
apiCalls.length = 0;
await saveBtn().click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/mm-01c-blocked-attendee-company-only.png` });
check(apiCalls.length === 0, `MM 1c (the R1 defect): attendee company-only (name blank) still blocks save, zero requests (got ${apiCalls.length})`);
check((await attendeeCompanyField.inputValue()) === 'Non-Primary-Field Co.', 'MM 1c: the company-only text is preserved, not lost');
await attendeeCompanyField.fill('');

// ═══════════════ 1d. R1 CORE FIX: discussion TOPIC (primary/only field) -> blocked ═══════════════
log('=== MM 1d. R1 FIX: discussion topic typed, no Add, still blocks save ===');
const topicField = page.getByPlaceholder('Add Topic').first();
await topicField.fill('Non-Primary-Field Topic Draft');
apiCalls.length = 0;
await saveBtn().click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/mm-01d-blocked-topic-only.png` });
check(apiCalls.length === 0, `MM 1d: unconfirmed discussion topic still blocks save, zero requests (got ${apiCalls.length})`);
check((await topicField.inputValue()) === 'Non-Primary-Field Topic Draft', 'MM 1d: the topic draft text is preserved, not lost');

// ═══════════════ 1e. R1 CORE FIX: discussion SUB-ITEM owner-only (content blank) -> blocked ═══════════════
// Needs an existing major topic first (confirmed via Add — not itself under test here), so the
// nested sub-item owner/status fields are reachable at all.
log('=== MM 1e. R1 FIX: discussion sub-item OWNER-ONLY (content blank) still blocks save ===');
const addTopicBtn = page.getByRole('button', { name: /^Add Topic$/ }).first();
await addTopicBtn.click();
await page.waitForTimeout(400);
check((await topicField.inputValue()) === '', 'MM 1e: Add Topic cleared the draft (confirmed topic created, not itself under test)');
const subItemOwnerField = page.getByPlaceholder('Owner').first();
await subItemOwnerField.fill('Non-Primary-Field Sub-item Owner');
apiCalls.length = 0;
await saveBtn().click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/mm-01e-blocked-subitem-owner-only.png` });
check(apiCalls.length === 0, `MM 1e (the R1 defect): sub-item owner-only (content blank) still blocks save, zero requests (got ${apiCalls.length})`);
check((await subItemOwnerField.inputValue()) === 'Non-Primary-Field Sub-item Owner', 'MM 1e: the owner-only text is preserved, not lost');

// ═══════════════ 1f. R1 CORE FIX: discussion SUB-ITEM status changed from default 'Open' -> blocked ═══════════════
// The default status 'Open' must NOT count as input (R1's explicit requirement); changing it
// to 'Closed' is an explicit user action and MUST count.
log("=== MM 1f. R1 FIX: discussion sub-item STATUS changed from default 'Open' still blocks save ===");
await subItemOwnerField.fill('');
const subItemStatusSelect = page.locator('select').filter({ has: page.locator('option[value="Closed"]') }).first();
await subItemStatusSelect.selectOption('Closed');
apiCalls.length = 0;
await saveBtn().click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/mm-01f-blocked-subitem-status-only.png` });
check(apiCalls.length === 0, `MM 1f (the R1 defect): sub-item status changed from default still blocks save, zero requests (got ${apiCalls.length})`);
check(await subItemStatusSelect.inputValue() === 'Closed', 'MM 1f: the status change is preserved, not lost');
await subItemStatusSelect.selectOption('Open'); // reset back to the non-dirty default for scenario 2 below

// ═══════════════ 2. R1 (FORMS-2026-004): TRUE new-meeting Add paths, then main Save — response + persistence ═══════════════
// FORMS-2026-003's REVIEW found that this script's old scenario 2 only filled Title and saved —
// it never actually clicked an Add button before saving a brand-new (unsaved) meeting, so it
// never exercised actionItemsDraft/discussionLog's "Add, then Save" path at all. This rewrite
// does exactly that: Add Topic, Add Sub-item under it, and Add an action item draft — all BEFORE
// the meeting itself has ever been saved — then Save once and check both resulting requests'
// responses plus a raw GET reread, not just a request count.
log('=== MM 2. R1: new meeting — Add Topic + Add Sub-item + Add action item draft, then Save ===');
await page.locator('xpath=//label[text()="Title"]/following-sibling::input').fill('FORMS-2026-004 MM New-Meeting Test');
await topicField.fill('FORMS-2026-004 Draft Topic');
await addTopicBtn.click();
await page.waitForTimeout(400);
check((await topicField.inputValue()) === '', 'MM 2: Add Topic clears the draft input (topic confirmed into discussionLog)');
const subItemContentField = page.getByPlaceholder(/Topic \/ Discussion/i).first();
await subItemContentField.fill('FORMS-2026-004 Draft Sub-item');
const addSubItemBtn = page.getByRole('button', { name: /Add Sub-item/i }).first();
await addSubItemBtn.click();
await page.waitForTimeout(400);
check((await subItemContentField.inputValue()) === '', 'MM 2: Add Sub-item clears the draft input (sub-item confirmed into discussionLog)');
const actionItemTitleInput = page.getByPlaceholder('Action Item').first();
await actionItemTitleInput.fill('FORMS-2026-004 Draft Action Item');
const addActionDraftBtn = page.locator('xpath=(//input[@placeholder="Action Item"])[1]/following::button[1]');
await addActionDraftBtn.click();
await page.waitForTimeout(400);
check((await actionItemTitleInput.inputValue()) === '', 'MM 2: Add (draft) clears the action item input (confirmed into actionItemsDraft)');
check(await page.locator('text=FORMS-2026-004 Draft Action Item').count() >= 1, 'MM 2: the confirmed action item draft is now rendered in the actionItemsDraft list');

const mainPostCalls = [];
const bulkFollowUpCalls = [];
page.on('response', async (r) => {
    if (r.request().method() === 'POST' && /\/api\/meeting-minutes\/?$/.test(new URL(r.url()).pathname)) {
        mainPostCalls.push({ status: r.status(), body: await r.json().catch(() => null) });
    }
    if (r.request().method() === 'POST' && r.url().includes('/api/followup/bulk')) {
        bulkFollowUpCalls.push({ status: r.status(), body: await r.json().catch(() => null) });
    }
});
apiCalls.length = 0;
await saveBtn().click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/mm-02-new-meeting-added-then-saved.png` });

check(mainPostCalls.length === 1, `MM 2: exactly one POST /api/meeting-minutes/ for the new meeting itself (got ${mainPostCalls.length})`);
check(mainPostCalls[0]?.status >= 200 && mainPostCalls[0]?.status < 300, `MM 2: the new-meeting POST response is 2xx (got ${mainPostCalls[0]?.status})`);
const newDocNumber = mainPostCalls[0]?.body?.documentNumber;
check(!!newDocNumber, `MM 2: the new-meeting POST response body carries a documentNumber (got "${newDocNumber}")`);
const savedTopic = (mainPostCalls[0]?.body?.discussionLog || []).find(d => d.content === 'FORMS-2026-004 Draft Topic');
check(!!savedTopic, 'MM 2: the response body\'s discussionLog already includes the Added topic');
const savedSubItem = (mainPostCalls[0]?.body?.discussionLog || []).find(d => d.content === 'FORMS-2026-004 Draft Sub-item');
check(!!savedSubItem, 'MM 2: the response body\'s discussionLog already includes the Added sub-item');

check(bulkFollowUpCalls.length === 1, `MM 2: exactly one POST /api/followup/bulk/ for the draft action item (got ${bulkFollowUpCalls.length})`);
check(bulkFollowUpCalls[0]?.status >= 200 && bulkFollowUpCalls[0]?.status < 300, `MM 2: the bulk FollowUp POST response is 2xx (got ${bulkFollowUpCalls[0]?.status})`);
const createdBulkAction = (bulkFollowUpCalls[0]?.body || []).find(f => f.title === 'FORMS-2026-004 Draft Action Item');
check(!!createdBulkAction, 'MM 2: the bulk FollowUp response body carries the action item title');
check(createdBulkAction?.sourceReferenceNo === newDocNumber, `MM 2: the bulk-created FollowUp is tagged with the new meeting's own documentNumber (got "${createdBulkAction?.sourceReferenceNo}" vs "${newDocNumber}")`);

const rawMeeting = await rawGet(`/api/meeting-minutes/${mainPostCalls[0]?.body?.id}`);
check(rawMeeting.status === 200, `MM 2: raw GET of the new meeting succeeds (got ${rawMeeting.status})`);
check(!!(rawMeeting.body?.discussionLog || []).find(d => d.content === 'FORMS-2026-004 Draft Topic'), 'MM 2: raw GET (bypassing UI/store) confirms the Added topic was actually persisted');
check(!!(rawMeeting.body?.discussionLog || []).find(d => d.content === 'FORMS-2026-004 Draft Sub-item'), 'MM 2: raw GET confirms the Added sub-item was actually persisted');
const rawBulkFollowUps = await rawGet(`/api/followup/?sourceModule=MEETING&sourceReferenceNo=${encodeURIComponent(newDocNumber)}`);
check(!!(rawBulkFollowUps.body || []).find(f => f.title === 'FORMS-2026-004 Draft Action Item'), 'MM 2: raw GET confirms the draft action item was actually persisted as a FollowUp, not just optimistically shown');

// ═══════════════ 3. REGRESSION: normal Add/Apply then Save — response + real persistence ═══════════════
log('=== MM 3. regression: Add the action item first (existing record), Save unaffected + real GET persistence ===');
await page.goto(`${BASE}/meeting-minutes`);
await page.waitForTimeout(700);
await page.locator('table tbody tr').filter({ hasText: 'FORMS-2026-004 MM New-Meeting Test' }).first().click();
await page.waitForTimeout(600);
await actionTitleField().fill('CONFIRMED ACTION — added via Add button');
const followUpCalls = [];
page.on('response', async (r) => { if (r.url().includes('/api/followup') && r.request().method() === 'POST') followUpCalls.push({ status: r.status(), body: await r.json().catch(() => null) }); });
const addActionBtn = page.locator('xpath=(//input[@placeholder="Action Item"])[1]/following::button[1]');
await addActionBtn.click();
await page.waitForTimeout(800);
check(await page.locator('text=/Operation not permitted|saveFailed|Failed/i').count() === 0, 'MM 3: Add action item now succeeds (no permission-error toast)');
check((await actionTitleField().inputValue()) === '', 'MM 3: Add clears the draft input');
check(followUpCalls.length === 1, `MM 3: exactly one FollowUp create request (got ${followUpCalls.length})`);
check(followUpCalls[0]?.status >= 200 && followUpCalls[0]?.status < 300, `MM 3: FollowUp create response is 2xx (got ${followUpCalls[0]?.status})`);
check(followUpCalls[0]?.body?.title === 'CONFIRMED ACTION — added via Add button', `MM 3: FollowUp create response BODY carries the title (got "${followUpCalls[0]?.body?.title}")`);
const rawFollowUps = await rawGet('/api/followup/?sourceModule=MEETING');
const persistedAction = (rawFollowUps.body || []).find(f => f.title === 'CONFIRMED ACTION — added via Add button');
check(!!persistedAction, 'MM 3: raw GET (bypassing UI/store) confirms the FollowUp was actually persisted, not just optimistically shown');
apiCalls.length = 0;
await saveBtn().click();
await page.waitForTimeout(1200);
check(apiCalls.length === 1, `MM 3: main Save after a successful Add sends exactly one request (got ${apiCalls.length})`);
await page.screenshot({ path: `${OUT}/mm-03-added-then-saved.png` });

// ═══════════════ 4. R1 (FORMS-2026-005): explicit clear (not Add), then Save — response + reread + the abandoned draft is NOT written ═══════════════
// FORMS-2026-004's REVIEW found this only ever asserted apiCalls.length === 1 — no response, no
// reread, and nothing that actually proves the abandoned text was discarded rather than silently
// written somewhere. This rewrite changes a real, persistable field (the meeting title) IN THE
// SAME save so there is something concrete to check the response/reread against, and explicitly
// asserts the abandoned action-item text appears NOWHERE in either the save response body or a
// raw re-read — not just "the request count looked right".
log('=== MM 4. R1: explicit clear (not Add) + a real field change, then Save — response + reread + abandoned text never lands ===');
await page.goto(`${BASE}/meeting-minutes`);
await page.waitForTimeout(700);
await page.locator('table tbody tr').filter({ hasText: 'FORMS-2026-004 MM New-Meeting Test' }).first().click();
await page.waitForTimeout(600);
const titleFieldExisting4 = page.locator('xpath=//label[text()="Title"]/following-sibling::input');
await titleFieldExisting4.fill('FORMS-2026-005 MM Explicit-Clear Test');
await actionTitleField().fill('ABANDONED DRAFT — must never be saved');
await actionTitleField().fill('');
let mm4PutResponse = null;
page.on('response', async (r) => { if (r.request().method() === 'PUT' && /\/api\/meeting-minutes\/[^/]+$/.test(new URL(r.url()).pathname)) mm4PutResponse = { status: r.status(), body: await r.json().catch(() => null) }; });
apiCalls.length = 0;
mm4PutResponse = null;
await saveBtn().click();
await page.waitForTimeout(1200);
check(apiCalls.length === 1, `MM 4: explicit-clear-then-save sends exactly one request, no leftover block (got ${apiCalls.length})`);
check(mm4PutResponse?.status >= 200 && mm4PutResponse?.status < 300, `MM 4: the save response is 2xx (got ${mm4PutResponse?.status})`);
check(mm4PutResponse?.body?.title === 'FORMS-2026-005 MM Explicit-Clear Test', `MM 4: the save response body reflects the new title (got "${mm4PutResponse?.body?.title}")`);
check(!JSON.stringify(mm4PutResponse?.body || {}).includes('ABANDONED DRAFT'), 'MM 4: the abandoned action-item text does not appear anywhere in the save response body');
await page.screenshot({ path: `${OUT}/mm-04-explicit-clear-then-saved.png` });
const rawMeetingAfterClear = await rawGet(`/api/meeting-minutes/${mainPostCalls[0]?.body?.id}`);
check(rawMeetingAfterClear.status === 200, `MM 4: raw GET of the record succeeds (got ${rawMeetingAfterClear.status})`);
check(rawMeetingAfterClear.body?.title === 'FORMS-2026-005 MM Explicit-Clear Test', `MM 4: raw GET (bypassing UI/store) confirms the new title was actually persisted (got "${rawMeetingAfterClear.body?.title}")`);
check(!JSON.stringify(rawMeetingAfterClear.body || {}).includes('ABANDONED DRAFT'), 'MM 4: raw GET of the record confirms the abandoned text is not present anywhere on it');
const rawFollowUpsAfterClear = await rawGet(`/api/followup/?sourceModule=MEETING&sourceReferenceNo=${encodeURIComponent(mainPostCalls[0]?.body?.documentNumber || '')}`);
check(!(rawFollowUpsAfterClear.body || []).some(f => (f.title || '').includes('ABANDONED DRAFT')), 'MM 4: raw GET of this meeting\'s FollowUps confirms the abandoned action item was never created as one either');

// ═══════════════ 4b. R1 (FORMS-2026-004): Add a discussion topic on an EXISTING record, then Save — response + persistence ═══════════════
// Scenario 2 proved the Add-then-Save path for a brand-new meeting (POST). This proves the same
// Add-then-Save path for an EXISTING meeting (PUT) — a separate code path (updateMeetingMinutes)
// that scenario 2 does not exercise.
log('=== MM 4b. R1: existing meeting — Add Topic, then Save (PUT) — response + persistence ===');
const newMeetingId = mainPostCalls[0]?.body?.id;
await page.goto(`${BASE}/meeting-minutes`);
await page.waitForTimeout(700);
// Scenario 4 (just above) renamed this record's title to 'FORMS-2026-005 MM Explicit-Clear Test'
// as part of proving its own save actually persisted — so this must look up the row by the
// title the record now actually has, not the one it had before scenario 4 ran.
await page.locator('table tbody tr').filter({ hasText: 'FORMS-2026-005 MM Explicit-Clear Test' }).first().click();
await page.waitForTimeout(600);
const topicFieldExisting = page.getByPlaceholder('Add Topic').first();
await topicFieldExisting.fill('FORMS-2026-004 Existing-record Added Topic');
const addTopicBtnExisting = page.getByRole('button', { name: /^Add Topic$/ }).first();
await addTopicBtnExisting.click();
await page.waitForTimeout(400);
check((await topicFieldExisting.inputValue()) === '', 'MM 4b: Add Topic clears the draft input on an existing record too');
const putCalls = [];
page.on('response', async (r) => { if (r.request().method() === 'PUT' && r.url().includes('/api/meeting-minutes/')) putCalls.push({ status: r.status(), body: await r.json().catch(() => null) }); });
apiCalls.length = 0;
await saveBtn().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/mm-04b-existing-topic-added-then-saved.png` });
check(putCalls.length === 1, `MM 4b: exactly one PUT request for the existing-record save (got ${putCalls.length})`);
check(putCalls[0]?.status >= 200 && putCalls[0]?.status < 300, `MM 4b: the PUT response is 2xx (got ${putCalls[0]?.status})`);
const putSavedTopic = (putCalls[0]?.body?.discussionLog || []).find(d => d.content === 'FORMS-2026-004 Existing-record Added Topic');
check(!!putSavedTopic, 'MM 4b: the PUT response body already includes the newly Added topic');
const rawMeetingAfterPut = await rawGet(`/api/meeting-minutes/${newMeetingId}`);
check(!!(rawMeetingAfterPut.body?.discussionLog || []).find(d => d.content === 'FORMS-2026-004 Existing-record Added Topic'), 'MM 4b: raw GET confirms the Added topic was actually persisted on the existing record, not just optimistically shown');

log(`===== MEETING MINUTES SUB-DRAFT DONE: ${checks} checks passed =====`);
await browser.close();
