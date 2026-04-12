"""Cross-module document relationship graph.

Single source of truth for "which modules link to which" — used by
``RelatedService`` to power the `<RelatedDocuments />` panel. When new
FKs land (Phase 1 PR2 = ``NCR.itr_id``, PR3 = ``ITP.pqp_id``), extend
``EDGES`` below and every ``/{module}/{id}/related`` endpoint picks it
up automatically.

Design notes
------------
- An *edge* describes how to hop from one entity to its neighbour in a
  given direction. We keep direction explicit (``upstream`` vs
  ``downstream``) so traversal is unambiguous — no need to invert edges.
- ``traverse`` takes the *source SQLAlchemy entity* and returns a flat
  list of neighbour entities. It uses the existing relationship
  attributes declared in ``models.py`` (e.g. ``itp.nois``, ``noi.itp_ref``)
  rather than re-issuing SQL, so the cost is just attribute access after
  SQLAlchemy has loaded the row.
- Edges are **uni-directional by intent**: ``itp -> noi`` is explicitly
  ``downstream``, ``noi -> itp`` is explicitly ``upstream``. We could
  auto-mirror, but the explicit form lets future edges have asymmetric
  semantics (e.g. an audit link that only walks one way).
"""

from dataclasses import dataclass
from typing import Any, Callable, List

# Entity types we know about in this phase. OBS / FAT / FollowUp / PQP
# are intentionally absent — they join the chain in later PRs.
EntityType = str  # 'itp' | 'noi' | 'itr' | 'ncr'

Direction = str  # 'upstream' | 'downstream'


@dataclass(frozen=True)
class Edge:
    source_type: EntityType
    direction: Direction
    target_type: EntityType
    # (source_entity) -> list[target_entity]
    traverse: Callable[[Any], List[Any]]


def _noi_from(entity: Any) -> List[Any]:
    """Return [noi_ref] if set, else []. Used by both ITR and NCR upstream."""
    ref = getattr(entity, "noi_ref", None)
    return [ref] if ref is not None else []


def _itp_from_noi(noi: Any) -> List[Any]:
    ref = getattr(noi, "itp_ref", None)
    return [ref] if ref is not None else []


EDGES: List[Edge] = [
    # ITP -> NOI (downstream)
    Edge("itp", "downstream", "noi",
         lambda itp: list(getattr(itp, "nois", None) or [])),
    # NOI -> ITP (upstream)
    Edge("noi", "upstream", "itp", _itp_from_noi),
    # NOI -> ITR (downstream)
    Edge("noi", "downstream", "itr",
         lambda noi: list(getattr(noi, "itrs", None) or [])),
    # NOI -> NCR (downstream)
    Edge("noi", "downstream", "ncr",
         lambda noi: list(getattr(noi, "ncrs", None) or [])),
    # ITR -> NOI (upstream)
    Edge("itr", "upstream", "noi", _noi_from),
    # NCR -> NOI (upstream)
    Edge("ncr", "upstream", "noi", _noi_from),
]


def edges_from(source_type: EntityType, direction: Direction) -> List[Edge]:
    """Return every edge leaving ``source_type`` in ``direction``."""
    return [e for e in EDGES if e.source_type == source_type and e.direction == direction]


# Entity types this module knows how to reason about. Used by the router
# layer to reject unknown types before they hit the service.
KNOWN_ENTITY_TYPES = frozenset({"itp", "noi", "itr", "ncr"})
