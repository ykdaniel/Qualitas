/**
 * Material page (MATERIAL-SUBMITTAL M6, DECISIONS 材料：只作為核准材料登錄簿): a register of ALREADY externally approved
 * materials of the project chosen in the global selector — materials are never listed or picked across projects. Layout as
 * the other modules (OSD): result chips on the left, search + add on the right, the shared DataTable below. The shared DataTable lists them;
 * a row opens the approved-material view (photos first). There is no submittal workflow in the interface any more.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { LayoutGrid, Search, Table2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import shellStyles from '../Shared/ModuleShell.module.css';
import formStyles from '../Shared/FormShell.module.css';
import { useAuth } from '../../context/AuthContext';
import { useContractorsStore } from '../../store/contractorsStore';
import { useProjectStore } from '../../store/projectStore';
import { listApproved, type ApprovedMaterial } from '../../services/materialApi';
import { useDebounce } from '../../hooks/useDebounce';
import { appendUnique, createListGuard, filterRowsLikeTable } from '../../utils/materialSubmittal';
import { useMaterialText } from './materialText';
import { Notice } from './parts';
import { DataTable } from '../Shared/DataTable/DataTable';
import { createApprovedColumns } from './columns';
import ApprovedMaterialModal from './ApprovedMaterialModal';
import RegisterDialog from './RegisterDialog';
import MaterialShelf from './MaterialShelf';

const PAGE = 200;

type ResultChip = '' | 'Approved' | 'ApprovedWithComments';
type ViewMode = 'table' | 'shelf';
const VIEW_KEY = 'qualitas.materials.view';          // per-viewer convenience only; the page works without it
const readView = (): ViewMode => { try { return localStorage.getItem(VIEW_KEY) === 'shelf' ? 'shelf' : 'table'; } catch { return 'table'; } };
const CHIPS: ResultChip[] = ['', 'Approved', 'ApprovedWithComments'];

const MaterialSubmittal: React.FC = () => {
    const mt = useMaterialText();
    const { hasPermission } = useAuth();
    const canView = hasPermission('material:view:all');
    const canManage = hasPermission('material:manage:all');
    // Same as the other modules: the project comes from the global selector at the top right. Approved materials are kept
    // per project (DECISIONS), so "All projects" shows a prompt instead of a cross-project list.
    const { currentProject } = useProjectStore();
    const { getActiveContractors, fetchOptions } = useContractorsStore();

    useEffect(() => { void fetchOptions(); }, [fetchOptions]);

    if (!canView) return <div className={shellStyles.container}><Notice tone="error">{mt('noPermission')}</Notice></div>;

    return (
        <div className={shellStyles.container} data-testid="material-submittal-page">
            {!currentProject ? <Notice tone="info" testId="select-project">{mt('selectProject')}</Notice>
                : <ApprovedRegister key={currentProject.id} projectId={currentProject.id} canManage={canManage}
                                    vendors={getActiveContractors().map((c) => ({ id: c.id, name: c.name }))} />}
        </div>
    );
};

const ApprovedRegister: React.FC<{ projectId: string; canManage: boolean; vendors: { id: string; name: string }[] }>
    = ({ projectId, canManage, vendors }) => {
    const mt = useMaterialText();
    const [q, setQ] = useState('');
    const dq = useDebounce(q, 400);
    const [result, setResult] = useState<ResultChip>('');
    const [counts, setCounts] = useState<Record<string, number | null>>({});
    const [rows, setRows] = useState<ApprovedMaterial[]>([]);
    const [total, setTotal] = useState(0);
    const [error, setError] = useState(false);
    const [opened, setOpened] = useState<ApprovedMaterial | null>(null);
    const [dialog, setDialog] = useState<{ item: ApprovedMaterial | null } | null>(null);
    const [countsToken, setCountsToken] = useState(0);
    const columns = useMemo(() => createApprovedColumns(mt), [mt]);
    const [exporting, setExporting] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    // Table / shelf (user's choice 2026-10-09). The table stays mounted (hidden) in shelf mode so its header filters are kept, and
    // the shelf shows exactly the rows the table would show.
    const [view, setView] = useState<ViewMode>(readView);
    const chooseView = (v: ViewMode) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage unavailable */ } };
    const shelfRows = useMemo(() => (view === 'shelf' ? filterRowsLikeTable(rows, columns, columnFilters) : []), [view, rows, columns, columnFilters]);
    const filters = useMemo(() => ({ q: dq || undefined, result: result || undefined }), [dq, result]);
    // R2 (review R6): every list request belongs to a generation; an answer of an older one (other search / chip / project, or
    // a reload) is dropped, and only one "load more" runs at a time.
    const [guard] = useState(createListGuard);

    /** first page of the current search + chip; false = it could not be read (an answer that came too late counts as done) */
    const loadFirst = useCallback(async (): Promise<boolean> => {
        const gen = guard.restart();
        setLoadingMore(false);
        try {
            const page = await listApproved(projectId, { ...filters, limit: PAGE, offset: 0 });
            if (guard.isCurrent(gen)) { setRows(page.items); setTotal(page.total); setError(false); }
            return true;
        } catch {
            if (guard.isCurrent(gen)) setError(true);
            return false;
        }
    }, [projectId, filters, guard]);

    useEffect(() => {
        void loadFirst();
        return () => { guard.restart(); };                    // leaving these filters: their late answers are stale
    }, [loadFirst, guard]);

    const loadMore = async () => {
        const gen = guard.beginMore();
        if (gen === null) return;                              // one is already running (double click)
        setLoadingMore(true);
        try {
            const page = await listApproved(projectId, { ...filters, limit: PAGE, offset: rows.length });
            if (!guard.isCurrent(gen)) return;
            setRows((cur) => appendUnique(cur, page.items, (r) => r.submittalId));
            setTotal(page.total);
        } catch {
            if (guard.isCurrent(gen)) toast.error(mt('loadFailed'));          // the button stays: press it again to retry
        } finally {
            if (guard.isCurrent(gen)) setLoadingMore(false);
            guard.endMore(gen);
        }
    };

    /** for the form's save flow: re-reads the list (and the chip counts); false = the list could not be re-read */
    const reloadNow = async (): Promise<boolean> => {
        setCountsToken((n) => n + 1);
        return loadFirst();
    };

    /** Excel of EVERY record matching the current search, chip AND column-header filters (R2, review R5) — fetched page by page
     * from the server, then filtered by the same table engine as the screen — not only the loaded rows. */
    const exportExcel = async () => {
        setExporting(true);
        try {
            const fetched: ApprovedMaterial[] = [];
            for (let offset = 0; ; offset += 500) {
                const page = await listApproved(projectId, { ...filters, limit: 500, offset });
                fetched.push(...page.items);
                if (fetched.length >= page.total || page.items.length === 0) break;
            }
            const all = filterRowsLikeTable(fetched, columns, columnFilters);
            if (all.length === 0) { toast.warning(mt('nothingToExport')); return; }
            const resultText = (r: string) => mt(`status.${r}` as Parameters<typeof mt>[0]);
            const rowsOut = all.map((r, i) => ({
                '#': i + 1, [mt('recordNo')]: r.documentNumber, [mt('approvalResult')]: resultText(r.result), [mt('vendor')]: r.vendorName ?? '',
                [mt('materialName')]: r.name ?? '', [mt('category')]: r.category ?? '', [mt('brand')]: r.brand ?? '', [mt('model')]: r.model ?? '',
                [mt('specification')]: r.specification ?? '', [mt('manufacturer')]: r.manufacturer ?? '', [mt('supplier')]: r.supplier ?? '',
                [mt('approvedDate')]: r.approvedDate ?? '', [mt('approvedBy')]: r.decisionMaker ?? '', [mt('externalApprovalNo')]: r.externalDocNo ?? '',
                [mt('specReference')]: r.specReference ?? '',
            }));
            const sheet = XLSX.utils.json_to_sheet(rowsOut);
            sheet['!cols'] = Object.keys(rowsOut[0]).map((k) => ({ wch: Math.min(60, Math.max(k.length, ...rowsOut.map((row) => String(row[k] ?? '').length)) + 2) }));
            const book = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(book, sheet, 'Materials');
            const now = new Date();                                    // local date (toISOString would give the UTC day)
            const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            XLSX.writeFile(book, `Materials_${projectId}_${day}.xlsx`);
        } catch {
            toast.error(mt('exportFailed'));
        } finally {
            setExporting(false);
        }
    };

    // chip counts follow the search but not the chip itself (each chip shows how many it would list)
    useEffect(() => {
        let alive = true;
        Promise.all(CHIPS.map((c) => listApproved(projectId, { q: dq || undefined, result: c || undefined, limit: 1, offset: 0 })
            .then((p) => p.total).catch(() => null)))
            .then((totals) => { if (alive) setCounts(Object.fromEntries(CHIPS.map((c, i) => [c, totals[i]]))); });
        return () => { alive = false; };
    }, [projectId, dq, countsToken]);

    return (
        <>
            <div className={shellStyles.toolbar}>
                <div className={shellStyles.chipGroup} data-testid="result-chips">
                    {CHIPS.map((c) => (
                        <button key={c || 'all'} type="button" data-testid={`chip-${c || 'all'}`}
                                className={`${shellStyles.chip} ${result === c ? shellStyles.chipActive : ''}`} onClick={() => setResult(c)}>
                            {c ? mt(`status.${c}`) : mt('chipAll')}
                            <span className={shellStyles.chipCount}>{counts[c] ?? '–'}</span>
                        </button>
                    ))}
                </div>
                <div className={shellStyles.toolbarRight}>
                    <div className={shellStyles.chipGroup} role="group" aria-label={`${mt('viewTable')} / ${mt('viewShelf')}`} data-testid="view-switch">
                        {(['table', 'shelf'] as const).map((v) => (
                            <button key={v} type="button" aria-pressed={view === v} data-testid={`view-${v}`}
                                    className={`${shellStyles.chip} ${view === v ? shellStyles.chipActive : ''}`} onClick={() => chooseView(v)}>
                                {v === 'table' ? <Table2 size={14} strokeWidth={2} /> : <LayoutGrid size={14} strokeWidth={2} />}
                                {v === 'table' ? mt('viewTable') : mt('viewShelf')}
                            </button>
                        ))}
                    </div>
                    <div className={shellStyles.searchWrap}>
                        <Search className={shellStyles.searchIcon} size={15} strokeWidth={2} />
                        <input className={shellStyles.searchInput} placeholder={mt('searchApproved')} value={q} onChange={(e) => setQ(e.target.value)} data-testid="material-search" />
                    </div>
                    <button type="button" className={shellStyles.addNewButtonAlt} onClick={() => void exportExcel()} disabled={exporting} data-testid="export-excel">
                        {mt('exportExcel')}
                    </button>
                    {canManage && (
                        <button type="button" className={shellStyles.addNewButton} onClick={() => setDialog({ item: null })} data-testid="register-new">
                            {mt('addNewMaterial')}
                        </button>
                    )}
                </div>
            </div>
            {error && <Notice tone="error">{mt('loadFailed')} <button type="button" onClick={() => void loadFirst()}>{mt('retry')}</button></Notice>}
            <div className={shellStyles.content}>
                <div data-testid="material-table" style={view === 'shelf' ? { display: 'none' } : undefined}>
                    <DataTable columns={columns} data={rows} searchKey="" onRowClick={(m) => setOpened(m)} onColumnFiltersChange={setColumnFilters} />
                </div>
                {view === 'shelf' && <MaterialShelf rows={shelfRows} onOpen={(m) => setOpened(m)} />}
                {/* server paging: shown only while more rows exist than are loaded */}
                {rows.length < total && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                        <span style={{ fontSize: 13, color: '#6b6457' }} data-testid="approved-loaded-count">{mt('loaded', { n: rows.length, t: total })}</span>
                        <button type="button" className={formStyles.cancelButton} onClick={() => void loadMore()} disabled={loadingMore}
                                data-testid="approved-load-more">{loadingMore ? mt('loading') : mt('loadMore')}</button>
                    </div>
                )}
            </div>
            {opened && !dialog && <ApprovedMaterialModal item={opened} canManage={canManage} onClose={() => setOpened(null)}
                                                         onEdit={() => setDialog({ item: opened })} />}
            {dialog && <RegisterDialog projectId={projectId} vendors={vendors} item={dialog.item}
                                       onClose={() => setDialog(null)}
                                       onSaved={(saved) => { if (dialog.item) setOpened(saved); }}
                                       onReload={reloadNow} />}
        </>
    );
};

export default MaterialSubmittal;
