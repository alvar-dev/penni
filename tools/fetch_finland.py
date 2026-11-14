"""Fetch the Statistics Finland (Tilastokeskus) figures the coach compares against.

Usage:
    python3 -I tools/fetch_finland.py server/data/finland.json

Reads the open StatFin PxWeb API (no key) and writes one small JSON file, so the
app works offline at the demo. Monthly and quarterly series stop at AS_OF, the
demo's last full month, so the coach never quotes a figure "from the future".
"""
import json
import sys
import urllib.request

OUT = sys.argv[1]
AS_OF = '2026-08'
API = 'https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/'


def page(table):
    db, name = table.split('/')
    return f'https://pxdata.stat.fi/PxWeb/pxweb/fi/StatFin/StatFin__{db}/statfin_{db}_pxt_{name}/'


def meta(table):
    with urllib.request.urlopen(API + table, timeout=30) as r:
        return json.load(r)


def fetch(table, selection):
    """selection: {variable code: [value codes]}. Returns ({(code, ...): value}, dimension ids)."""
    body = {
        'query': [{'code': k, 'selection': {'filter': 'item', 'values': v}} for k, v in selection.items()],
        'response': {'format': 'json-stat2'},
    }
    req = urllib.request.Request(API + table, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.load(r)
    ids, sizes = d['id'], d['size']
    codes = [sorted(d['dimension'][i]['category']['index'], key=d['dimension'][i]['category']['index'].get) for i in ids]
    out = {}
    for flat, value in enumerate(d['value']):
        key, rest = [], flat
        for dim in reversed(range(len(ids))):
            key.append(codes[dim][rest % sizes[dim]])
            rest //= sizes[dim]
        out[tuple(reversed(key))] = value
    return out, ids


def latest(table, var, limit=None):
    """The newest period code of a table, optionally not after `limit` (e.g. 2026M08)."""
    for v in meta(table)['variables']:
        if v['code'] == var:
            values = [x for x in v['values'] if limit is None or x <= limit]
            return values[-1]
    raise KeyError(var)


def r1(x):
    return None if x is None else round(x, 1)


month_limit = AS_OF.replace('-', 'M')                 # 2026M08
quarter_limit = f'{AS_OF[:4]}Q{(int(AS_OF[5:]) - 1) // 3}'  # last full quarter: 2026Q2
sources = {}
data = {'asOf': AS_OF}

# 1. Household consumption by age of the reference person (Kulutustutkimus), per consumption unit.
T = 'ktutk/14q4.px'
COICOP = ['0', '01', '011', '02', '03', '04', '041', '042', '045', '05', '053', '06', '07', '072', '073', '08', '081',
          '09', '094', '096', '098', '11', '111', '112', '13', '131']
AGES = ['SSS', '17-24', '25-34', '35-44', '45-54', '55-64', '65-74', '75-84', '85-']
year = latest(T, 'timeperiod_y')
vals, _ = fetch(T, {'timeperiod_y': [year], 'coicop_46_20231201': COICOP, 'ikaryhma_10_20180101': AGES,
                    'contentscode': ['kulukk_kt_hk_2_1']})
data['consumption'] = {
    'year': int(year),
    'unit': 'euroa kuukaudessa kulutusyksikköä kohden',
    'groups': {a: {c: r1(vals[(year, c, a, 'kulukk_kt_hk_2_1')]) for c in COICOP} for a in AGES},
}
sources['consumption'] = {'name': f'Tilastokeskus, kulutustutkimus {year}', 'url': page(T)}

# 2. Consumer prices: change over the year by commodity (Kuluttajahintaindeksi).
T = 'khi/15b5.px'
PRICE = ['SSS', '01', '011', '03', '041', '045', '0451', '05', '06', '07', '0722', '073', '08', '09', '098', '11', '111', '112']
month = latest(T, 'timeperiod_m', month_limit)
vals, _ = fetch(T, {'timeperiod_m': [month], 'coicop_46_20231201': PRICE, 'contentscode': ['vm_khi']})
data['prices'] = {'month': month.replace('M', '-'), 'yearChangePct': {c: r1(vals.get((month, c, 'vm_khi'))) for c in PRICE}}
sources['prices'] = {'name': f'Tilastokeskus, kuluttajahintaindeksi {int(month[5:])}/{month[:4]}', 'url': page(T)}

# 3. Price level against the EU average (EU27 = 100).
T = 'kvhv/15cs.px'
LEVEL = ['01', '011', '02', '031', '045', '053', '071', '073', '08', '11']
year = latest(T, 'timeperiod_y')
vals, _ = fetch(T, {'timeperiod_y': [year], 'valtio_27_20180101': ['246'], 'coicop_46_20231201': LEVEL, 'contentscode': ['hintatasoindeksi']})
data['priceLevelEU'] = {'year': int(year), 'index': {c: r1(vals.get((year, '246', c, 'hintatasoindeksi'))) for c in LEVEL}}
sources['priceLevelEU'] = {'name': f'Tilastokeskus, kansainvälinen hintavertailu {year}', 'url': page(T)}

# 4. Saving and coping with an unexpected expense (Elinolotilasto), by household life stage.
T = 'eot/132d.px'
STAGES = ['SS', '1', '10', '11', '12', '2', '21', '22', '23', '3', '31', '32']
year = latest(T, 'timeperiod_y')
vals, _ = fetch(T, {'elinvaihe_5_20200201': STAGES, 'contentscode': ['saasto_pros', 'eisaasto_pros', 'ymenot_pros', 'eiymenot_pros'], 'timeperiod_y': [year]})
data['coping'] = {
    'year': int(year),
    'groups': {s: {
        'savesPct': r1(vals[(s, 'saasto_pros', year)]),
        'cannotSavePct': r1(vals[(s, 'eisaasto_pros', year)]),
        'copesPct': r1(vals[(s, 'ymenot_pros', year)]),
        'cannotCopePct': r1(vals[(s, 'eiymenot_pros', year)]),
    } for s in STAGES},
}
sources['coping'] = {'name': f'Tilastokeskus, tulo- ja elinolotilasto {year}', 'url': page(T)}

# 5. Personal deposits and investments by age (Varallisuustilasto).
T = 'vtutk/15j6.px'
DEP_AGES = ['18-', '18-24', '25-29', '30-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60-64', '65-69', '70-74', '75-79', '80-84', '85-']
year = latest(T, 'timeperiod_y')
vals, _ = fetch(T, {'vtutk_varlaji_2_20211201': ['F2', 'F5'], 'ikaryhma_10_20180101': DEP_AGES,
                    'contentscode': ['vtutk_h_omistaja_osuus', 'vtutk_h_p50'], 'timeperiod_y': [year], 'sukupuoli_9_20180101': ['SSS']})
data['deposits'] = {
    'year': int(year),
    'groups': {a: {
        'depositsMedian': vals[('F2', a, 'vtutk_h_p50', year, 'SSS')],
        'depositOwnersPct': r1(vals[('F2', a, 'vtutk_h_omistaja_osuus', year, 'SSS')]),
        'investmentsMedian': vals[('F5', a, 'vtutk_h_p50', year, 'SSS')],
        'investorsPct': r1(vals[('F5', a, 'vtutk_h_omistaja_osuus', year, 'SSS')]),
    } for a in DEP_AGES},
}
sources['deposits'] = {'name': f'Tilastokeskus, varallisuustilasto {year}', 'url': page(T)}

# 6. Debt by age (Velkaantumistilasto): share with debt and the median among debtors.
T = 'velk/158a.px'
DEBT_AGES = ['SSS', '15-24', '25-34', '35-44', '45-54', '55-64', '65-74', '75-']
year = latest(T, 'timeperiod_y')
vals, _ = fetch(T, {'ikaryhma_10_20180101': DEBT_AGES, 'sukupuoli_9_20180101': ['SSS'], 'velkatyyppi_15_20250515': ['100', '200', '400'],
                    'timeperiod_y': [year], 'contentscode': ['hvelall_pros', 'des50']})
data['debt'] = {
    'year': int(year),
    'groups': {a: {kind: {'sharePct': r1(vals[(a, 'SSS', code, year, 'hvelall_pros')]), 'median': vals[(a, 'SSS', code, year, 'des50')]}
                   for kind, code in (('housing', '100'), ('consumer', '200'), ('student', '400'))} for a in DEBT_AGES},
}
sources['debt'] = {'name': f'Tilastokeskus, velkaantumistilasto {year}', 'url': page(T)}

# 7. People in debt enforcement (Ulosottovelalliset), by age.
T = 'uloa/11q7.px'
year = latest(T, 'timeperiod_y')
vals, _ = fetch(T, {'timeperiod_y': [year], 'ikaryhma_10_20180101': DEBT_AGES[:1] + ['15-24', '25-34', '35-44', '45-54', '55-64', '65-74', '75-'],
                    'sukupuoli_9_20180101': ['SSS'], 'paaasial_toimin_3_20180101': ['SSS'], 'uloa_11_20150101': ['SSS'], 'contentscode': ['lkm_hlo']})
data['enforcement'] = {'year': int(year), 'people': {k[1]: v for k, v in vals.items()}}
sources['enforcement'] = {'name': f'Tilastokeskus, ulosottovelalliset {year}', 'url': page(T)}

# 8. Disposable money income per person by age (Tulonjakotilasto), median.
T = 'tjt/11py.px'
INC_AGES = ['18-', '18-24', '25-34', '35-49', '50-64', '65-74', '75-']
year = latest(T, 'timeperiod_y')
vals, _ = fetch(T, {'ikaryhma_22_20191201': INC_AGES, 'contentscode': ['hkturaha_med'], 'timeperiod_y': [year], 'sukupuoli_9_20180101': ['SSS']})
data['income'] = {'year': int(year), 'unit': 'euroa vuodessa', 'medians': {a: vals[(a, 'hkturaha_med', year, 'SSS')] for a in INC_AGES}}
sources['income'] = {'name': f'Tilastokeskus, tulonjakotilasto {year}', 'url': page(T)}

# 9. Average rent per square metre, privately financed homes (Asuntojen vuokrat).
T = 'asvu/15fa.px'
AREAS = {'SSS': 'Koko maa', 'pks': 'Pääkaupunkiseutu', 'msu': 'Muu Suomi', '091': 'Helsinki', '049': 'Espoo ja Kauniainen', '092': 'Vantaa'}
quarter = latest(T, 'timeperiod_q', quarter_limit)
vals, _ = fetch(T, {'alue_44_20260101': list(AREAS), 'rahoitus_2_20260101': ['1'], 'huoneluku_5_20260101': ['SSS', '1', '2'],
                    'timeperiod_q': [quarter], 'contentscode': ['asvu_keskineliovuokra', 'asvu2025_vm']})
data['rent'] = {
    'quarter': quarter,
    'areas': {name: {
        'eurPerM2': {rooms: r1(vals.get((code, '1', room, quarter, 'asvu_keskineliovuokra'))) for rooms, room in (('all', 'SSS'), ('studio', '1'), ('oneBedroom', '2'))},
        'yearChangePct': r1(vals.get((code, '1', 'SSS', quarter, 'asvu2025_vm'))),
    } for code, name in AREAS.items()},
}
sources['rent'] = {'name': f'Tilastokeskus, asuntojen vuokrat {quarter[5:]}/{quarter[:4]}', 'url': page(T)}

# 10. Fuel and household electricity prices (Energian hinnat).
T = 'ehi/12ge.px'
month = latest(T, 'timeperiod_m', month_limit)
vals, _ = fetch(T, {'timeperiod_m': [month], 'energia_22_20200205': ['A', 'B'], 'contentscode': ['hinta', 'vuosimuutos_hinta']})
data['fuel'] = {'month': month.replace('M', '-'),
                'petrol95': {'centsPerLitre': r1(vals[(month, 'A', 'hinta')]), 'yearChangePct': r1(vals[(month, 'A', 'vuosimuutos_hinta')])},
                'diesel': {'centsPerLitre': r1(vals[(month, 'B', 'hinta')]), 'yearChangePct': r1(vals[(month, 'B', 'vuosimuutos_hinta')])}}
sources['fuel'] = {'name': f'Tilastokeskus, energian hinnat {int(month[5:])}/{month[:4]}', 'url': page(T)}
T = 'ehi/13rb.px'
month = latest(T, 'timeperiod_m', month_limit)
vals, _ = fetch(T, {'timeperiod_m': [month], 'energia_48_20220905': ['SSS'], 'energia_49_20220905': ['D'], 'contentscode': ['hinta_snt_kwh', 'vuosimuutos_hinta']})
data['electricity'] = {'month': month.replace('M', '-'), 'centsPerKwh': r1(vals[(month, 'SSS', 'D', 'hinta_snt_kwh')]),
                       'yearChangePct': r1(vals[(month, 'SSS', 'D', 'vuosimuutos_hinta')]),
                       'note': 'kokonaishinta veroineen, kotitalous 5 000–15 000 kWh vuodessa'}
sources['electricity'] = {'name': f'Tilastokeskus, energian hinnat {int(month[5:])}/{month[:4]}', 'url': page(T)}

data['sources'] = sources
json.dump(data, open(OUT, 'w'), ensure_ascii=False, indent=1)
print('wrote', OUT)
for k, s in sources.items():
    print(f'  {k:14} {s["name"]}')
