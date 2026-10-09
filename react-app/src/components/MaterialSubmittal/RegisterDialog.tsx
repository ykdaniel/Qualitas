/**
 * Add / edit an approved material (MATERIAL-SUBMITTAL M6, DECISIONS 材料：只作為核准材料登錄簿), built like the other modules'
 * record forms (OSD / NCR / OBS): FormShell frame, required-field hint, titled sections, required / optional labels, the shared
 * FileAttachment for photos (new files and removals wait for Save), FormActions footer, the shared save flow (runSaveFlow) and the
 * unsaved-changes guard.
 *
 * Required: contractor, name, approval result, approval date. On edit only changed fields are sent and the contractor is fixed
 * (the reference number carries its abbreviation).
 *
 * One record per form (R2, review R1):
 *   - a Save runs once at a time, from the duplicate check on (a second click is ignored);
 *   - every add request of this form carries the same request id, so a retry after a lost answer / 5xx gets back the record the
 *     first request created (server side) instead of a second one;
 *   - once a record exists (created, or returned for the request id) every later Save of this form EDITS that record: changed
 *     fields are compared with what was LAST WRITTEN (not with the form's first values), so A → B → back to A is sent too;
 *   - the contractor is locked as soon as a record may exist.
 * The duplicate check runs on the server over every record of the project; when it cannot run the user is told and may re-check
 * or save without it (it only warns — DECISIONS 補充).
 */
import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import formStyles from '../Shared/FormShell.module.css';
import FormActions from '../Shared/FormActions';
import actionStyles from '../Shared/FormActions.module.css';
import FileAttachment from '../Shared/FileAttachment';
import ImagePreviewOverlay from '../Shared/ImagePreviewOverlay';
import { useDraftGuard } from '../Shared/LeaveGuard';
import ConfirmModal from '../Shared/ConfirmModal';
import { useLanguage } from '../../context/LanguageContext';
import { deleteFile, uploadFiles } from '../../services/api';
import {
    MATERIAL_ENTITY, PHOTO_CATEGORY, findDuplicateMaterials, registerMaterialOnce, updateRegistered, type ApprovedMaterial,
    type RegisterPayload,
} from '../../services/materialApi';
import { runSaveFlow, type SaveOutcome } from '../../utils/saveFlow';
import { describeSaveError, presentOutcome } from '../../utils/saveErrors';
import { classifyWriteFailure } from '../../utils/materialSubmittal';
import { useMaterialText, type MaterialTextKey } from './materialText';

type FormValues = Omit<RegisterPayload, 'projectId'>;
const REQUIRED: (keyof FormValues)[] = ['vendorId', 'name', 'resultCode', 'approvedDate'];
const MATERIAL_TEXT: [keyof FormValues, MaterialTextKey][] = [
    ['category', 'category'], ['brand', 'brand'], ['model', 'model'], ['specification', 'specification'],
    ['manufacturer', 'manufacturer'], ['supplier', 'supplier'],
];
const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const trimOrNull = (v: string | null | undefined) => (v ?? '').trim() || null;
const newRequestId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`);
const fromItem = (item: ApprovedMaterial | null): FormValues => ({
    vendorId: item?.vendorId ?? '', name: item?.name ?? '', category: item?.category ?? '', brand: item?.brand ?? '',
    model: item?.model ?? '', specification: item?.specification ?? '', manufacturer: item?.manufacturer ?? '',
    supplier: item?.supplier ?? '', specReference: item?.specReference ?? '', resultCode: item?.result ?? 'Approved',
    approvedDate: item?.approvedDate ?? today(), decisionMaker: item?.decisionMaker ?? '', externalDocNo: item?.externalDocNo ?? '',
});
/** what is sent: required fields as they are (name trimmed), optional text trimmed or null */
const normalised = (v: FormValues): FormValues => ({
    ...v, name: v.name.trim(),
    ...Object.fromEntries((['category', 'brand', 'model', 'specification', 'manufacturer', 'supplier', 'specReference', 'decisionMaker',
                            'externalDocNo'] as const).map((k) => [k, trimOrNull(v[k] as string)])),
});

const RegisterDialog: React.FC<{
    projectId: string;
    vendors: { id: string; name: string }[];
    item?: ApprovedMaterial | null;            // null / undefined = new record
    onClose: () => void;
    /** the record (and its photos) were written; the caller shows the fresh item */
    onSaved: (item: ApprovedMaterial) => void;
    /** re-reads the list; false = the reload failed */
    onReload: () => Promise<boolean>;
}> = ({ projectId, vendors, item, onClose, onSaved, onReload }) => {
    const mt = useMaterialText();
    const { t } = useLanguage();
    const editing = !!item;
    const [v, setV] = useState<FormValues>(() => fromItem(item ?? null));
    const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
    const [deletedFileIds, setDeletedFileIds] = useState<string[]>([]);
    const [photoSync, setPhotoSync] = useState(0);
    const [saving, setSaving] = useState(false);
    const [triedSave, setTriedSave] = useState(false);
    const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
    /** this form's request id: the same for every add attempt, so the server can recognise a repeat */
    const requestId = useRef(newRequestId());
    /** the record as LAST WRITTEN by this form (server answer), or null while none is known */
    const written = useRef<ApprovedMaterial | null>(null);
    /** an add request whose outcome is unknown was sent: a record may exist, so the contractor stays as sent */
    const [maybeCreated, setMaybeCreated] = useState(false);
    const lastWriteUnknown = useRef(false);
    /** synchronous in-flight guard: state updates are too late to stop a second click */
    const busy = useRef(false);
    /** a question to answer before the save goes on: possible duplicate (user's choice: warn, may continue), the duplicate
     *  check failed, or photo removals */
    const [ask, setAsk] = useState<{ kind: 'duplicate' | 'duplicateFailed' | 'delete'; message: string; answered: { duplicate?: boolean; delete?: boolean } } | null>(null);
    const leaveGuard = useDraftGuard({ v, pendingPhotos, deletedFileIds }, saving);
    const requestClose = () => leaveGuard.requestClose(onClose);
    const vendorLocked = editing || !!written.current || maybeCreated;

    const set = (k: keyof FormValues, value: string) => setV((cur) => ({ ...cur, [k]: value }));
    const missing = REQUIRED.filter((k) => !String(v[k] ?? '').trim());
    const invalid = (k: keyof FormValues) => triedSave && missing.includes(k);
    const label = (key: MaterialTextKey, required: boolean) => (
        <label className={required ? formStyles.requiredLabel : formStyles.optionalLabel}>{mt(key)}</label>
    );
    const errorText = (k: keyof FormValues) => invalid(k)
        ? <p style={{ color: '#dc2626', fontSize: 12, margin: '4px 0 0', lineHeight: 1.4 }}>{mt('required')}</p> : null;

    /** the record this form now edits: the last one written, else the one opened for editing */
    const target = (): ApprovedMaterial | null => written.current ?? item ?? null;

    const writeRecord = async (): Promise<string> => {
        const n = normalised(v);
        let current = target();
        if (!current) {
            current = await registerMaterialOnce({ projectId, ...n }, requestId.current);
            written.current = current;            // from here on this form edits THIS record
        }
        const before = normalised(fromItem(current));
        const changes = Object.fromEntries((Object.keys(n) as (keyof FormValues)[])
            .filter((k) => k !== 'vendorId' && n[k] !== before[k]).map((k) => [k, n[k]]));
        if (Object.keys(changes).length) current = await updateRegistered(current.submittalId, changes);
        written.current = current;
        return current.revisionId;                // attachments of a registered material live on its approved revision
    };

    const applyOutcome = (outcome: SaveOutcome) => {
        if (outcome.status === 'saved-incomplete') {
            if (outcome.uploadedCategories.includes(PHOTO_CATEGORY)) { setPendingPhotos([]); setPhotoSync((n) => n + 1); }
            setDeletedFileIds(outcome.remainingDeletes);
            if (written.current) onSaved(written.current);
            toast.warning(mt('photosFailed', { d: outcome.failures.map((f) => f.message).join('；') }), { duration: 10000 });
            return;
        }
        if (outcome.status === 'failed' && lastWriteUnknown.current) {
            void onReload();
            toast.warning(mt('unknownRetrySafe'), { duration: 10000 });
            return;
        }
        const { close, notice } = presentOutcome(outcome, t);
        if (notice) (notice.level === 'error' ? toast.error : toast.warning)(notice.text, { duration: 10000 });
        if (close && written.current) {
            leaveGuard.release();
            onSaved(written.current);
            onClose();
        }
    };

    /** other records of the project with the same name + brand + model, over ALL records (server); null = the check failed */
    const findDuplicates = async (): Promise<{ documentNumber: string }[] | null> => {
        try {
            return await findDuplicateMaterials(projectId, {
                name: v.name.trim(), brand: v.brand, model: v.model, excludeId: target()?.submittalId, clientRequestId: requestId.current,
            });
        } catch {
            return null;
        }
    };

    const save = async (answered: { duplicate?: boolean; delete?: boolean } = {}) => {
        if (busy.current) return;                 // a Save is already running (double click)
        setTriedSave(true);
        if (missing.length) {
            toast.warning(`${t('form.requiredHint')}`);
            return;
        }
        busy.current = true;
        setSaving(true);
        try {
            const n = normalised(v);
            const current = target();
            const before = current ? normalised(fromItem(current)) : null;
            const identityChanged = !before || n.name !== before.name || n.brand !== before.brand || n.model !== before.model;
            if (!answered.duplicate && identityChanged) {
                const dups = await findDuplicates();
                if (dups === null) {
                    setAsk({ kind: 'duplicateFailed', message: mt('duplicateCheckFailed'), answered });
                    return;
                }
                if (dups.length) {
                    setAsk({ kind: 'duplicate', message: mt('duplicateFound', { list: dups.map((d) => d.documentNumber).join('、') }), answered });
                    return;
                }
            }
            if (!answered.delete && deletedFileIds.length) {
                setAsk({ kind: 'delete', message: mt('confirmDeletePhotos', { n: deletedFileIds.length }), answered });
                return;
            }
            lastWriteUnknown.current = false;
            const outcome = await runSaveFlow({
                writeRecord,
                uploads: pendingPhotos.length ? [{ category: PHOTO_CATEGORY, files: pendingPhotos }] : [],
                deletedFileIds,
                upload: (revisionId, group) => uploadFiles(MATERIAL_ENTITY, revisionId, group.files, group.category),
                remove: deleteFile,
                reload: onReload,
                describe: (e) => {
                    if (!written.current) {
                        lastWriteUnknown.current = classifyWriteFailure(e).kind === 'unknown';
                        if (lastWriteUnknown.current && !editing) setMaybeCreated(true);
                    }
                    return describeSaveError(e, t);
                },
            });
            applyOutcome(outcome);
        } finally {
            busy.current = false;
            setSaving(false);
        }
    };

    const revisionId = written.current?.revisionId ?? item?.revisionId;
    return (
        <div className={formStyles.modalOverlay} data-testid="register-dialog">
            <div className={formStyles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={formStyles.modalHeader}>
                    <h2>{editing ? `${mt('registerEdit')} — ${item?.documentNumber}` : mt('registerNew')}</h2>
                    <button className={formStyles.closeButton} aria-label={t('common.close')} title={t('common.close')} onClick={requestClose} disabled={saving}>×</button>
                </div>
                <div className={formStyles.modalBody}>
                    <p className={formStyles.formRequiredHint}>{t('form.requiredHint')}</p>
                    <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 'auto' }}>
                        <div className={formStyles.formSections}>
                            <div className={formStyles.formSection}>
                                <h3 className={formStyles.sectionTitle}>核准資訊 / Approval</h3>
                                <div className={formStyles.formGrid}>
                                    <div className={formStyles.formGroup}>
                                        {label('vendor', true)}
                                        <select className={formStyles.formSelect} value={v.vendorId} disabled={vendorLocked} data-testid="register-vendor"
                                                onChange={(e) => set('vendorId', e.target.value)}>
                                            <option value="">{mt('chooseVendor')}</option>
                                            {vendors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                            {editing && item && !vendors.some((c) => c.id === item.vendorId) && <option value={item.vendorId}>{item.vendorName ?? item.vendorId}</option>}
                                        </select>
                                        {errorText('vendorId')}
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        {label('approvalResult', true)}
                                        <select className={formStyles.formSelect} value={v.resultCode} data-testid="register-result"
                                                onChange={(e) => set('resultCode', e.target.value)}>
                                            <option value="Approved">{mt('status.Approved')}</option>
                                            <option value="ApprovedWithComments">{mt('status.ApprovedWithComments')}</option>
                                        </select>
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        {label('approvedDate', true)}
                                        <input type="date" className={formStyles.formInput} value={v.approvedDate} data-testid="register-date"
                                               onChange={(e) => set('approvedDate', e.target.value)} />
                                        {errorText('approvedDate')}
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        {label('approvedBy', false)}
                                        <input className={formStyles.formInput} value={v.decisionMaker ?? ''} data-testid="register-maker"
                                               onChange={(e) => set('decisionMaker', e.target.value)} />
                                    </div>
                                    <div className={formStyles.formGroup}>
                                        {label('externalApprovalNo', false)}
                                        <input className={formStyles.formInput} value={v.externalDocNo ?? ''} data-testid="register-docno"
                                               onChange={(e) => set('externalDocNo', e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            <div className={formStyles.formSection}>
                                <h3 className={formStyles.sectionTitle}>材料資料 / Material</h3>
                                <div className={formStyles.formGrid}>
                                    <div className={formStyles.formGroup}>
                                        {label('materialName', true)}
                                        <input className={formStyles.formInput} value={v.name} data-testid="register-name" onChange={(e) => set('name', e.target.value)} />
                                        {errorText('name')}
                                    </div>
                                    {MATERIAL_TEXT.map(([k, key]) => (
                                        <div key={k} className={formStyles.formGroup}>
                                            {label(key, false)}
                                            <input className={formStyles.formInput} value={(v[k] as string) ?? ''} data-testid={`register-${k}`}
                                                   onChange={(e) => set(k, e.target.value)} />
                                        </div>
                                    ))}
                                    <div className={formStyles.formGroupFull}>
                                        {label('specReference', false)}
                                        <textarea className={formStyles.formTextarea} rows={2} value={v.specReference ?? ''} data-testid="register-specReference"
                                                  onChange={(e) => set('specReference', e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            <div className={formStyles.formSection}>
                                <h3 className={formStyles.sectionTitle}>照片 / Photos</h3>
                                <FileAttachment
                                    id="material-register-photos"
                                    category={PHOTO_CATEGORY}
                                    entityType={revisionId ? MATERIAL_ENTITY : undefined}
                                    entityId={revisionId}
                                    title={mt('photos')}
                                    hideTitle
                                    accept="image/*"
                                    syncToken={photoSync}
                                    onPendingFilesChange={setPendingPhotos}
                                    onDeleteExistingFile={(id) => setDeletedFileIds((cur) => (cur.includes(id) ? cur : [...cur, id]))}
                                    onPreview={(url, name) => setPreview({ url, name: name || '' })}
                                />
                            </div>
                        </div>
                    </fieldset>
                </div>
                <FormActions
                    cancel={<button className={actionStyles.secondary} type="button" onClick={requestClose} disabled={saving}>{t('common.cancel')}</button>}
                    primary={<button className={actionStyles.primary} type="button" onClick={() => void save()} disabled={saving || !!ask} data-testid="register-save">
                        {saving ? t('common.saving') : t('common.save')}
                    </button>}
                />
            </div>
            <ConfirmModal
                isOpen={!!ask}
                title={ask?.kind === 'duplicate' ? mt('duplicateTitle') : ask?.kind === 'duplicateFailed' ? mt('duplicateCheckFailedTitle') : mt('confirmDeletePhotoTitle')}
                message={ask?.message ?? ''}
                intent={ask?.kind === 'delete' ? 'danger' : 'primary'}
                confirmText={ask?.kind === 'duplicate' ? mt('saveAnyway') : ask?.kind === 'duplicateFailed' ? mt('saveWithoutCheck') : mt('deleteFile')}
                cancelText={t('common.cancel')}
                onCancel={() => setAsk(null)}
                onConfirm={() => {
                    if (!ask) return;
                    // answers add up: a later question never repeats an earlier one; skipping a failed check answers "duplicate"
                    const next = { ...ask.answered, [ask.kind === 'delete' ? 'delete' : 'duplicate']: true };
                    setAsk(null);
                    void save(next);
                }}
            />
            {preview && <ImagePreviewOverlay key={preview.url} url={preview.url} name={preview.name} onClose={() => setPreview(null)} />}
        </div>
    );
};

export default RegisterDialog;
