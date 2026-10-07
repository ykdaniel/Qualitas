import React, { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { getItrApprovalEvent, getItrApprovalEvents } from '../../services/api';
import { getErrorMessage } from '../../utils/errorUtils';
import { classifyResult } from '../../utils/checklistResult';
import {
    ApprovalEventDetail, ApprovalEventPage, ApprovalEventSummary,
    ITR_SNAPSHOT_FIELDS, actorOf, formatLocalWithZone, formatUtc, isApproval, pageWindow, revokedTarget, snapshotItems,
} from '../../utils/approvalHistory';

// READ-ONLY approval history for one ITR (2026-09-20).
//
// Everything on screen is the STORED event and its stored snapshots: the actor's name / account as they were
// then, the server's UTC time, and the ITR + Checklist content as saved at approval. Nothing is looked up
// from the current user, the current ITR or the current Checklist, and there is no action here that writes,
// restores or overwrites anything.

const PAGE_SIZE = 20;

interface Props {
    itrId: string;
    documentNumber?: string;
    onClose: () => void;
}

type DetailState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; data: ApprovalEventDetail };

const ITRApprovalHistoryModal: React.FC<Props> = ({ itrId, documentNumber, onClose }) => {
    const { t, language } = useLanguage();
    const [skip, setSkip] = useState(0);
    const [page, setPage] = useState<ApprovalEventPage | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [expanded, setExpanded] = useState<Record<number, boolean>>({});
    const [details, setDetails] = useState<Record<number, DetailState>>({});

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        getItrApprovalEvents(itrId, { skip, limit: PAGE_SIZE })
            .then((p) => { if (!cancelled) { setPage(p); setLoading(false); } })
            .catch((e) => { if (!cancelled) { setError(getErrorMessage(e, t('itr.history.loadFailed'))); setLoading(false); } });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [itrId, skip, reloadKey]);

    const loadDetail = useCallback((eventId: number) => {
        setDetails((d) => ({ ...d, [eventId]: { status: 'loading' } }));
        getItrApprovalEvent(itrId, eventId)
            .then((data) => setDetails((d) => ({ ...d, [eventId]: { status: 'ok', data } })))
            .catch((e) => {
                // Always the localized sentence; the raw reason (backend detail / network error) is appended, never substituted.
                const raw = getErrorMessage(e, '');
                setDetails((d) => ({ ...d, [eventId]: { status: 'error', message: raw ? `${t('itr.history.contentFailed')} (${raw})` : t('itr.history.contentFailed') } }));
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [itrId]);

    const toggle = (e: ApprovalEventSummary) => {
        const open = !expanded[e.id];
        setExpanded((x) => ({ ...x, [e.id]: open }));
        if (open && !details[e.id]) loadDetail(e.id);              // the snapshot is fetched only when the event is opened
    };

    const locale = language === 'zh' ? 'zh-TW' : 'en-US';
    const win = page ? pageWindow({ skip: page.skip, limit: page.limit, total: page.total, count: page.items.length }) : null;

    const val = (v: unknown) => (v === null || v === undefined || v === '' ? <span className="text-slate-400">{t('itr.history.notRecorded')}</span> : String(v));

    const renderSnapshot = (d: ApprovalEventDetail) => {
        if (!d.itr_snapshot && !d.checklists_snapshot) {
            return <p className="text-sm text-slate-500" data-history-nosnapshot>{t('itr.history.noSnapshot')}</p>;
        }
        const checklists = d.checklists_snapshot || [];
        return (
            <div className="space-y-4" data-history-detail>
                {d.itr_snapshot && (
                    <section>
                        <h4 className="text-sm font-bold text-slate-700">{t('itr.history.snapshotItr')}</h4>
                        <dl className="mt-1 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
                            {ITR_SNAPSHOT_FIELDS.map(([key, label]) => (
                                <React.Fragment key={key}>
                                    <dt className="text-slate-500">{t(label)}</dt>
                                    <dd className="text-slate-800 break-all" data-snap-itr={key}>{val((d.itr_snapshot as Record<string, unknown>)[key])}</dd>
                                </React.Fragment>
                            ))}
                        </dl>
                    </section>
                )}
                <section>
                    <h4 className="text-sm font-bold text-slate-700">{t('itr.history.snapshotChecklists')}</h4>
                    {checklists.length === 0 && <p className="mt-1 text-sm text-slate-500">{t('itr.history.noChecklists')}</p>}
                    {checklists.map((c, idx) => (
                        <div key={String(c.id ?? idx)} className="mt-2 rounded-md border border-slate-200 p-2" data-snap-checklist={String(c.recordsNo ?? '')}>
                            <div className="text-sm font-semibold text-slate-800">{val(c.recordsNo)} — {val(c.activity)}</div>
                            <div className="mt-1 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-0.5 text-xs text-slate-600">
                                <span>{t('itr.history.field.status')}</span><span data-snap-status>{val(c.status)}</span>
                                <span>{t('itr.history.chk.counts')}</span><span>{val(c.passCount)} / {val(c.failCount)}</span>
                                <span>{t('itr.history.chk.template')}</span><span className="break-all" data-snap-template>{val(c.template_id)}</span>
                                <span>{t('itr.history.chk.templateVersion')}</span><span data-snap-version>{val(c.source_template_version)}</span>
                            </div>
                            <table className="mt-2 w-full border-collapse text-xs">
                                <thead>
                                    <tr className="bg-slate-50 text-left text-slate-600">
                                        <th className="border border-slate-200 p-1">{t('itr.history.chk.item')}</th>
                                        <th className="border border-slate-200 p-1">{t('itr.history.chk.criteria')}</th>
                                        <th className="border border-slate-200 p-1">{t('itr.history.chk.observation')}</th>
                                        <th className="border border-slate-200 p-1">{t('itr.history.chk.result')}</th>
                                        <th className="border border-slate-200 p-1">{t('itr.history.chk.naReason')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {snapshotItems(c).map((it, i) => {
                                        const kind = classifyResult(it.result);
                                        const label = kind === 'unknown' ? t('checklist.result.unknown', { value: String(it.result) }) : t(`checklist.result.${kind}`);
                                        return (
                                            <tr key={i} data-snap-item={i}>
                                                <td className="border border-slate-200 p-1">{val(it.item)}</td>
                                                <td className="border border-slate-200 p-1">{val(it.criteria)}</td>
                                                <td className="border border-slate-200 p-1" data-snap-observation>{it.situation ? String(it.situation) : ''}</td>
                                                <td className="border border-slate-200 p-1" data-snap-result={kind}>{label}</td>
                                                <td className="border border-slate-200 p-1" data-snap-na>{it.naReason ? String(it.naReason) : ''}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </section>
                {d.snapshot_sha256 && (
                    <section className="text-xs text-slate-500">
                        <div className="font-semibold text-slate-600">{t('itr.history.hash')}</div>
                        <div className="break-all font-mono">{d.snapshot_sha256}</div>
                        <div data-hash-status={String(d.snapshot_sha256_matches)}>
                            {d.snapshot_sha256_matches === true && t('itr.history.hashMatches')}
                            {d.snapshot_sha256_matches === false && <span className="font-bold text-red-600">{t('itr.history.hashMismatch')}</span>}
                        </div>
                        <div>{t('itr.history.hashNote')}</div>
                    </section>
                )}
            </div>
        );
    };

    const renderEvent = (e: ApprovalEventSummary) => {
        const approved = isApproval(e);
        const who = actorOf(e);
        const target = revokedTarget(e);
        const local = formatLocalWithZone(e.occurred_at, locale);
        const detail = details[e.id];
        return (
            <li key={e.id} className="rounded-lg border border-slate-200 p-3" data-history-event={e.sequence} data-event-type={e.event_type}>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">#{e.sequence}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${approved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {approved ? t('itr.history.event.approved') : t('itr.history.event.revoked')}
                    </span>
                    <span className="text-xs text-slate-500">{e.status_before} → {e.status_after}</span>
                </div>
                <div className="mt-1 text-sm">
                    <span className="text-slate-500">{t('itr.history.by')}: </span>
                    <span className="font-semibold text-slate-800" data-actor-name>{who.name ?? t('itr.history.actorNotRecorded')}</span>
                    {who.username && <span className="text-slate-500"> ({who.username}<span className="text-slate-400"> · {t('itr.history.accountAtTime')}</span>)</span>}
                </div>
                <div className="text-sm text-slate-700">
                    <span data-event-time-utc>{formatUtc(e.occurred_at)}</span>
                    {local && <span className="ml-2 text-xs text-slate-500">({t('itr.history.local')}: <span data-event-time-local>{local}</span>)</span>}
                </div>
                {!approved && (
                    <div className="mt-1 space-y-0.5 text-sm">
                        <div><span className="text-slate-500">{t('itr.history.reason')}: </span><span data-event-reason>{e.reason || t('itr.history.notRecorded')}</span></div>
                        <div className="text-slate-600" data-event-target={target.kind}>
                            {target.kind === 'known' && (target.sequence !== null
                                ? t('itr.history.endedApproval', { n: target.sequence })
                                : t('itr.history.endedApprovalNoNumber', { id: target.id }))}
                            {target.kind === 'unknown' && t('itr.history.endedApprovalUnknown')}
                        </div>
                    </div>
                )}
                {approved && (
                    <div className="mt-2">
                        <button
                            type="button"
                            className="text-sm font-semibold text-blue-700 hover:underline"
                            data-history-expand={e.sequence}
                            aria-expanded={!!expanded[e.id]}
                            onClick={() => toggle(e)}
                        >
                            {expanded[e.id] ? t('itr.history.hideContent') : t('itr.history.viewContent')}
                        </button>
                        {expanded[e.id] && (
                            <div className="mt-2 rounded-md bg-slate-50 p-3">
                                {(!detail || detail.status === 'loading') && <p className="text-sm text-slate-500">{t('itr.history.contentLoading')}</p>}
                                {detail?.status === 'error' && (
                                    <div className="text-sm text-red-700" data-history-detail-error>
                                        {detail.message}{' '}
                                        <button type="button" className="font-semibold underline" data-history-detail-retry onClick={() => loadDetail(e.id)}>{t('itr.history.retry')}</button>
                                    </div>
                                )}
                                {detail?.status === 'ok' && renderSnapshot(detail.data)}
                            </div>
                        )}
                    </div>
                )}
            </li>
        );
    };

    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50" data-history-modal>
            <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-2xl">
                <div className="border-b border-slate-200 p-4">
                    <h3 className="text-lg font-bold text-slate-800">
                        {t('itr.approvalHistory')}{documentNumber ? ` — ${documentNumber}` : ''}
                    </h3>
                    <p className="mt-1 text-xs text-slate-600">{t('itr.history.subtitle')}</p>
                    <p className="mt-1 text-xs text-slate-500">{t('itr.history.timesNote')}</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                    {loading && <p className="text-sm text-slate-500" data-history-loading>{t('itr.history.loading')}</p>}
                    {!loading && error && (
                        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" data-history-error>
                            <div>{t('itr.history.loadFailed')} {error !== t('itr.history.loadFailed') ? `(${error})` : ''}</div>
                            <button type="button" className="mt-2 font-semibold underline" data-history-retry onClick={() => setReloadKey((k) => k + 1)}>{t('itr.history.retry')}</button>
                        </div>
                    )}
                    {!loading && !error && page && page.total === 0 && (
                        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700" data-history-empty>
                            <div className="font-semibold">{t('itr.history.empty')}</div>
                            <div className="mt-1 text-xs text-slate-500">{t('itr.history.emptyNote')}</div>
                        </div>
                    )}
                    {!loading && !error && page && page.items.length > 0 && (
                        <ol className="space-y-3" data-history-list>{page.items.map(renderEvent)}</ol>
                    )}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                        {win && page && page.total > 0 && (
                            <>
                                <button type="button" className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40" data-history-prev disabled={!win.hasPrev || loading}
                                    onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>{t('itr.history.prev')}</button>
                                <span data-history-range>{t('itr.history.range', { from: win.from, to: win.to, total: win.total })}</span>
                                <button type="button" className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40" data-history-next disabled={!win.hasNext || loading}
                                    onClick={() => setSkip(skip + PAGE_SIZE)}>{t('itr.history.next')}</button>
                            </>
                        )}
                    </div>
                    <button type="button" className="rounded border border-slate-300 px-3 py-1 text-sm" data-history-close onClick={onClose}>{t('common.close')}</button>
                </div>
            </div>
        </div>
    );
};

export default ITRApprovalHistoryModal;
