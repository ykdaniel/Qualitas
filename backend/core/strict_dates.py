"""Strict date rules for NCR / OBS / NOI (2026-09-20) — a SEPARATE module on purpose.

The older, lenient ``schemas.validate_date_format`` (prefix regex, silently truncates timestamps) is still used by eight
other modules that have not been verified, so it is left untouched. Everything here is NEW and only wired into NCR, OBS
and NOI.

WRITES accept only a complete, calendar-valid ``YYYY-MM-DD``: no time stamp, no trailing characters, no surrounding
whitespace, no non-existent day; nothing is truncated or normalised. NULL / '' are governed by each field's own
required-ness (NOI's issueDate / inspectionDate are required and may not be set to NULL; every other date field here is
optional). On UPDATE the rule is applied to a field only when its value actually CHANGES — re-sending a historical value
unchanged is not a new write — and the cross-field order rules (NCR only; NOI and OBS have none) are checked on the merged
final content, and only for relations that involve a changed field, so an unrelated edit is never blocked by an old
inconsistency.

READS never fail because of a date: :func:`compute_date_issues` describes what is wrong (stable codes) and the API
returns the stored value untouched next to it.
"""
import re
from datetime import date
from typing import Any, Iterable, List, Mapping, Optional, Sequence, Tuple

_STRICT = re.compile(r'(\d{4})-(\d{2})-(\d{2})')
_TIMESTAMP = re.compile(r'\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?')

# ── stable problem codes (part of the API contract of `date_issues`) ────────────────────────────
INVALID_FORMAT = 'invalid_format'
INVALID_CALENDAR = 'invalid_calendar'
TIMESTAMP = 'timestamp'
TRAILING_CHARACTERS = 'trailing_characters'
WHITESPACE = 'whitespace'
WHITESPACE_ONLY = 'whitespace_only'
MISSING_REQUIRED = 'missing_required'

_MESSAGES = {
    INVALID_FORMAT: 'must be a date written as YYYY-MM-DD',
    INVALID_CALENDAR: 'is not a real calendar date',
    TIMESTAMP: 'must be a date only (YYYY-MM-DD), not a time stamp',
    TRAILING_CHARACTERS: 'has extra characters after the date',
    WHITESPACE: 'has leading or trailing whitespace',
    WHITESPACE_ONLY: 'is blank (whitespace only)',
    MISSING_REQUIRED: 'is required',
}

# (earlier field, later field, code, message) — the NCR rule set.
# 2026-09-21: the third rule (closeoutDate <= dueDate) is GONE on purpose. An NCR can really be closed after its due date; refusing that
# forced people to close it late in the system or not at all. The due date is now kept exactly as it was (see DUE_FIXED_AT_CLOSURE), so
# "closed after the due date" is a fact that stays visible in the data instead of something the form makes impossible.
NCR_ORDER_RELATIONS: Tuple[Tuple[str, str, str, str], ...] = (
    ('raiseDate', 'closeoutDate', 'raise_after_closeout', 'Raise date must be before or equal to closeout date'),
    ('raiseDate', 'dueDate', 'raise_after_due', 'Raise date must be before or equal to due date'),
)

# A Closed NCR (or the request that closes it) may not move its due date: it is the deadline the closure is measured against, and moving it
# would erase the fact that the NCR was closed late.
DUE_FIXED_AT_CLOSURE = 'due_fixed_at_closure'

NCR_DATE_FIELDS = ('raiseDate', 'closeoutDate', 'dueDate', 'effectivenessVerifiedDate',
                   'correctiveActionTargetDate', 'preventiveActionTargetDate', 'ownerApprovalDate')
OBS_DATE_FIELDS = ('raiseDate', 'closeoutDate', 'dueDate', 'verifiedDate',
                   'qualityEngineerApprovalDate', 'constructionEngineerApprovalDate')
NOI_DATE_FIELDS = ('issueDate', 'inspectionDate', 'closeoutDate', 'dueDate')
NOI_REQUIRED_DATE_FIELDS = ('issueDate', 'inspectionDate')


def date_problem(value: Any) -> Optional[str]:
    """None when `value` is a valid strict date OR blank (None / ''); otherwise a stable problem code."""
    if value is None or value == '':
        return None
    if not isinstance(value, str):
        return INVALID_FORMAT
    m = _STRICT.fullmatch(value)
    if m:
        try:
            date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return INVALID_CALENDAR
        return None
    stripped = value.strip()
    if stripped == '':
        return WHITESPACE_ONLY
    if stripped != value and _STRICT.fullmatch(stripped):
        return WHITESPACE
    if _TIMESTAMP.fullmatch(stripped):
        return TIMESTAMP
    if re.match(r'\d{4}-\d{2}-\d{2}', stripped):
        return TRAILING_CHARACTERS
    return INVALID_FORMAT


def _usable(value: Any) -> bool:
    """A non-blank, strictly valid date (comparable)."""
    return isinstance(value, str) and value != '' and date_problem(value) is None


class DateValidationError(ValueError):
    """One or more date problems in a WRITE; routers answer 422 with `detail` (pydantic-shaped: type / loc / msg / input / code)."""

    def __init__(self, errors: List[dict]):
        self.errors = errors
        super().__init__('; '.join(f"{e['field']}: {e['msg']}" for e in errors))

    def http_detail(self) -> List[dict]:
        return [{'type': 'value_error.date', 'loc': ['body', e['field']], 'msg': e['msg'], 'input': e.get('value'), 'code': e['code']}
                for e in self.errors]


def strict_date_input(value: Any) -> Any:
    """Field validator for CREATE bodies: the value is returned untouched (never truncated) or a ValueError is raised."""
    code = date_problem(value)
    if code:
        raise ValueError(f'date {_MESSAGES[code]} (got {value!r})')
    return value


def validate_date_write(final: Mapping[str, Any], date_fields: Sequence[str], *, stored: Optional[Mapping[str, Any]] = None,
                        provided: Optional[Iterable[str]] = None, required: Sequence[str] = (),
                        relations: Sequence[Tuple[str, str, str, str]] = (), client_fields: Optional[Iterable[str]] = None) -> None:
    """Validate the FINAL content of a create (`stored=None`) or update (`stored` = the row as it is now, `provided` = the
    fields the request carried). Raises DateValidationError; writes nothing.

    * format: every date field for a create; for an update only the provided fields whose value differs from the stored one
      (an unchanged resend of a historical value is not a new write);
    * required: a `required` field may not become NULL (create: not NULL; update: only if it changes to NULL);
    * order: each relation whose two values are both usable dates and out of order is an error when it is a create, or when
      one of its two fields changed in this request — an old, untouched inconsistency never blocks an unrelated edit.

    `client_fields` (optional) are the fields the CLIENT actually sent; an order error is attached to the later field when the client
    sent it, otherwise to the earlier one if the client sent that, so the message points at what the user typed and not at a value
    the service filled in (e.g. the SLA due date)."""
    errors: List[dict] = []
    is_create = stored is None
    provided_set = set(date_fields if is_create else (provided or ()))
    changed = {f for f in date_fields if f in provided_set and (is_create or final.get(f) != stored.get(f))}
    for f in date_fields:
        if f not in changed:
            continue
        v = final.get(f)
        code = date_problem(v)
        if code:
            errors.append({'field': f, 'code': code, 'value': v, 'msg': f'date {_MESSAGES[code]}'})
        elif v is None and f in required:
            errors.append({'field': f, 'code': MISSING_REQUIRED, 'value': None, 'msg': f'date {_MESSAGES[MISSING_REQUIRED]}'})
    bad = {e['field'] for e in errors}
    blame = set(client_fields) if client_fields is not None else None
    for earlier, later, code, message in relations:
        a, b = final.get(earlier), final.get(later)
        if earlier in bad or later in bad or not (_usable(a) and _usable(b)):
            continue
        if a > b and (is_create or earlier in changed or later in changed):
            field = later
            if blame is not None and later not in blame and earlier in blame:
                field = earlier
            errors.append({'field': field, 'code': code, 'value': final.get(field), 'msg': message})
    if errors:
        raise DateValidationError(errors)


def compute_date_issues(values: Any, date_fields: Sequence[str], *, required: Sequence[str] = (),
                        relations: Sequence[Tuple[str, str, str, str]] = ()) -> List[dict]:
    """Read-only description of what is wrong with the STORED dates; never raises, never changes anything.
    Each entry: {field, value, code, related_field}. `related_field` is set for order problems (the earlier field)."""
    get = values.get if isinstance(values, Mapping) else (lambda k: getattr(values, k, None))
    issues: List[dict] = []
    bad = set()
    for f in date_fields:
        v = get(f)
        code = date_problem(v)
        if code:
            issues.append({'field': f, 'value': v if isinstance(v, str) else (None if v is None else str(v)), 'code': code, 'related_field': None})
            bad.add(f)
        elif v is None and f in required:
            issues.append({'field': f, 'value': None, 'code': MISSING_REQUIRED, 'related_field': None})
    for earlier, later, code, _message in relations:
        a, b = get(earlier), get(later)
        if earlier in bad or later in bad or not (_usable(a) and _usable(b)):
            continue
        if a > b:
            issues.append({'field': later, 'value': b, 'code': code, 'related_field': earlier})
    return issues
