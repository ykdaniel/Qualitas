#!/bin/zsh
# FAT-SUPPLIER-NULL-2026-001: reproduction / re-check against a FRESH isolated stack (never 8198/3198/8240/3240).
#   cd backend
#   python3 scripts/verification/isolated_stack.py up --port 8263 > $TMPDIR/fsn-stack.json
#   zsh ../docs/workflow/FAT-SUPPLIER-NULL-2026-001-evidence/repro.sh $TMPDIR/fsn-stack.json "<title line>"
#   python3 scripts/verification/isolated_stack.py down --root <root>
# Between cases the offending row is removed / repaired directly in the ISOLATED database, so each case is seen alone.
S=$1
ROOT=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['root'])" $S)
E=${0:A:h}
P=$E/probe_fat_api.py
sq() { python3 -c "import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);r=c.execute(sys.argv[2]).fetchall();c.commit();print(r if r else '')" $ROOT/stack.db "$1"; }
seed() { python3 scripts/verification/isolated_stack.py seed --root $ROOT --script scripts/verification/seed_fat_supplier_null_review.py $1; }

echo "# $2"
echo "## seed base: project FSN-P1, contractors FSN-V1 'FAT Supplier Co' / FSN-V2 'FAT Gone Co', FAT FSN-OK (V1), FSN-GONE (V2)"
seed base
python3 $P $S list
python3 $P $S search

echo; echo "## case 1: create with supplier \"\""
python3 $P $S create-empty
echo "  db: $(sq "select id, vendor_id from fat where equipment='Probe equipment'")"
python3 $P $S list
sq "delete from fat where equipment='Probe equipment'"

echo; echo "## case 2: create with supplier \"No Such Co\""
python3 $P $S create-unknown
echo "  db: $(sq "select id, vendor_id from fat where equipment='Probe equipment'")"
python3 $P $S list
sq "delete from fat where equipment='Probe equipment'"

echo; echo "## case 1b / 2b: update FSN-OK with supplier \"\" / \"No Such Co\" / null"
python3 $P $S update-empty
echo "  db: $(sq "select id, vendor_id from fat where id='FSN-OK'")"
python3 $P $S list
sq "update fat set vendor_id='FSN-V1' where id='FSN-OK'"
python3 $P $S update-unknown
echo "  db: $(sq "select id, vendor_id from fat where id='FSN-OK'")"
python3 $P $S list
sq "update fat set vendor_id='FSN-V1' where id='FSN-OK'"

echo; echo "## case 3: contractor deleted (directly in the db; the API refuses to delete a contractor a FAT cites)"
seed drop-contractor
echo "  db: $(sq "select f.id, f.vendor_id, c.id from fat f left join contractors c on c.id=f.vendor_id where f.id='FSN-GONE'")"
python3 $P $S list
python3 $P $S get FSN-GONE
sq "delete from fat where id='FSN-GONE'"

echo; echo "## related: update with null supplier / equipment / startDate / endDate (one request each)"
python3 $P $S update-null
echo "  db: $(sq "select id, vendor_id, equipment, startDate, endDate from fat where id='FSN-OK'")"
python3 $P $S list

echo; echo "## legacy rows (seed legacy): no supplier / no equipment+dates / start after end / start 2026/10/01"
seed legacy
python3 $P $S list
python3 $P $S search
