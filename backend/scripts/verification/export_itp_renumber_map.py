"""Export the ITP renumbering map (migration step 27, REF-PROJECT-SEQ-2026-001 B3) to CSV — READ-ONLY.

The database is opened with SQLite's read-only URI mode, so nothing can be written to it; the CSV goes to the path
given. Columns: itp_id, old_referenceNo, new_referenceNo, migrated_at, ordered by the new number.

    python scripts/verification/export_itp_renumber_map.py <path to qualitas.db> <output.csv>

Keep the CSV where the coordination rules say (never in the repo). Exit status 1 when the map is empty, so a run on
a database where step 27 has not happened yet is noticed; 2 for a wrong call, a missing file or a missing table.

Run it against a COPY (or a `.backup`) of the database, not the file the running container uses: read-only mode still
needs the WAL side files of a live database.
"""
import csv
import sqlite3
import sys
from pathlib import Path

COLUMNS = ("itp_id", "old_referenceNo", "new_referenceNo", "migrated_at")


def export(db_path: str, out_path: str) -> int:
    if not Path(db_path).is_file():
        print(f"no such database file: {db_path}", file=sys.stderr)
        raise SystemExit(2)
    uri = f"file:{Path(db_path).resolve().as_posix()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    try:
        try:
            rows = conn.execute(
                f"SELECT {', '.join(COLUMNS)} FROM itp_renumber_map ORDER BY new_referenceNo"
            ).fetchall()
        except sqlite3.OperationalError as e:                    # e.g. no itp_renumber_map table: step 27 never ran here
            print(f"cannot read itp_renumber_map in {db_path}: {e}", file=sys.stderr)
            raise SystemExit(2)
    finally:
        conn.close()
    with open(out_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(COLUMNS)
        writer.writerows(rows)
    return len(rows)


def main(argv) -> int:
    if len(argv) != 3:
        print(__doc__)
        return 2
    n = export(argv[1], argv[2])
    print(f"{n} rows -> {argv[2]}")
    return 0 if n else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
