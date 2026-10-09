// NOI-CONTACT-AUTOFILL-2026-002: R2 evidence script for the REVISE review of
// NOI-CONTACT-AUTOFILL-2026-001 (see docs/workflow/NOI-CONTACT-AUTOFILL-2026-001-archive.md
// for the full REQUIRED_FIXES). Produces a real, re-runnable, dynamically-counted
// PASS/FAIL log plus screenshots under docs/workflow/NOI-CONTACT-AUTOFILL-2026-002-evidence/
// — the previous round's manual Browser-pane poking left no persisted, independently
// re-checkable evidence, which the review flagged directly.
//
// Scenarios (SCOPE a-g in TASK.md):
//   a. New NOI: pre-selected contractor's three fields auto-fill, hint only on fields
//      that actually have a value (R1 — a field the contractor leaves blank must NOT
//      show a hint).
//   b. New NOI, user deliberately BLANKS an auto-filled field, then switches contractor:
//      that field must stay blank and unmarked 'system' (not silently refilled).
//   c. Switch to a contractor whose own field is blank: a 'system' field that had a
//      value must actually be cleared, not left stale.
//   d. Clearing the contractor selection: values/state unchanged, hint text follows the
//      "no contractor selected" wording.
//   e. Existing record with a blank field: stays blank after a contractor switch.
//   f. Save, then reopen the SAME id in a fresh page/context, independently read back
//      all three contact fields.
//   g. Contractor list fetch delayed: opening "Add NOI" before it resolves must show no
//      false hint on the still-empty fields; once the list arrives, manually-edited
//      fields are not overwritten and not-yet-edited fields are untouched too (this
//      component's initializer runs once, at mount — a late-arriving list does not
//      retroactively re-run it). This is the existing, accepted limitation from
//      PRECHECK point 7 — not a bug this round introduces or fixes.
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));

import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';
verifyIsolatedTarget(state);

const PW = process.env.NOI_CONTACT_AUTOFILL_PASSWORD;
if (!PW) throw new Error('NOI_CONTACT_AUTOFILL_PASSWORD not set.');
const BASE = `http://127.0.0.1:${state.vite_port}`;
const OUT = process.env.NOI_CONTACT_AUTOFILL_EVIDENCE_DIR || '/private/tmp/claude-501/noi-contact-autofill-2026-002-evidence';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);

// Dynamic, runtime-accumulated counters — the ONLY numbers this script reports as
// "executed". Never a static count of assertTrue( occurrences in the source.
let totalChecks = 0;
let failures = 0;
const assertTrue = (cond, msg) => {
    totalChecks++;
    if (!cond) { failures++; log(`FAIL: ${msg}`); } else { log(`PASS: ${msg}`); }
};

const browser = await chromium.launch();

async function loginOnPage(page, username) {
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.goto(`${BASE}/login`);
    await page.fill('#email', username);
    await page.fill('#password', PW);
    await page.click('button[type=submit]');
    await page.waitForURL(u => !u.pathname.includes('/login'));
}

const contactFieldLocators = (page) => ({
    contacts: page.locator('input[type="text"]').nth(0), // overridden per-call below; see helpers
    phone: page.locator('input[type="tel"]'),
    email: page.locator('input[type="email"]'),
});

// The Contact Person field is a plain text input and there are several on the form
// (Subject, Event #...), so it is found by its label, not by input type/order alone.
const contactPersonInput = (page) => page.locator('label:has-text("Contact Person")').locator('xpath=following-sibling::input[1]');
const hintNear = (input) => input.locator('xpath=following-sibling::small[1]');

// Clicks Cancel/Close and, if the app's leave-guard raises its "unsaved changes"
// ConfirmModal (it does whenever the form was actually edited), confirms discarding —
// this script never wants to keep unsaved scratch edits anyway.
const closeModalDiscarding = async (p) => {
    // The bottom-bar Cancel button (FormActions "secondary" slot) — not the header's
    // "×" close button, which also carries an accessible name of "Close".
    await p.getByRole('button', { name: 'Cancel', exact: true }).click();
    await p.waitForTimeout(300);
    const leaveBtn = p.getByRole('button', { name: 'Leave' });
    if (await leaveBtn.count() > 0) {
        await leaveBtn.click();
        await p.waitForTimeout(300);
    }
};

// Known seed values (db_seeder.py defaults for 廠商A/B; this script's own seed for the
// no-phone vendor) — scenarios a/b/g assert against these EXACT values, not just
// "non-empty" or "changed to something", per the review's R1 (2026-002 only checked
// non-emptiness/any-change, which would also pass if the wrong contractor's data, or
// only one of two fields, got filled).
const KNOWN_CONTRACTOR_INFO = {
    '廠商A': { contacts: '張三', phone: '02-1234-5678', email: 'vendor-a@example.com' },
    '廠商B': { contacts: '李四', phone: '02-2345-6789', email: 'vendor-b@example.com' },
    'Yungchang Construction Co. (No Phone On File)': { contacts: 'Chen Mingde', phone: '', email: 'chen@yungchang-nophone.example.com' },
};

const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.setDefaultTimeout(15000);
await loginOnPage(page, 'ncaf_full');

// ═══════════════ Scenario a: new NOI — pre-selected contractor auto-fills ═══════════════
log('=== Scenario a: new NOI pre-select auto-fill, hint only where there is a value ===');
await page.goto(`${BASE}/noi`);
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Add New NOI' }).click();
await page.waitForTimeout(500);

const contractorSelect = page.locator('select').nth(0);
const preselectedName = await contractorSelect.inputValue();
assertTrue(preselectedName !== '', 'a1: Contractor is pre-selected on a brand-new NOI');
const expectedA = KNOWN_CONTRACTOR_INFO[preselectedName];
assertTrue(!!expectedA, `a1b: the pre-selected contractor ("${preselectedName}") is one this script has known expected contact info for`);

const contactsInput = contactPersonInput(page);
const phoneInput = page.locator('input[type="tel"]');
const emailInput = page.locator('input[type="email"]');

const aContacts = await contactsInput.inputValue();
const aPhone = await phoneInput.inputValue();
const aEmail = await emailInput.inputValue();
// Exact match against the known seed, not just "non-empty" — a non-empty value could
// still be the WRONG contractor's data, or only one of three fields could have filled.
assertTrue(aContacts === expectedA.contacts, `a2: Contact Person exactly matches ${preselectedName}'s seeded value ("${aContacts}" === "${expectedA.contacts}")`);
assertTrue(aPhone === expectedA.phone, `a3: Phone exactly matches ${preselectedName}'s seeded value ("${aPhone}" === "${expectedA.phone}")`);
assertTrue(aEmail === expectedA.email, `a4: Email exactly matches ${preselectedName}'s seeded value ("${aEmail}" === "${expectedA.email}")`);
assertTrue(await hintNear(contactsInput).count() === 1, 'a5: Contact Person shows the "filled from contractor" hint (has a value)');
assertTrue(await hintNear(phoneInput).count() === 1, 'a6: Phone shows the hint (has a value)');
assertTrue(await hintNear(emailInput).count() === 1, 'a7: Email shows the hint (has a value)');
await page.screenshot({ path: `${OUT}/a-new-noi-prefill.png` });

// ═══════════════ Scenario b: user blanks an auto-filled field, then switches contractor ═══════════════
log('=== Scenario b: new NOI — deliberately blank a field, then switch contractor ===');
await contactsInput.fill('');
await page.waitForTimeout(150);
assertTrue((await contactsInput.inputValue()) === '', 'b1: Contact Person is now blank after the user clears it');
assertTrue(await hintNear(contactsInput).count() === 0, 'b2 (R1): a blank, user-cleared field shows NO hint (not "system" with no value, and not falsely claiming contractor data)');
await page.screenshot({ path: `${OUT}/b1-blanked-before-switch.png` });

const options = await contractorSelect.locator('option').allTextContents();
const currentContractor = await contractorSelect.inputValue();
// Switch to a SPECIFIC, known contractor (not "whichever option happens to be first")
// so b6 below can assert exact expected values, not just "changed to something".
const switchTarget = '廠商B';
assertTrue(options.includes(switchTarget) && switchTarget !== currentContractor,
    `b3: a known second contractor ("${switchTarget}") is available to switch to`);
await contractorSelect.selectOption({ label: switchTarget });
await page.waitForTimeout(300);

assertTrue((await contactsInput.inputValue()) === '', 'b4 (R2 core, not re-tested — still verified): the deliberately-blanked Contact Person stays blank after switching contractor (user-sourced, not overwritten)');
assertTrue(await hintNear(contactsInput).count() === 0, 'b5: Contact Person still shows no hint after the switch (remains user-sourced and blank)');
const expectedB = KNOWN_CONTRACTOR_INFO[switchTarget];
const afterSwitchPhone = await phoneInput.inputValue();
const afterSwitchEmail = await emailInput.inputValue();
// Exact match against 廠商B's known seed — not just "changed from before", which would
// also pass if the wrong value, or only one of the two fields, got filled.
assertTrue(afterSwitchPhone === expectedB.phone, `b6a: Phone (still system-sourced) exactly matches ${switchTarget}'s seeded value ("${afterSwitchPhone}" === "${expectedB.phone}")`);
assertTrue(afterSwitchEmail === expectedB.email, `b6b: Email (still system-sourced) exactly matches ${switchTarget}'s seeded value ("${afterSwitchEmail}" === "${expectedB.email}")`);

// The kept-field toast must actually be visible with the correct wording naming the
// field that was kept — not merely "some toast fired".
const keptToast = page.locator('[data-sonner-toast]').first();
await keptToast.waitFor({ timeout: 3000 }).catch(() => {});
const keptToastCount = await page.locator('[data-sonner-toast]').count();
assertTrue(keptToastCount > 0, 'b7a: a toast is actually visible after switching contractor with a kept field');
if (keptToastCount > 0) {
    const toastText = (await keptToast.textContent()) || '';
    assertTrue(toastText.includes('Kept your existing Contact Person') && toastText.includes('confirm it still applies to the new contractor'),
        `b7b: the toast's wording names "Contact Person" and asks the user to confirm it still applies ("${toastText}")`);
}
await page.screenshot({ path: `${OUT}/b2-blanked-after-switch.png` });

// ═══════════════ Scenario c: switch to a contractor whose OWN field is blank ═══════════════
log('=== Scenario c: switching to a contractor with a blank field actually clears a stale system value ===');
const NO_PHONE_VENDOR = 'Yungchang Construction Co. (No Phone On File)';
const hasNoPhoneVendor = options.includes(NO_PHONE_VENDOR);
assertTrue(hasNoPhoneVendor, `c1: a contractor with a deliberately blank Phone ("${NO_PHONE_VENDOR}") is available to switch to`);
if (hasNoPhoneVendor) {
    const phoneBefore = await phoneInput.inputValue();
    assertTrue(phoneBefore.length > 0, `c2: Phone has a non-empty system-sourced value before switching ("${phoneBefore}")`);
    await contractorSelect.selectOption({ label: NO_PHONE_VENDOR });
    await page.waitForTimeout(300);
    const phoneAfter = await phoneInput.inputValue();
    assertTrue(phoneAfter === '', `c3 (R2 new case): Phone is now actually cleared to "" after switching to a contractor with no phone on file (was "${phoneBefore}", now "${phoneAfter}")`);
    assertTrue(await hintNear(phoneInput).count() === 0, 'c4 (R1): the now-empty, still-system Phone field shows no hint');
    await page.screenshot({ path: `${OUT}/c-switched-to-blank-contractor.png` });
}

// ═══════════════ Scenario d: clearing the contractor selection ═══════════════
log('=== Scenario d: clearing the contractor selection leaves values/state unchanged ===');
const emailBeforeClear = await emailInput.inputValue();
await contractorSelect.selectOption({ label: 'Select' });
await page.waitForTimeout(300);
assertTrue((await contractorSelect.inputValue()) === '', 'd1: Contractor selection is now empty');
assertTrue((await emailInput.inputValue()) === emailBeforeClear, `d2: Email value unchanged after clearing contractor ("${emailBeforeClear}")`);
if (emailBeforeClear) {
    const EXPECTED_PREVIOUS_HINT = "This value is from a previously selected contractor.";
    const emailHintCount = await hintNear(emailInput).count();
    assertTrue(emailHintCount === 1, 'd3a: Email (still has a value, still system) shows exactly one hint after clearing the contractor');
    if (emailHintCount === 1) {
        const hintText = ((await hintNear(emailInput).textContent()) || '').trim();
        // Exact text, not just "a hint exists" — must say "previously selected", not
        // still claim the data belongs to a "currently selected" contractor (there is
        // none right now).
        assertTrue(hintText === EXPECTED_PREVIOUS_HINT, `d3b: the hint's actual wording is the "previously selected contractor" text, not the "currently selected" one ("${hintText}")`);
    }
}
await page.screenshot({ path: `${OUT}/d-contractor-cleared.png` });
await closeModalDiscarding(page); // discard this scratch "Add NOI" session (a-d never saved)

// ═══════════════ Scenario e: existing record, blank field, switch contractor ═══════════════
log('=== Scenario e: existing record — a blank field stays blank after a contractor switch ===');
await page.goto(`${BASE}/noi`);
await page.waitForTimeout(500);
await page.locator('table tbody tr').filter({ hasText: 'NCAF-BLANK-MARK' }).click();
await page.waitForTimeout(500);
const eContactsInput = contactPersonInput(page);
assertTrue((await eContactsInput.inputValue()) === '', 'e1: existing record opens with Contact Person blank (seeded blank)');
assertTrue(await hintNear(eContactsInput).count() === 0, 'e2: no hint on the existing record\'s blank field (user-sourced, not system)');
const eContractorSelect = page.locator('select').nth(0);
const eCurrentContractor = await eContractorSelect.inputValue();
const eOptions = await eContractorSelect.locator('option').allTextContents();
const eOther = eOptions.find(o => o && o !== 'Select' && o !== eCurrentContractor);
await eContractorSelect.selectOption({ label: eOther });
await page.waitForTimeout(300);
assertTrue((await eContactsInput.inputValue()) === '', 'e3: Contact Person is STILL blank after switching contractor on an existing record (accepted design difference, not auto-filled)');
await page.screenshot({ path: `${OUT}/e-existing-record-blank-field.png` });
// Leave this record's modal without saving — scenario e is read/observe only.
await closeModalDiscarding(page);

// ═══════════════ Scenario f: save, then independently reopen the SAME id in a new context ═══════════════
log('=== Scenario f: save, then independently re-read the three fields in a fresh browser context ===');
await page.locator('table tbody tr').filter({ hasText: 'NCAF-SAVE-MARK' }).click();
await page.waitForTimeout(500);
const fContractorSelect = page.locator('select').nth(0);
const fOptions = await fContractorSelect.locator('option').allTextContents();
const fTarget = fOptions.find(o => o === '廠商A');
assertTrue(!!fTarget, 'f1: 廠商A (seeded with an ITP, so the required ITP no. field can be filled) is available');
await fContractorSelect.selectOption({ label: '廠商A' });
await page.waitForTimeout(300);
const itpSelect = page.locator('select').nth(2); // Contractor(0), NCR Reference(1), ITP no.(2)
const itpOptions = await itpSelect.locator('option').allTextContents();
const itpTarget = itpOptions.find(o => o && o !== 'Select');
if (itpTarget) await itpSelect.selectOption({ label: itpTarget });
const fContactsInput = contactPersonInput(page);
const SAVE_MARK_CONTACT = 'R2-Evidence-Save-Check';
await fContactsInput.fill(SAVE_MARK_CONTACT);
const fPhoneInput = page.locator('input[type="tel"]');
const fEmailInput = page.locator('input[type="email"]');
const savedPhone = await fPhoneInput.inputValue();
const savedEmail = await fEmailInput.inputValue();
await page.screenshot({ path: `${OUT}/f1-before-save.png` });
const saveBtn = page.getByRole('button', { name: /^Save$/ });
assertTrue(await saveBtn.isEnabled(), 'f2: Save button is enabled (required fields satisfied)');
await saveBtn.click();
await page.waitForTimeout(1000);
assertTrue((await page.locator('h2:has-text("Add NOI"), h2:has-text("Edit NOI")').count()) === 0, 'f3: modal closed after a successful save');

// Independent reopen: a brand-new browser context (no shared state with `page` beyond
// hitting the same isolated backend), fresh login, locate by the SAME marker.
const page2 = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page2.setDefaultTimeout(15000);
await loginOnPage(page2, 'ncaf_full');
await page2.goto(`${BASE}/noi`);
await page2.waitForTimeout(500);
await page2.locator('table tbody tr').filter({ hasText: 'NCAF-SAVE-MARK' }).click();
await page2.waitForTimeout(500);
const rereadContacts = await contactPersonInput(page2).inputValue();
const rereadPhone = await page2.locator('input[type="tel"]').inputValue();
const rereadEmail = await page2.locator('input[type="email"]').inputValue();
assertTrue(rereadContacts === SAVE_MARK_CONTACT, `f4: independently reread Contact Person matches what was saved ("${rereadContacts}" === "${SAVE_MARK_CONTACT}")`);
assertTrue(rereadPhone === savedPhone, `f5: independently reread Phone matches what was saved ("${rereadPhone}" === "${savedPhone}")`);
assertTrue(rereadEmail === savedEmail, `f6: independently reread Email matches what was saved ("${rereadEmail}" === "${savedEmail}")`);
await page2.screenshot({ path: `${OUT}/f2-reread-after-save.png` });
await page2.close();

// ═══════════════ Scenario g: contractor list fetch delayed ═══════════════
log('=== Scenario g: contractor list fetch delayed — no false hint, late arrival does not retroactively refill ===');
const page3 = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page3.setDefaultTimeout(15000);
let releaseContractors;
const gate = new Promise(resolve => { releaseContractors = resolve; });
await page3.route('**/api/contractors/**', async (route) => {
    await gate; // hold the response until the test releases it
    await route.continue();
});
await loginOnPage(page3, 'ncaf_full');
await page3.goto(`${BASE}/noi`);
await page3.waitForTimeout(500);
const addButtonDuringDelay = page3.getByRole('button', { name: 'Add New NOI' });
assertTrue(await addButtonDuringDelay.isEnabled(), 'g1: "Add New NOI" is NOT blocked/disabled while the contractor list is still loading (observed, not assumed)');
await addButtonDuringDelay.click();
await page3.waitForTimeout(500);
const gContractorSelect = page3.locator('select').nth(0);
assertTrue((await gContractorSelect.inputValue()) === '', 'g2: with the contractor list still pending, no contractor is pre-selected');
const gContacts = contactPersonInput(page3);
const gPhone = page3.locator('input[type="tel"]');
const gEmail = page3.locator('input[type="email"]');
assertTrue((await gContacts.inputValue()) === '', 'g3: Contact Person is empty while the list is pending');
assertTrue(await hintNear(gContacts).count() === 0, 'g4 (R1): no false "filled from contractor" hint while nothing has actually been filled');
assertTrue(await hintNear(gPhone).count() === 0, 'g5 (R1): same for Phone');
assertTrue(await hintNear(gEmail).count() === 0, 'g6 (R1): same for Email');
await page3.screenshot({ path: `${OUT}/g1-modal-open-during-delay.png` });

// User types into Contact Person WHILE the list is still pending.
const MANUAL_DURING_DELAY = 'Manual-Entry-During-Delay';
await gContacts.fill(MANUAL_DURING_DELAY);

// Let the delayed contractor list resolve — but actually WAIT for and check the
// response (not a fixed sleep), and then actually wait for the options to appear in
// the DOM, rather than assuming either happened after an arbitrary timeout.
const contractorsResponsePromise = page3.waitForResponse(
    r => r.url().includes('/api/contractors/') && r.request().method() === 'GET',
    { timeout: 5000 },
);
releaseContractors();
const contractorsResponse = await contractorsResponsePromise;
assertTrue(contractorsResponse.ok(), `g_resp: the delayed /api/contractors/ request actually completed successfully (status ${contractorsResponse.status()})`);

await page3.waitForFunction(() => {
    const sel = document.querySelectorAll('select')[0];
    return !!sel && sel.options.length > 1;
}, { timeout: 5000 });
const gOptionsAfter = await gContractorSelect.locator('option').allTextContents();
assertTrue(gOptionsAfter.length > 1, `g_opts1: contractor options are actually populated in the DOM after the delayed response (${gOptionsAfter.length} options incl. placeholder)`);
assertTrue(gOptionsAfter.includes('廠商A'), 'g_opts2: a known contractor ("廠商A") is now present as a real selectable option');

assertTrue((await gContacts.inputValue()) === MANUAL_DURING_DELAY,
    'g7: the manually-typed Contact Person is NOT overwritten once the late contractor list has actually arrived and populated the dropdown (getInitialData only runs once, at mount — documented, accepted limitation, not newly introduced)');
assertTrue((await gContractorSelect.inputValue()) === '',
    'g8: Contractor is still NOT auto-selected after the list arrives late — the one-time initializer already ran before the list existed, and nothing re-triggers it; this is the existing behavior this round documents, not a new auto-catch-up feature');
await page3.screenshot({ path: `${OUT}/g2-after-late-list-arrival.png` });

// Now actually select one of the newly-available contractors, and confirm the
// still-untouched system fields (Phone/Email) fill correctly — this is the "selected
// contractor fills not-yet-edited fields normally" case the original TASK scope asked
// for but 2026-002's script never actually exercised.
await gContractorSelect.selectOption({ label: '廠商A' });
await page3.waitForTimeout(300);
const expectedG = KNOWN_CONTRACTOR_INFO['廠商A'];
assertTrue((await gContacts.inputValue()) === MANUAL_DURING_DELAY,
    'g9: the manually-entered Contact Person is still preserved after selecting a contractor post-arrival (user-sourced, untouched by the fill)');
assertTrue((await gPhone.inputValue()) === expectedG.phone,
    `g10: Phone (still system-sourced, never touched) now correctly auto-fills from the selected contractor ("${await gPhone.inputValue()}" === "${expectedG.phone}")`);
assertTrue((await gEmail.inputValue()) === expectedG.email,
    `g11: Email (still system-sourced) now correctly auto-fills from the selected contractor ("${await gEmail.inputValue()}" === "${expectedG.email}")`);
await page3.screenshot({ path: `${OUT}/g3-selected-after-late-arrival.png` });
await page3.close();

await browser.close();

log(`\n=== SUMMARY: ${totalChecks} checks executed, ${totalChecks - failures} PASS, ${failures} FAIL ===`);
if (failures > 0) process.exit(1);
