"""Build the server's data files from the raw S-Pankki challenge CSVs.

Usage:
    python3 -I tools/prepare_data.py <dir with tx_junction_transactions.csv and tx_customers_junction.csv> server/data

The transactions file (346 MB, Git LFS) is read once. Two files are written:
  personas.json    full transaction history, up to TODAY, for the six demo customers
  benchmarks.json  peer-group medians by age band, from the last 12 full months

Only transactions up to TODAY are used, so the app never sees "the future".
"""
import csv
import json
import statistics
import sys
from collections import defaultdict

RAW, OUT = sys.argv[1], sys.argv[2]
TODAY = '2026-09-09'                      # demo "now": six days before the common 15th payday
BENCH_FROM, BENCH_TO = '2025-09', '2026-08'
BENCH_MONTHS = 12

# Must match `personas` in src/content.ts.
PERSONA_IDS = ['CUST04376', 'CUST04925', 'CUST00332', 'CUST04075', 'CUST00084', 'CUST03667']

SPEND = ['Housing', 'Utilities', 'Groceries', 'Transportation', 'Health', 'Home & Tech',
         'Restaurants', 'Entertainment', 'Lifestyle', 'Travel']
BASKET = {
    'Housing': 'regular', 'Utilities': 'regular', 'Groceries': 'regular', 'Transportation': 'regular',
    'Health': 'irregular', 'Home & Tech': 'irregular',
    'Restaurants': 'everyday', 'Entertainment': 'everyday', 'Lifestyle': 'everyday', 'Travel': 'everyday',
}
BASKET_BY_MCC = {'4121': 'everyday'}      # taxis are a choice, unlike the rest of transport


def basket(category, mcc):
    return BASKET_BY_MCC.get(mcc) or BASKET.get(category)


def age_band(age):
    return '18-29' if age < 30 else '30-44' if age < 45 else '45-64' if age < 65 else '65+'


customers = {r['customer_id']: r for r in csv.DictReader(open(f'{RAW}/tx_customers_junction.csv', encoding='utf-8-sig'))}
persona_tx = defaultdict(list)
sums = defaultdict(lambda: defaultdict(float))

with open(f'{RAW}/tx_junction_transactions.csv', encoding='utf-8-sig', newline='') as f:
    reader = csv.reader(f)
    next(reader)
    for cust, _account, date, ts, category, amount, balance, _type, _merchant, mcc in reader:
        if date > TODAY:
            continue
        amount = float(amount)
        if cust in PERSONA_IDS:
            persona_tx[cust].append([date, ts[8:13], category, round(amount, 2), round(float(balance), 2), mcc])
        if BENCH_FROM <= date[:7] <= BENCH_TO:
            s = sums[cust]
            if category in SPEND:
                s[category] -= amount
                s['basket:' + basket(category, mcc)] -= amount
                s['spend'] -= amount
            elif category in ('Salary', 'Other Income'):
                s['income'] += amount
            elif category == 'Salary Sweep':
                s['sweep'] -= amount

groups = defaultdict(list)
excluded = 0
for cust, s in sums.items():
    if s.get('sweep', 0) > 0:
        # Pass-through accounts show only a slice of the customer's spending.
        excluded += 1
        continue
    groups['all'].append(s)
    groups[age_band(int(customers[cust]['customer_age']))].append(s)

METRICS = SPEND + ['basket:regular', 'basket:irregular', 'basket:everyday', 'spend', 'income']
benchmarks = {'window': [BENCH_FROM, BENCH_TO], 'excludedPassThrough': excluded, 'groups': {}}
for name, members in sorted(groups.items()):
    medians = {m: round(statistics.median(s.get(m, 0.0) / BENCH_MONTHS for s in members), 2) for m in METRICS}
    medians['everydayShare'] = round(statistics.median(
        s.get('basket:everyday', 0.0) / s['spend'] for s in members if s.get('spend', 0) > 0), 4)
    benchmarks['groups'][name] = {'n': len(members), 'monthlyMedian': medians}

personas = []
for cid in PERSONA_IDS:
    c = customers[cid]
    rows = sorted(persona_tx[cid], key=lambda r: (r[0], r[1]))
    personas.append({'id': cid, 'age': int(c['customer_age']), 'postalCode': c['customer_postal_code'], 'tx': rows})

json.dump({'today': TODAY, 'fields': ['date', 'time', 'category', 'amount', 'balance', 'mcc'], 'personas': personas},
          open(f'{OUT}/personas.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(benchmarks, open(f'{OUT}/benchmarks.json', 'w'), ensure_ascii=False, indent=1)
print('personas:', [(p['id'], len(p['tx'])) for p in personas])
print('benchmark groups:', {g: v['n'] for g, v in benchmarks['groups'].items()}, 'excluded pass-through:', excluded)
