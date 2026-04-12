// Cross-module related document types — matches backend schemas.RelatedEntity
// See backend/workflows/relationships.py for the graph definition.

export type RelatedEntityType = 'itp' | 'noi' | 'itr' | 'ncr';

export type RelatedDirection = 'upstream' | 'downstream';

export interface RelatedEntity {
    entityType: RelatedEntityType;
    id: string;
    referenceNo: string | null;
    title: string | null;
    status: string | null;
    vendorName: string | null;
    /** 1 = direct neighbour, 2 = neighbour's neighbour, etc. */
    level: number;
    direction: RelatedDirection;
    /** Most meaningful date per entity type (submissionDate/inspectionDate/raiseDate). */
    primaryDate: string | null;
}

export interface RelatedEntitiesResponse {
    upstream: RelatedEntity[];
    downstream: RelatedEntity[];
}
