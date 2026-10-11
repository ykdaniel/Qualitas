"""Parse the user's ISO 9001:2015 checklist (ch4..ch10.tsv, pasted from Excel) into template items.
Rules (user's choices 2026-10-11): clause = requirement text; no = clause number only; Audit Evidence appended to the
question as a last line "應備證據：…". Blank lines inside a cell are dropped, runs of spaces collapsed.
The "Audit Question for LSC" column (project-specific notes) is kept apart in lsc.json, not in the template."""
import csv, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
NUM = re.compile(r'\d+(\.\d+)*')

def clean(s):
    lines = [re.sub(r'[ \t ]+', ' ', l).strip() for l in (s or '').replace('\r', '').split('\n')]
    return '\n'.join(l for l in lines if l)

items, lsc, notes = [], [], []
for ch in range(4, 11):
    rows = list(csv.reader(open(os.path.join(HERE, f'ch{ch}.tsv'), newline='', encoding='utf-8'), delimiter='\t'))
    head = [h.strip() for h in rows[0]]
    ci, qi = head.index('ISO 9001:2015 Clause'), head.index('Audit Question')
    ei = head.index('Audit Evidence')
    li = head.index('Audit Question for LSC') if 'Audit Question for LSC' in head else (qi + 1 if ei == qi + 2 else None)
    for r in rows[1:]:
        r = r + [''] * (len(head) - len(r))
        no = r[0].strip()
        if no.upper().startswith('NOTE') and items:
            items[-1]['clause'] += '\n' + clean(no)       # the NOTE under 7.2 belongs to its clause
            notes.append(f'NOTE row appended to {items[-1]["no"]}')
            continue
        if not NUM.fullmatch(no) or not clean(r[ci]):
            continue                                     # section heading / empty row
        it = {'no': no, 'q': clean(r[1]), 'clause': clean(r[ci]), 'question': clean(r[qi]), 'evidence': clean(r[ei])}
        if li is not None and clean(r[li]):
            lsc.append({'no': no, 'q': it['q'], 'text': clean(r[li])})
        items.append(it)

json.dump({'items': items, 'lsc': lsc, 'notes': notes}, open(os.path.join(HERE, 'parsed.json'), 'w'), ensure_ascii=False, indent=1)
print(len(items), 'items;', len(lsc), 'LSC notes;', notes)
for it in items:
    flags = []
    if not it['question']: flags.append('NO QUESTION')
    if len(it['clause']) > 1500: flags.append(f'clause {len(it["clause"])}')
    task_len = len(it['question']) + (len(it['evidence']) + 6 if it['evidence'] else 0)
    if task_len > 1500: flags.append(f'task {task_len}')
    if flags: print(it['no'], it['q'], flags)
print('max clause', max(len(i['clause']) for i in items), 'max task', max(len(i['question']) + len(i['evidence']) + 6 for i in items))
print('per chapter', {c: sum(1 for i in items if i['no'].split('.')[0] == str(c)) for c in range(4, 11)})
print('evidence rows', [i['no'] + ' ' + i['q'] for i in items if i['evidence']])

# ── user's decisions on the parsed result (2026-10-11) ───────────────────────────────────────────────────────
def find(no, q, nth=0):
    hits = [i for i in items if i['no'] == no and i['q'].upper() == q.upper()]
    return hits[nth]

# LSC / HaiLong notes that sit in chapter 9's Audit Evidence column (no LSC column there): moved out of the template
x = find('9.1.1', 'Q1'); lsc.append({'no': '9.1.1', 'q': 'Q1', 'text': x['evidence']}); x['evidence'] = ''
x = find('9.3.2', 'Q2'); lsc.append({'no': '9.3.2', 'q': 'Q2', 'text': 'Is there any periodic quality review in the LSC to improve the QMS?'})
assert x['evidence'].endswith('Documented information of management reviews.'); x['evidence'] = 'Documented information of management reviews.'
# the 4 obvious typos in the generic columns
for no, q, field, old, new in [('9.1.3', 'Q1', 'question', 'So me how', 'Show me how'), ('6.2.1', 'Q1', 'question', 'measureable', 'measurable'),
                               ('6.1.1', 'Q1', 'question', 'QMS can::', 'QMS can:'), ('4.2', 'Q1', 'question', 'been Determined', 'been determined')]:
    x = find(no, q); assert x[field].count(old) == 1, (no, old); x[field] = x[field].replace(old, new)
# 5.2.1 Q1 has no audit question in the source: drafted from the clause (user asked for it), marked for review
x = find('5.2.1', 'Q1'); assert not x['question']
x['question'] = ('How has top management established the quality policy, and how is it reviewed and maintained (how often, by whom, e.g. in management review)?\n'
                 'Is it appropriate to the purpose and context of the organization?\n'
                 'Does it provide a framework for setting and reviewing quality objectives?\n'
                 'Does it include a commitment to satisfy applicable requirements?\n'
                 'Does it include a commitment to continual improvement of the QMS?')
x['drafted'] = True

template = []
seq = {}
for it in items:
    seq[it['no']] = seq.get(it['no'], 0) + 1
    task = it['question'] + (f"\n應備證據：{it['evidence']}" if it['evidence'] else '')
    template.append({'id': f"iso9001-{it['no']}-{seq[it['no']]}", 'no': it['no'], 'clause': it['clause'], 'task': task})
assert len({t['id'] for t in template}) == len(template)
assert all(len(t['clause']) <= 2000 and len(t['task']) <= 2000 and t['task'] for t in template)
json.dump(template, open(os.path.join(HERE, 'iso9001_2015_template.json'), 'w'), ensure_ascii=False, indent=1)
json.dump(lsc, open(os.path.join(HERE, 'lsc_notes.json'), 'w'), ensure_ascii=False, indent=1)
print('template items', len(template), 'LSC notes kept out', len(lsc))
