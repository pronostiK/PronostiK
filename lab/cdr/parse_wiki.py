# Extrait les matchs de Coupe du Roi du texte source Wikipédia (anglais) -> lab/cdr/matches.json
import re, json, glob, os, datetime
D = os.path.dirname(os.path.abspath(__file__))
MONTHS = {m: i for i, m in enumerate(['January','February','March','April','May','June','July','August','September','October','November','December'], 1)}
def link(s):
    m = re.search(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', s)
    return (m.group(1).strip(), (m.group(2) or m.group(1)).strip()) if m else (None, re.sub(r"'''|\(.*?\)", '', s).strip())
def tier(s):
    m = re.search(r'\((\d)\)', re.sub(r'<[^>]+>', '', s)); return int(m.group(1)) if m else None
out = []
for f in sorted(glob.glob(os.path.join(D, 'wiki', 'en-*.txt'))):
    season = os.path.basename(f)[3:-4]; txt = open(f, encoding='utf8').read()
    # sections (tours) + liste des clubs qualifiés par division
    tiers = {}
    cur_tier = None
    for line in txt.split('\n'):
        h = re.match(r'^=+\s*(.*?)\s*=+$', line)
        if h:
            t = h.group(1); m = re.search(r'(Primera Federaci|Segunda Federaci|Tercera Federaci|La Liga|Segunda Divisi|Primera Divisi|Regional|Supercopa)', t, re.I)
            cur_tier = None
            if m:
                k = m.group(1).lower()
                cur_tier = {'la liga': 1, 'primera divisi': 1, 'segunda divisi': 2, 'primera federaci': 3, 'segunda federaci': 4, 'tercera federaci': 5, 'regional': 6, 'supercopa': 1}[k]
        elif cur_tier and line.startswith('*'):
            tgt, _ = link(line)
            if tgt: tiers.setdefault(tgt, cur_tier)
    pos = 0; rnd = None
    heads = [(m.start(), m.group(1).strip()) for m in re.finditer(r'^==+\s*(.*?)\s*==+\s*$', txt, re.M)]
    for m in re.finditer(r'\{\{\s*football ?box(?: collapsible)?\s*\n(.*?)\n\}\}', txt, re.I | re.S):
        body = m.group(1)
        rnd = [h for p, h in heads if p < m.start()]
        rnd = next((h for h in reversed(rnd) if re.search(r'round|final|preliminary|qualif', h, re.I)), rnd[-1] if rnd else None)
        F = {}
        for fm in re.finditer(r'^\|[ \t]*(\w+)[ \t]*=[ \t]*(.*)$', body, re.M): F[fm.group(1).lower()] = fm.group(2).strip()
        t1, n1 = link(F.get('team1', '')); t2, n2 = link(F.get('team2', ''))
        sc = re.sub(r'<[^>]+>|\{\{.*?\}\}|\[\[|\]\]', '', F.get('score', '')).strip()
        sm = re.search(r'(\d+)\s*[–-]\s*(\d+)', sc)
        dm = re.search(r'(\d{1,2}) (\w+) (\d{4})', F.get('date', ''))
        if not (t1 and t2 and sm and dm): continue
        aet = bool(F.get('aet')) or 'aet' in F.get('score', '').lower() or 'a.e.t' in F.get('score', '').lower()
        pen = re.search(r'(\d+)\s*[–-]\s*(\d+)', F.get('penaltyscore', ''))
        if pen: aet = True
        r1, r2 = tier(F.get('team1', '')), tier(F.get('team2', ''))
        if r1: tiers.setdefault(t1, r1)
        if r2: tiers.setdefault(t2, r2)
        out.append({'season': season, 'round': rnd, 'date': datetime.date(int(dm.group(3)), MONTHS[dm.group(2)], int(dm.group(1))).isoformat(),
                    'home': t1, 'away': t2, 'hn': n1, 'an': n2, 'hg': int(sm.group(1)), 'ag': int(sm.group(2)), 'aet': aet,
                    'pen': [int(pen.group(1)), int(pen.group(2))] if pen else None, 'th': r1, 'ta': r2, 'neutral': bool(re.search(r'^final$', rnd or '', re.I))})
    for x in out:
        if x['season'] == season:
            x['th'] = x['th'] or tiers.get(x['home']); x['ta'] = x['ta'] or tiers.get(x['away'])
json.dump(out, open(os.path.join(D, 'matches.json'), 'w'), ensure_ascii=False, indent=0)
from collections import Counter
for s in sorted(set(x['season'] for x in out)):
    S = [x for x in out if x['season'] == s]
    print(s, len(S), 'sans division:', sum(1 for x in S if not x['th'] or not x['ta']), 'aet:', sum(x['aet'] for x in S), Counter(x['round'] for x in S).most_common(9))
    print('   tiers', Counter((x['th'], x['ta']) for x in S).most_common(12))
