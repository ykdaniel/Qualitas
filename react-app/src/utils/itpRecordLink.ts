import api from '../services/api';

// ITP inspection items' "Record" column links to a document that a real, already-completed
// inspection produced — either an ITR or a Checklist. The document number ALONE cannot tell
// which kind it is: every document type in this system (ITR, ITP, Checklist, NOI...) shares the
// same "QTS-..." numbering convention, so a prefix check (the previous behavior) misroutes any
// real ITR document number that happens to also start with "QTS" — which is all of them. This
// resolves the value by actually looking it up against both real endpoints instead.
export type ItpRecordLinkResult =
    | { kind: 'itr'; documentNumber: string }
    | { kind: 'checklist'; recordsNo: string }
    | { kind: 'not_found' }
    | { kind: 'ambiguous'; itrDocumentNumbers: string[]; checklistRecordsNos: string[] }
    | { kind: 'forbidden' }
    | { kind: 'error' };

export async function resolveItpRecordLink(value: string): Promise<ItpRecordLinkResult> {
    if (!value || value === '-') return { kind: 'not_found' };

    const [itrResult, checklistResult] = await Promise.allSettled([
        api.get('/itr/', { params: { search: value, limit: 20 } }),
        // include_instances: a Record value may point to a Checklist INSTANCE linked to an ITR
        // (itrId set), which the default list (bare templates only) would otherwise miss.
        api.get('/checklist/', { params: { search: value, limit: 20, include_instances: true } }),
    ]);

    // The search endpoints do a substring (ILIKE) match — filter down to an exact document
    // number/recordsNo match, since a substring hit is not the same document.
    const itrMatches = itrResult.status === 'fulfilled'
        ? (itrResult.value.data || []).filter((itr: any) => itr.documentNumber === value)
        : [];
    const checklistMatches = checklistResult.status === 'fulfilled'
        ? (checklistResult.value.data || []).filter((c: any) => c.recordsNo === value)
        : [];

    const totalMatches = itrMatches.length + checklistMatches.length;
    if (totalMatches === 1) {
        return itrMatches.length === 1
            ? { kind: 'itr', documentNumber: itrMatches[0].documentNumber }
            : { kind: 'checklist', recordsNo: checklistMatches[0].recordsNo };
    }
    if (totalMatches > 1) {
        return {
            kind: 'ambiguous',
            itrDocumentNumbers: itrMatches.map((itr: any) => itr.documentNumber),
            checklistRecordsNos: checklistMatches.map((c: any) => c.recordsNo),
        };
    }

    // No exact match from either endpoint. Only report "forbidden" when a real permission
    // rejection is why we found nothing — a genuine 0-result search must still say "not found",
    // not be swallowed into "forbidden" just because the OTHER endpoint also failed for some
    // unrelated reason.
    const itrForbidden = itrResult.status === 'rejected' && (itrResult.reason as any)?.response?.status === 403;
    const checklistForbidden = checklistResult.status === 'rejected' && (checklistResult.reason as any)?.response?.status === 403;
    if (itrForbidden || checklistForbidden) return { kind: 'forbidden' };

    const itrErrored = itrResult.status === 'rejected';
    const checklistErrored = checklistResult.status === 'rejected';
    if (itrErrored && checklistErrored) return { kind: 'error' };

    return { kind: 'not_found' };
}
