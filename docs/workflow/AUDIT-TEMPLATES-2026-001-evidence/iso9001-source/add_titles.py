"""Clause titles for the ISO 9001:2015 template (user 2026-10-11: the question dropdown lists clauses first, so each item
gets a `title`). Taken from the heading rows of the pasted checklist (e.g. "4.1 Understanding the organization and its
context"); a sub-clause without its own heading (5.2.1, 6.1.1, 7.5.3.1, 9.2.1, 10.2.1, …) uses the nearest parent's."""
import csv, json, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
HEAD = re.compile(r'^\s*(\d+(?:\.\d+)*)\.?\s+(\S.*?)\s*$')
titles = {}
for ch in range(4, 11):
    for r in csv.reader(open(os.path.join(HERE, f'ch{ch}.tsv'), newline='', encoding='utf-8'), delimiter='\t'):
        m = HEAD.match((r[0] if r else '').replace('\n', ' '))
        if m and not (len(r) > 2 and r[2].strip() and re.fullmatch(r'\d+(\.\d+)*', r[0].strip())):
            titles.setdefault(m.group(1), re.sub(r'\s+', ' ', m.group(2)))
def title_for(no):
    parts = no.split('.')
    while parts:
        t = titles.get('.'.join(parts))
        if t: return t
        parts.pop()
    return ''
p = os.path.join(HERE, 'iso9001_2015_template.json')
items = json.load(open(p))
for it in items:
    it['title'] = title_for(it['no'])
json.dump([{k: it[k] for k in ('id', 'no', 'title', 'clause', 'task')} for it in items], open(p, 'w'), ensure_ascii=False, indent=1)
seen = {}
for it in items: seen.setdefault(it['no'], it['title'])
for no, t in seen.items(): print(f'{no:9} {t}')
assert all(it['title'] for it in items)
