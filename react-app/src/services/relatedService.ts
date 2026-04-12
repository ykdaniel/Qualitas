// API client for cross-module related-documents lookup.
// Each entity type hits its own module's `/related` endpoint so existing
// per-module permissions (ITP_VIEW, NOI_VIEW, ...) apply automatically.

import api from './api';
import type {
    RelatedEntityType,
    RelatedEntitiesResponse,
} from '../types/related';

export async function fetchRelated(
    entityType: RelatedEntityType,
    entityId: string,
    maxDepth = 2,
): Promise<RelatedEntitiesResponse> {
    const { data } = await api.get<RelatedEntitiesResponse>(
        `/${entityType}/${entityId}/related`,
        { params: { max_depth: maxDepth } },
    );
    return data ?? { upstream: [], downstream: [] };
}
