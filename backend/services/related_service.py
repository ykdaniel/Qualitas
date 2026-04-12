"""RelatedService — answers "what documents link to this one?" queries.

Used by ``GET /{module}/{id}/related`` on ITP / NOI / ITR / NCR to power
the frontend ``<RelatedDocuments />`` panel. The graph definition lives
in ``workflows.relationships`` so adding a new FK (future phases) only
requires one edit there.

Traversal is BFS, capped at ``max_depth`` to keep the work bounded when
a well-connected ITP fans out into many NOIs / ITRs / NCRs. Depth is
measured from the source entity: direct neighbours are level 1,
neighbours of neighbours are level 2, etc.
"""

import logging
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

import models
from workflows.relationships import KNOWN_ENTITY_TYPES, edges_from

logger = logging.getLogger(__name__)

# Per-entity metadata — which column holds the reference number, which
# one is the "primary date" to show in the card, and which field is the
# best human-readable title. Kept in one place so adding a new entity
# type only touches this dict plus the edges list.
_ENTITY_META: Dict[str, Dict[str, Any]] = {
    "itp": {
        "model": models.ITP,
        "reference_field": "referenceNo",
        "date_field": "submissionDate",
        "title_fields": ("description",),
    },
    "noi": {
        "model": models.NOI,
        "reference_field": "referenceNo",
        "date_field": "inspectionDate",
        # NOI has no description column — checkpoint is the closest
        # human-readable label, falling back to the package code.
        "title_fields": ("checkpoint", "package"),
    },
    "itr": {
        "model": models.ITR,
        "reference_field": "documentNumber",
        "date_field": "raiseDate",
        "title_fields": ("subject", "description"),
    },
    "ncr": {
        "model": models.NCR,
        "reference_field": "documentNumber",
        "date_field": "raiseDate",
        "title_fields": ("subject", "description"),
    },
}


class RelatedService:
    def __init__(self, db: Session):
        self.db = db

    def get_related(
        self,
        entity_type: str,
        entity_id: str,
        max_depth: int = 2,
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Return ``{'upstream': [...], 'downstream': [...]}`` for the entity.

        Both lists are flat, ordered by BFS discovery. An empty entity or
        unknown type returns empty lists rather than raising — the
        frontend treats "no related docs" and "source not found" the
        same way (UI shows an empty state).
        """
        if entity_type not in KNOWN_ENTITY_TYPES:
            logger.warning("RelatedService: unknown entity_type %r", entity_type)
            return {"upstream": [], "downstream": []}

        entity = self._load_entity(entity_type, entity_id)
        if entity is None:
            return {"upstream": [], "downstream": []}

        return {
            "upstream": self._traverse(entity, entity_type, "upstream", max_depth),
            "downstream": self._traverse(entity, entity_type, "downstream", max_depth),
        }

    # ─── Private helpers ──────────────────────────────────────────────

    def _load_entity(self, entity_type: str, entity_id: str) -> Optional[Any]:
        meta = _ENTITY_META.get(entity_type)
        if meta is None:
            return None
        model = meta["model"]
        return self.db.query(model).filter(model.id == entity_id).first()

    def _traverse(
        self,
        start_entity: Any,
        start_type: str,
        direction: str,
        max_depth: int,
    ) -> List[Dict[str, Any]]:
        """BFS up to ``max_depth`` hops, skipping already-visited nodes."""
        # Visited set prevents infinite loops if the graph ever gains a
        # cycle (it currently can't, but the cost of the guard is tiny).
        # We include the start node so it never reappears as a neighbour.
        visited: set = {(start_type, start_entity.id)}
        out: List[Dict[str, Any]] = []

        frontier: List[tuple] = [(start_entity, start_type, 0)]
        while frontier:
            next_frontier: List[tuple] = []
            for entity, entity_type, level in frontier:
                if level >= max_depth:
                    continue
                for edge in edges_from(entity_type, direction):
                    try:
                        neighbours = edge.traverse(entity) or []
                    except Exception as exc:  # pragma: no cover - defensive
                        logger.warning(
                            "RelatedService: edge %s->%s raised %s",
                            edge.source_type, edge.target_type, exc,
                        )
                        continue
                    for neighbour in neighbours:
                        if neighbour is None:
                            continue
                        key = (edge.target_type, neighbour.id)
                        if key in visited:
                            continue
                        visited.add(key)
                        out.append(
                            self._serialize(neighbour, edge.target_type, level + 1, direction)
                        )
                        next_frontier.append((neighbour, edge.target_type, level + 1))
            frontier = next_frontier

        return out

    def _serialize(
        self,
        entity: Any,
        entity_type: str,
        level: int,
        direction: str,
    ) -> Dict[str, Any]:
        meta = _ENTITY_META[entity_type]

        title: Optional[str] = None
        for field in meta["title_fields"]:
            value = getattr(entity, field, None)
            if value:
                title = value
                break

        vendor_name: Optional[str] = None
        vendor_ref = getattr(entity, "vendor_ref", None)
        if vendor_ref is not None:
            vendor_name = getattr(vendor_ref, "name", None)

        return {
            "entityType": entity_type,
            "id": entity.id,
            "referenceNo": getattr(entity, meta["reference_field"], None),
            "title": title,
            "status": getattr(entity, "status", None),
            "vendorName": vendor_name,
            "level": level,
            "direction": direction,
            "primaryDate": getattr(entity, meta["date_field"], None),
        }
