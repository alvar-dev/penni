/**
 * The calculation engine. Every number the customer sees is computed here from
 * their own transactions; the language model only picks which calculation to
 * run and words the answer. Each tool returns `facts` (what the model may use
 * in its text) and `viz` (what the app draws above the text).
 */
import { readFileSync } from 'node:fs';

import type { Basket, Insight, Summary, SummaryTile, Viz } from '../src/shared/api.ts';
import { buildOtherBank, type OtherBank } from './otherbank.mts';
import { everydayShareFinland, forBuffer, forCategories, forProfile, forSaving, forSpending, forSurprises, type Comparison } from './finland.mts';

type Tx = { date: string; month: string; day: number; category: string; amount: number; balance: number; mcc: string; bank?: 'other' };
/** `tx` is the S-Pankki account; with another bank connected, `spendTx` adds that bank's card purchases. */
export type Persona = { id: string; age: number; postalCode: string; tx: Tx[]; other?: OtherBank; spendTx?: Tx[] };

const dataDir = new URL('./data/', import.meta.url);
const raw = JSON.parse(readFileSync(new URL('personas.json', dataDir), 'utf8')) as {
  today: string;
  personas: { id: string; age: number; postalCode: string; tx: [string, string, string, number, number, string][] }[];
};

export const TODAY = raw.today;
const TODAY_MONTH = TODAY.slice(0, 7);
const LAST_FULL_MONTH = addMonths(TODAY_MONTH, -1);

export const personas = new Map<string, Persona>(
  raw.personas.map((p) => [
    p.id,
    {
      id: p.id,
      age: p.age,
      postalCode: p.postalCode,
      tx: p.tx.map(([date, , category, amount, balance, mcc]) => ({
        date,
        month: date.slice(0, 7),
        day: Number(date.slice(8, 10)),
        category,
        amount,
        balance,
        mcc,
      })),
    },
  ]),
);
const FIRST_MONTH = [...personas.values()].reduce((m, p) => (p.tx[0].month < m ? p.tx[0].month : m), TODAY_MONTH);

/**
 * The customer with a second bank connected under PSD2. Its card purchases
 * count as spending everywhere; balances stay per account, so the S-Pankki
 * balance, payday and overdraft calculations are unchanged.
 */
const connected = new Map<string, Persona>();
export function withOtherBank(p: Persona): Persona {
  let c = connected.get(p.id);
  if (!c) {
    const from = `${addMonths(LAST_FULL_MONTH, -11)}-01`;
    const income =
      p.tx.filter((t) => t.date >= from && t.month <= LAST_FULL_MONTH && (t.category === 'Salary' || t.category === 'Other Income')).reduce((s, t) => s + t.amount, 0) / 12;
    const other = buildOtherBank(p.id, FIRST_MONTH, TODAY, income);
    c = { ...p, other, spendTx: [...p.tx, ...other.tx] };
    connected.set(p.id, c);
  }
  return c;
}
/** Every purchase the coach can see: S-Pankki, plus a connected bank's card. */
const spending = (p: Persona) => p.spendTx ?? p.tx;

// ---------------------------------------------------------------------------
// What can be asked about: the ten spending categories, finer groups by
// merchant type (MCC), and all spending together.

const CATEGORIES: Record<string, { label: string; category: string }> = {
  housing: { label: 'Asuminen', category: 'Housing' },
  utilities: { label: 'Asumisen laskut', category: 'Utilities' },
  groceries: { label: 'Ruokaostokset', category: 'Groceries' },
  transport: { label: 'Liikenne', category: 'Transportation' },
  health: { label: 'Terveys', category: 'Health' },
  home_tech: { label: 'Koti ja tekniikka', category: 'Home & Tech' },
  restaurants_cafes: { label: 'Ravintolat ja kahvilat', category: 'Restaurants' },
  entertainment: { label: 'Viihde', category: 'Entertainment' },
  shopping_hobbies: { label: 'Ostokset ja harrastukset', category: 'Lifestyle' },
  travel: { label: 'Matkailu', category: 'Travel' },
};
const GROUPS: Record<string, { label: string; mcc: string[] }> = {
  taxi: { label: 'Taksit', mcc: ['4121'] },
  fuel: { label: 'Polttoaine', mcc: ['5541', '5542'] },
  public_transport: { label: 'Joukkoliikenne', mcc: ['4111'] },
  parking: { label: 'Pysäköinti', mcc: ['7523'] },
  restaurant: { label: 'Ravintolat', mcc: ['5812'] },
  fast_food_cafe: { label: 'Pikaruoka ja kahvilat', mcc: ['5814'] },
  bar: { label: 'Baarit', mcc: ['5813'] },
  supermarket: { label: 'Ruokakaupat', mcc: ['5411'] },
  kiosk: { label: 'Kioskit ja lähikaupat', mcc: ['5499'] },
  pharmacy: { label: 'Apteekit', mcc: ['5912'] },
  doctor: { label: 'Lääkärikäynnit', mcc: ['8011', '8099'] },
  dentist: { label: 'Hammaslääkäri', mcc: ['8021'] },
  cinema: { label: 'Elokuvat', mcc: ['7832'] },
  events: { label: 'Tapahtumat ja teatteri', mcc: ['7922'] },
  leisure: { label: 'Vapaa-ajan palvelut', mcc: ['7999', '7991', '7996'] },
  electronics: { label: 'Elektroniikka', mcc: ['5732', '5734'] },
  furniture: { label: 'Huonekalut', mcc: ['5712'] },
  hardware_home: { label: 'Rauta- ja kodintarvikkeet', mcc: ['5200', '5251'] },
  clothing: { label: 'Vaatteet', mcc: ['5651', '5691'] },
  sporting_goods: { label: 'Urheiluvälineet', mcc: ['5941'] },
  books: { label: 'Kirjat', mcc: ['5942'] },
  toys_hobby: { label: 'Lelut ja harrastustarvikkeet', mcc: ['5945'] },
  flights: { label: 'Lennot', mcc: ['4511'] },
  hotels: { label: 'Hotellit', mcc: ['7011'] },
  travel_agency: { label: 'Matkatoimistot', mcc: ['4722'] },
  car_rental: { label: 'Autonvuokraus', mcc: ['7512'] },
};
export const WHAT_KEYS = ['all_spending', ...Object.keys(CATEGORIES), ...Object.keys(GROUPS)];

const SPEND_CATEGORIES = new Set(Object.values(CATEGORIES).map((c) => c.category));
const BASKET_OF: Record<string, Basket> = {
  Housing: 'regular',
  Utilities: 'regular',
  Groceries: 'regular',
  Transportation: 'regular',
  Health: 'irregular',
  'Home & Tech': 'irregular',
  Restaurants: 'everyday',
  Entertainment: 'everyday',
  Lifestyle: 'everyday',
  Travel: 'everyday',
};
const LABEL_OF_CATEGORY = Object.fromEntries(Object.values(CATEGORIES).map((c) => [c.category, c.label]));

/** Taxis are a choice, unlike the rest of transport. */
function basketOf(t: Tx): Basket | undefined {
  if (t.mcc === '4121') return 'everyday';
  return BASKET_OF[t.category];
}

function matcher(what: string): { label: string; test: (t: Tx) => boolean } | null {
  if (what === 'all_spending') return { label: 'Kaikki menot', test: (t) => SPEND_CATEGORIES.has(t.category) };
  const category = CATEGORIES[what];
  if (category) return { label: category.label, test: (t) => t.category === category.category };
  const group = GROUPS[what];
  if (group) return { label: group.label, test: (t) => group.mcc.includes(t.mcc) };
  return null;
}

// ---------------------------------------------------------------------------
// Dates

function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

const MONTH_NAMES = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu', 'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu'];
const MONTH_SHORT = ['tammi', 'helmi', 'maalis', 'huhti', 'touko', 'kesä', 'heinä', 'elo', 'syys', 'loka', 'marras', 'joulu'];
const monthIndex = (month: string) => Number(month.slice(5, 7)) - 1;
const WEEKDAYS = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
const dayLabel = (date: string) => `${Number(date.slice(8, 10))}.${Number(date.slice(5, 7))}.`;
const dayTitle = (date: string) => `${WEEKDAYS[new Date(date + 'T00:00:00Z').getUTCDay()]} ${dayLabel(date)}`;

function periodLabel(from: string, to: string): string {
  const year = (m: string) => m.slice(0, 4);
  const suffix = (m: string) => (m === TODAY_MONTH ? ' (tähän asti)' : '');
  if (from === to) return `${MONTH_NAMES[monthIndex(from)]} ${year(from)}${suffix(to)}`;
  if (year(from) === year(to)) {
    return `${MONTH_SHORT[monthIndex(from)]}–${MONTH_NAMES[monthIndex(to)]} ${year(to)}${suffix(to)}`;
  }
  return `${monthIndex(from) + 1}/${year(from)}–${monthIndex(to) + 1}/${year(to)}${suffix(to)}`;
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

function addDays(date: string, n: number): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}

/** Normalises a requested period to valid months inside the data. */
function resolvePeriod(from?: string, to?: string): { from: string; to: string } | { error: string } {
  const valid = (m?: string) => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
  let a = valid(from) ? from! : LAST_FULL_MONTH;
  let b = valid(to) ? to! : a;
  if (a > b) [a, b] = [b, a];
  if (b < FIRST_MONTH || a > TODAY_MONTH) {
    return { error: `No data for that period. Data covers ${FIRST_MONTH} to ${TODAY} (today).` };
  }
  if (a < FIRST_MONTH) a = FIRST_MONTH;
  if (b > TODAY_MONTH) b = TODAY_MONTH;
  return { from: a, to: b };
}

// ---------------------------------------------------------------------------
// Small helpers

const round = (v: number) => Math.round(v);
const round2 = (v: number) => Math.round(v * 100) / 100;
const spendOf = (t: Tx) => -t.amount;

function sumBy(tx: Tx[], test: (t: Tx) => boolean): number {
  let s = 0;
  for (const t of tx) if (test(t)) s += spendOf(t);
  return s;
}

function isPassThrough(p: Persona): boolean {
  const recent = p.tx.filter((t) => t.month >= addMonths(TODAY_MONTH, -6));
  return recent.some((t) => t.category === 'Salary Sweep');
}

function mode(values: number[]): number | null {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) if (c > bestCount) [best, bestCount] = [v, c];
  return best;
}

const BASKET_NAMES: Record<Basket, string> = {
  regular: 'Pakolliset, säännölliset',
  irregular: 'Pakolliset, yllättävät',
  everyday: 'Sormien läpi',
};

export type ToolResult = { facts: Record<string, unknown>; viz?: Viz };

// ---------------------------------------------------------------------------
// Tools

function spendingTotal(p: Persona, args: { what?: string; from_month?: string; to_month?: string; chart?: string }): ToolResult {
  const m = matcher(args.what ?? 'all_spending');
  if (!m) return { facts: { error: `Unknown "what". Use one of: ${WHAT_KEYS.join(', ')}` } };
  const period = resolvePeriod(args.from_month, args.to_month);
  if ('error' in period) return { facts: period };

  const inPeriod = monthsBetween(period.from, period.to);
  const total = sumBy(spending(p), (t) => inPeriod.includes(t.month) && m.test(t));
  const count = spending(p).filter((t) => inPeriod.includes(t.month) && m.test(t) && t.amount < 0).length;

  // Context for the chart: up to 12 months ending at the period, at least 6.
  const shown = monthsBetween(
    inPeriod.length >= 6 ? addMonths(period.to, -Math.min(11, inPeriod.length - 1)) : addMonths(period.to, -5),
    period.to,
  ).filter((month) => month >= FIRST_MONTH);
  const monthly = shown.map((month) => ({ month, total: round2(sumBy(spending(p), (t) => t.month === month && m.test(t))) }));
  const before = monthly.filter((x) => x.month < period.from && x.month !== TODAY_MONTH);
  const previousAvg = before.length ? before.reduce((s, x) => s + x.total, 0) / before.length : null;

  const label = periodLabel(period.from, period.to);
  return {
    facts: {
      what: m.label,
      period: label,
      total_eur: round2(total),
      purchases: count,
      // The same average as the chart headline: full months only, not the month still under way.
      monthly_average_in_period_eur: inPeriod.length > 1 ? round2(averageOfFullMonths(monthly, inPeriod, total)) : undefined,
      average_of_previous_months_eur: previousAvg === null ? undefined : round2(previousAvg),
      monthly_eur: Object.fromEntries(monthly.map((x) => [x.month, x.total])),
      of_which_other_bank_card_eur: p.other ? round2(sumBy(p.other.tx, (t) => inPeriod.includes(t.month) && m.test(t))) : undefined,
      pass_through: isPassThrough(p) || undefined,
    },
    viz:
      args.chart === 'columns'
        ? {
            kind: 'columns',
            label: inPeriod.length > 1 ? `${m.label}, ${label} · kuukaudessa` : `${m.label}, ${label}`,
            value: inPeriod.length > 1 ? round2(averageOfFullMonths(monthly, inPeriod, total)) : round2(total),
            average: previousAvg === null ? undefined : round2(previousAvg),
            bars: monthly.map((x) => ({
              label: MONTH_SHORT[monthIndex(x.month)],
              title: `${MONTH_NAMES[monthIndex(x.month)]} ${x.month.slice(0, 4)}${x.month === TODAY_MONTH ? ' (tähän asti)' : ''}`,
              value: x.total,
              selected: inPeriod.includes(x.month),
            })),
          }
        : {
            kind: 'trend',
            // Over several months the headline is the usual month, not the sum.
            label: inPeriod.length > 1 ? `${m.label}, ${label} · kuukaudessa` : `${m.label}, ${label}`,
            value: inPeriod.length > 1 ? round2(averageOfFullMonths(monthly, inPeriod, total)) : round2(total),
            average: previousAvg === null ? undefined : round2(previousAvg),
            points: monthly.map((x) => ({
              label: MONTH_SHORT[monthIndex(x.month)],
              title: `${MONTH_NAMES[monthIndex(x.month)]} ${x.month.slice(0, 4)}${x.month === TODAY_MONTH ? ' (tähän asti)' : ''}`,
              value: x.total,
              selected: inPeriod.includes(x.month),
            })),
          },
  };
}

/** Average of the full months in the period (the current, unfinished month left out). */
function averageOfFullMonths(monthly: { month: string; total: number }[], inPeriod: string[], total: number): number {
  const full = monthly.filter((x) => inPeriod.includes(x.month) && x.month !== TODAY_MONTH);
  return full.length ? full.reduce((s, x) => s + x.total, 0) / full.length : total / inPeriod.length;
}

function safeToSpend(p: Persona): ToolResult {
  const tx = p.tx;
  const balance = tx[tx.length - 1].balance;

  const salaryDays = tx.filter((t) => t.category === 'Salary' && t.month >= addMonths(TODAY_MONTH, -6)).map((t) => t.day);
  const payDay = mode(salaryDays) ?? 15;
  let payday = `${TODAY_MONTH}-${String(Math.min(payDay, 28)).padStart(2, '0')}`;
  if (payday <= TODAY) payday = `${addMonths(TODAY_MONTH, 1)}-${String(Math.min(payDay, 28)).padStart(2, '0')}`;
  const days = Math.max(1, dayDiff(TODAY, payday));

  // Rent or maintenance charge still to come before payday.
  const housing = tx.filter((t) => t.category === 'Housing');
  const housingDay = mode(housing.filter((t) => t.month >= addMonths(TODAY_MONTH, -6)).map((t) => t.day));
  const lastHousing = housing.length ? spendOf(housing[housing.length - 1]) : 0;
  let housingDue = 0;
  if (housingDay !== null && lastHousing > 0) {
    for (let d = addDays(TODAY, 1); d < payday; d = addDays(d, 1)) {
      const paidThisMonth = housing.some((t) => t.month === d.slice(0, 7));
      if (Number(d.slice(8, 10)) === housingDay && !paidThisMonth) housingDue = lastHousing;
    }
  }

  // Everyday necessities at the pace of the last 90 days, a cushion for the
  // irregular basket at the pace of the last 180 days.
  const since = (n: number) => addDays(TODAY, -n);
  const needsPerDay =
    sumBy(tx, (t) => t.date > since(90) && t.mcc !== '4121' && ['Utilities', 'Groceries', 'Transportation'].includes(t.category)) / 90;
  const cushionPerDay = sumBy(tx, (t) => t.date > since(180) && basketOf(t) === 'irregular') / 180;

  const needs = round(needsPerDay * days);
  const cushion = round(cushionPerDay * days);
  const upcoming = round(housingDue) + needs;
  const free = round(balance - upcoming - cushion);

  // For the chart: end-of-day balance for the last three weeks, then the path
  // to payday if only the necessities and the cushion are spent.
  const points: { label: string; title: string; balance: number; projected: boolean }[] = [];
  let i = 0;
  let last = tx[0].balance;
  for (let d = addDays(TODAY, -20); d <= TODAY; d = addDays(d, 1)) {
    while (i < tx.length && tx[i].date <= d) last = tx[i++].balance;
    points.push({ label: dayLabel(d), title: dayTitle(d), balance: round2(last), projected: false });
  }
  let expected = balance;
  for (let d = addDays(TODAY, 1); d <= payday; d = addDays(d, 1)) {
    expected -= needsPerDay + cushionPerDay;
    if (housingDue && Number(d.slice(8, 10)) === housingDay) expected -= housingDue;
    points.push({ label: dayLabel(d), title: dayTitle(d), balance: round2(expected), projected: true });
  }

  return {
    facts: {
      today: TODAY,
      balance_now_eur: round2(balance),
      next_payday: payday,
      days_until_payday: days,
      rent_or_maintenance_still_due_eur: housingDue ? round(housingDue) : 0,
      groceries_bills_transport_until_payday_eur: needs,
      cushion_for_surprises_eur: cushion,
      free_to_spend_until_payday_eur: free,
      free_per_day_eur: round(free / days),
      other_bank: otherBankFacts(p),
      pass_through: isPassThrough(p) || undefined,
    },
    viz: {
      kind: 'runway',
      label: 'Vapaata rahaa palkkapäivään',
      value: free,
      perDay: round(free / days),
      days,
      paydayLabel: `palkka ${dayLabel(payday)}`,
      points,
      parts: [
        { basket: 'regular', name: 'Pakolliset tulossa', value: upcoming },
        { basket: 'irregular', name: 'Vara yllätyksiin', value: cushion },
        { basket: 'everyday', name: 'Vapaasti käytettävissä', value: Math.max(0, free) },
      ],
    },
  };
}

function spendingProfile(p: Persona): ToolResult {
  const months = monthsBetween(addMonths(LAST_FULL_MONTH, -2), LAST_FULL_MONTH);
  const inWindow = (t: Tx) => months.includes(t.month);
  const perMonth = (v: number) => v / months.length;

  const baskets: Record<Basket, number> = { regular: 0, irregular: 0, everyday: 0 };
  const byCategory = new Map<string, number>();
  for (const t of spending(p)) {
    if (!inWindow(t) || !SPEND_CATEGORIES.has(t.category)) continue;
    const b = basketOf(t);
    if (b) baskets[b] += spendOf(t);
    if (b === 'everyday') {
      const key = t.mcc === '4121' ? 'Taksit' : LABEL_OF_CATEGORY[t.category];
      byCategory.set(key, (byCategory.get(key) ?? 0) + spendOf(t));
    }
  }
  const spend = baskets.regular + baskets.irregular + baskets.everyday;
  const income = p.tx.filter((t) => inWindow(t) && (t.category === 'Salary' || t.category === 'Other Income')).reduce((s, t) => s + t.amount, 0);
  const year = monthsBetween(addMonths(LAST_FULL_MONTH, -11), LAST_FULL_MONTH);
  const negativeMonths = year.filter((month) => p.tx.some((t) => t.month === month && t.balance < 0)).length;

  // Compared with Finland: the same basket's share in Statistics Finland's household budget survey.
  const finland = everydayShareFinland(p.age);
  const label = periodLabel(months[0], months[months.length - 1]);

  return {
    facts: {
      period: label,
      monthly_average_spending_eur: round(perMonth(spend)),
      monthly_by_basket_eur: {
        mandatory_regular: round(perMonth(baskets.regular)),
        mandatory_irregular: round(perMonth(baskets.irregular)),
        everyday_slips_through: round(perMonth(baskets.everyday)),
      },
      everyday_share_of_spending_pct: spend ? round((baskets.everyday / spend) * 100) : 0,
      biggest_everyday_items_monthly_eur: Object.fromEntries(
        [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => [k, round(perMonth(v))]),
      ),
      monthly_income_eur: round(perMonth(income)),
      months_with_negative_balance_last_12: negativeMonths,
      finland_everyday_share_pct: round(finland.share * 100),
      pass_through: isPassThrough(p) || undefined,
    },
    viz: {
      kind: 'baskets',
      label: `Menot keskimäärin kuukaudessa, ${label}`,
      value: round(perMonth(spend)),
      parts: (['regular', 'irregular', 'everyday'] as Basket[]).map((b) => ({
        basket: b,
        name: BASKET_NAMES[b],
        value: round(perMonth(baskets[b])),
      })),
      share: spend ? baskets.everyday / spend : 0,
      peerShare: finland.share,
      peerLabel: finland.label,
      peerNote: finland.source.replace('Tilastokeskus, kulutustutkimus', 'Tilastokeskus'),
    },
  };
}

function whatIf(p: Persona, args: { what?: string; change_pct?: number }): ToolResult {
  const m = matcher(args.what ?? '');
  if (!m) return { facts: { error: `Unknown "what". Use one of: ${WHAT_KEYS.join(', ')}` } };
  const pct = Math.max(-100, Math.min(100, Number(args.change_pct ?? -20)));
  const months = monthsBetween(addMonths(LAST_FULL_MONTH, -5), LAST_FULL_MONTH);
  const baseline = sumBy(spending(p), (t) => months.includes(t.month) && m.test(t)) / months.length;
  const changed = baseline * (1 + pct / 100);
  const monthlyDelta = baseline - changed;

  return {
    facts: {
      what: m.label,
      change_pct: pct,
      based_on: periodLabel(months[0], months[months.length - 1]),
      monthly_now_eur: round(baseline),
      monthly_after_change_eur: round(changed),
      saving_per_month_eur: round(monthlyDelta),
      saving_per_year_eur: round(monthlyDelta * 12),
    },
    viz: {
      kind: 'projection',
      label: monthlyDelta >= 0 ? `Säästö vuodessa, ${m.label.toLowerCase()}` : `Lisäkulu vuodessa, ${m.label.toLowerCase()}`,
      value: round(Math.abs(monthlyDelta * 12)),
      nowMonthly: round(baseline),
      afterMonthly: round(changed),
      changeLabel: `${pct > 0 ? '+' : '−'}${Math.abs(pct)}\u00A0%`,
    },
  };
}

function topCategories(p: Persona, args: { from_month?: string; to_month?: string; chart?: string }): ToolResult {
  const period = resolvePeriod(args.from_month, args.to_month);
  if ('error' in period) return { facts: period };
  const inPeriod = monthsBetween(period.from, period.to);
  const totals = new Map<string, number>();
  const basketOfLabel = new Map<string, Basket>();
  for (const t of spending(p)) {
    if (!inPeriod.includes(t.month) || !SPEND_CATEGORIES.has(t.category)) continue;
    const key = LABEL_OF_CATEGORY[t.category];
    totals.set(key, (totals.get(key) ?? 0) + spendOf(t));
    basketOfLabel.set(key, BASKET_OF[t.category]);
  }
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]).filter(([, v]) => v > 0);
  const total = rows.reduce((s, [, v]) => s + v, 0);
  const label = periodLabel(period.from, period.to);
  return {
    facts: {
      period: label,
      total_spending_eur: round(total),
      by_category_eur: Object.fromEntries(rows.map(([k, v]) => [k, round(v)])),
      pass_through: isPassThrough(p) || undefined,
    },
    viz:
      args.chart === 'donut'
        ? {
            kind: 'donut',
            label: `Mihin rahat menivät, ${label}`,
            value: round(total),
            // The five largest, the rest together.
            slices: [
              ...rows.slice(0, 5).map(([k, v]) => ({ label: k, value: round(v) })),
              ...(rows.length > 5 ? [{ label: 'Muut', value: round(rows.slice(5).reduce((s, [, v]) => s + v, 0)) }] : []),
            ],
          }
        : {
            kind: 'ranking',
            label: `Mihin rahat menivät, ${label}`,
            value: round(total),
            rows: rows.slice(0, 8).map(([k, v]) => ({ label: k, value: round(v), basket: basketOfLabel.get(k) ?? 'everyday' })),
          },
  };
}

// ---------------------------------------------------------------------------
// Surprise fund: the mandatory but irregular basket made predictable.

/** A single irregular cost this big is a surprise the normal budget cannot absorb. */
const SURPRISE_MIN_EUR = 400;

function nextPayday(p: Persona): string {
  const days = p.tx.filter((t) => t.category === 'Salary' && t.month >= addMonths(TODAY_MONTH, -6)).map((t) => t.day);
  const day = String(Math.min(mode(days) ?? 15, 28)).padStart(2, '0');
  const thisMonth = `${TODAY_MONTH}-${day}`;
  return thisMonth > TODAY ? thisMonth : `${addMonths(TODAY_MONTH, 1)}-${day}`;
}

type FundReplay = {
  monthly: number;
  surprises: { date: string; label: string; amount: number }[];
  days: { date: string; actual: number; withFund: number }[];
  worst: { date: string; label: string; amount: number; actualDays: number; fundDays: number } | null;
  overdrawn: { actual: number; withFund: number };
  fundNow: number;
};

/**
 * Replays the last twelve months as if the customer had moved a fixed amount
 * to a surprise fund on every payday, paid for it by spending the same amount
 * less on everyday extras over the month, and paid big irregular costs from
 * the fund instead of the account.
 */
function replayFund(p: Persona): FundReplay {
  const from = `${addMonths(LAST_FULL_MONTH, -11)}-01`;
  const surprises = p.tx
    .filter((t) => t.date >= from && basketOf(t) === 'irregular' && spendOf(t) >= SURPRISE_MIN_EUR)
    .map((t) => ({ date: t.date, label: LABEL_OF_CATEGORY[t.category], amount: round2(spendOf(t)) }));
  const total = surprises.filter((x) => x.date.slice(0, 7) <= LAST_FULL_MONTH).reduce((s, x) => s + x.amount, 0);
  const monthly = Math.max(10, Math.round(total / 12 / 5) * 5);

  const days: FundReplay['days'] = [];
  let i = 0;
  let actual = p.tx[0].balance;
  while (i < p.tx.length && p.tx[i].date < from) actual = p.tx[i++].balance;
  let fund = 0;
  let moved = 0;
  let used = 0;
  let day = 0;
  for (let d = from; d <= TODAY; d = addDays(d, 1)) {
    day += 1;
    // What spending less on everyday extras has left in the account so far.
    const trimmed = (monthly * day) / 30.44;
    while (i < p.tx.length && p.tx[i].date === d) {
      const t = p.tx[i++];
      actual = t.balance;
      if (t.category === 'Salary') {
        fund += monthly;
        moved += monthly;
      }
      if (basketOf(t) === 'irregular' && spendOf(t) >= SURPRISE_MIN_EUR) {
        const take = Math.min(fund, spendOf(t));
        fund -= take;
        used += take;
      }
    }
    days.push({ date: d, actual: round2(actual), withFund: round2(actual - moved + used + trimmed) });
  }

  const overdrawnAfter = (date: string, key: 'actual' | 'withFund') =>
    days.filter((x) => x.date >= date && x.date < addDays(date, 30) && x[key] < 0).length;
  let worst: FundReplay['worst'] = null;
  for (const x of surprises) {
    const actualDays = overdrawnAfter(x.date, 'actual');
    const score = actualDays * 1000 + x.amount;
    if (!worst || score > worst.actualDays * 1000 + worst.amount) {
      worst = { ...x, actualDays, fundDays: overdrawnAfter(x.date, 'withFund') };
    }
  }
  return {
    monthly,
    surprises,
    days,
    worst,
    overdrawn: { actual: days.filter((x) => x.actual < 0).length, withFund: days.filter((x) => x.withFund < 0).length },
    fundNow: round(fund),
  };
}

function surpriseFund(p: Persona): ToolResult {
  const r = replayFund(p);
  const payday = nextPayday(p);
  const facts = {
    explanation: 'Mandatory but irregular costs (health, broken appliances) feel random one by one, but over a year they add up to a predictable amount.',
    period: `${dayLabel(r.days[0].date)} ${r.days[0].date.slice(0, 4)} – ${dayLabel(TODAY)} ${TODAY.slice(0, 4)}`,
    big_surprises_over_400_eur: r.surprises.map((x) => `${dayLabel(x.date)}: ${x.label} €${round(x.amount)}`),
    suggested_set_aside_each_payday_eur: r.monthly,
    how_the_plan_works: 'Move this amount to a separate surprise fund on every payday, spend the same amount less on everyday extras, and pay big surprises from the fund.',
    everyday_extras_monthly_average_eur: round(everydayMonthly(p)),
    worst_surprise: r.worst
      ? {
          date: dayLabel(r.worst.date),
          what: r.worst.label,
          amount_eur: round(r.worst.amount),
          overdrawn_days_in_30_days_after_as_it_went: r.worst.actualDays,
          overdrawn_days_in_30_days_after_with_fund: r.worst.fundDays,
        }
      : null,
    overdrawn_days_whole_period: { as_it_went: r.overdrawn.actual, with_fund: r.overdrawn.withFund },
    fund_balance_today_if_started_a_year_ago_eur: r.fundNow,
    next_payday: dayLabel(payday),
    other_bank: otherBankFacts(p),
    pass_through: isPassThrough(p) || undefined,
  };
  if (!r.worst) return { facts };

  // Chart: from three weeks before the worst surprise to six weeks after it.
  const at = r.days.findIndex((x) => x.date === r.worst!.date);
  const window = r.days.slice(Math.max(0, at - 21), Math.min(r.days.length, at + 43));
  return {
    facts,
    viz: {
      kind: 'replay',
      label: 'Sivuun joka palkkapäivä yllätyksiä varten',
      value: r.monthly,
      points: window.map((x) => ({ label: dayLabel(x.date), title: dayTitle(x.date), actual: x.actual, withFund: x.withFund })),
      event: { index: window.findIndex((x) => x.date === r.worst!.date), label: `${r.worst.label.toLowerCase()} ${formatThousands(round(r.worst.amount))}\u00A0€` },
      overdrawnDays: { actual: r.worst.actualDays, withFund: r.worst.fundDays },
      paydayLabel: dayLabel(payday),
    },
  };
}

/** A connected bank's savings and card debt, for tools whose advice changes with them. */
function otherBankFacts(p: Persona) {
  if (!p.other) return undefined;
  const savings = p.other.accounts.find((a) => a.kind === 'savings');
  const card = p.other.accounts.find((a) => a.kind === 'credit');
  return {
    bank: p.other.name,
    savings_eur: savings?.balance ?? 0,
    credit_card_debt_eur: card ? -card.balance : 0,
    credit_card_interest_pct: card?.ratePct,
  };
}

function allAccounts(p: Persona): ToolResult {
  const balance = round2(p.tx[p.tx.length - 1].balance);
  const own = { bank: 'S-Pankki', name: 'Käyttötili', balance_eur: balance };
  if (!p.other) {
    return {
      facts: {
        connected_banks: ['S-Pankki'],
        accounts: [own],
        not_connected:
          'Only S-Pankki accounts are visible. Under the account list there is a button to connect another bank (PSD2, read-only access). Suggest it in one short sentence, for example "Jos sinulla on tilejä muissa pankeissa, yhdistä ne alta, niin näen koko tilanteen." Do not call it a card (that could mean a credit card) and do not guess what they have elsewhere.',
      },
      viz: { kind: 'accounts', label: 'Tilisi S-Pankissa', value: round(balance), banks: [{ name: 'S-Pankki', accounts: [{ name: own.name, balance }] }], connectable: true },
    };
  }
  const o = p.other;
  const savings = o.accounts.find((a) => a.kind === 'savings');
  const card = o.accounts.find((a) => a.kind === 'credit');
  const saved = savings?.balance ?? 0;
  const debt = card ? -card.balance : 0;
  const cardCost = card ? (debt * card.ratePct) / 100 : 0;
  const savingsEarn = savings ? (saved * savings.ratePct) / 100 : 0;
  // Paying the card from savings: the card costs far more than savings earn.
  const pay = Math.min(debt, saved);
  const interestSaved = card && savings ? (pay * (card.ratePct - savings.ratePct)) / 100 : 0;
  const months = monthsBetween(addMonths(LAST_FULL_MONTH, -2), LAST_FULL_MONTH);
  const cardMonthly = sumBy(o.tx, (t) => months.includes(t.month)) / months.length;
  const pctText = (v: number) => `${String(v).replace('.', ',')}\u00A0%`;

  return {
    facts: {
      connected_banks: ['S-Pankki', `${o.name} (PSD2)`],
      accounts: [own, ...o.accounts.map((a) => ({ bank: o.name, name: a.name, balance_eur: a.balance, interest_pct: a.ratePct, limit_eur: a.limit }))],
      cash_and_savings_eur: round(balance + saved),
      credit_card_debt_eur: debt,
      credit_card_interest_cost_per_year_eur: round(cardCost),
      savings_interest_per_year_eur: round(savingsEarn),
      net_eur: round(balance + saved - debt),
      other_bank_card_purchases_monthly_eur: round(cardMonthly),
      suggestion:
        pay > 0
          ? {
              pay_card_from_savings_eur: round(pay),
              savings_left_eur: round(saved - pay),
              interest_saved_per_year_eur: round(interestSaved),
              why: `The card costs ${card?.ratePct} % a year while savings earn ${savings?.ratePct} %, so paying the card first is the cheapest move; the rest stays as a buffer, and the surprise fund rebuilds it.`,
            }
          : undefined,
    },
    viz: {
      kind: 'accounts',
      label: 'Kaikki tilisi yhteensä',
      value: round(balance + saved - debt),
      banks: [
        { name: 'S-Pankki', accounts: [{ name: own.name, balance }] },
        {
          name: o.name,
          example: true,
          accounts: o.accounts.map((a) => ({
            name: a.name,
            balance: a.balance,
            note: a.kind === 'credit' ? `korko ${pctText(a.ratePct)} · raja ${formatThousands(a.limit ?? 0)}\u00A0€` : `korko ${pctText(a.ratePct)}`,
          })),
        },
      ],
      connectable: false,
      footnote: card ? `Kortin korot noin ${formatThousands(round(cardCost))}\u00A0€ vuodessa` : undefined,
    },
  };
}

/** Average monthly everyday-basket spending over the last three full months. */
function everydayMonthly(p: Persona): number {
  const months = monthsBetween(addMonths(LAST_FULL_MONTH, -2), LAST_FULL_MONTH);
  return sumBy(spending(p), (t) => months.includes(t.month) && basketOf(t) === 'everyday') / months.length;
}

const formatThousands = (v: number) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');

// ---------------------------------------------------------------------------
// The start screen: a few facts at a glance, and questions that follow from them.

/** Finnish forms for building questions: "käytin X-iin", "vähentäisin X-ä". */
const FORMS: Record<string, { illative: string; partitive: string }> = {
  Asuminen: { illative: 'asumiseen', partitive: 'asumista' },
  'Asumisen laskut': { illative: 'asumisen laskuihin', partitive: 'asumisen laskuja' },
  Ruokaostokset: { illative: 'ruokaostoksiin', partitive: 'ruokaostoksia' },
  Liikenne: { illative: 'liikenteeseen', partitive: 'liikennettä' },
  Terveys: { illative: 'terveyteen', partitive: 'terveysmenoja' },
  'Koti ja tekniikka': { illative: 'kotiin ja tekniikkaan', partitive: 'koti- ja tekniikkaostoksia' },
  'Ravintolat ja kahvilat': { illative: 'ravintoloihin ja kahviloihin', partitive: 'ravintoloita ja kahviloita' },
  Viihde: { illative: 'viihteeseen', partitive: 'viihdettä' },
  'Ostokset ja harrastukset': { illative: 'ostoksiin ja harrastuksiin', partitive: 'ostoksia ja harrastuksia' },
  Matkailu: { illative: 'matkailuun', partitive: 'matkailua' },
  Taksit: { illative: 'takseihin', partitive: 'takseja' },
};

export function summary(p: Persona): Summary {
  const month = LAST_FULL_MONTH;
  const inMonth = `${MONTH_NAMES[monthIndex(month)]}ssa`; // elokuussa
  const ofMonth = `${MONTH_NAMES[monthIndex(month)]}n`; // elokuun

  const spend = (m: string, test: (t: Tx) => boolean = () => true) =>
    sumBy(spending(p), (t) => t.month === m && SPEND_CATEGORIES.has(t.category) && test(t));

  const safe = safeToSpend(p).facts as { free_to_spend_until_payday_eur: number; free_per_day_eur: number; days_until_payday: number };
  const profile = spendingProfile(p).facts as { everyday_share_of_spending_pct: number; finland_everyday_share_pct: number };

  const last6 = monthsBetween(addMonths(month, -5), month);
  const totals = last6.map((m) => round(spend(m)));
  const total = totals[totals.length - 1];
  // Against the usual month (median of the five before), so one odd month does not swing it.
  const usual = [...totals.slice(0, -1)].sort((a, b) => a - b)[2] || 0;
  const change = usual ? Math.round(((total - usual) / usual) * 100) : 0;

  // The biggest everyday item last month (taxis count separately from transport).
  const everydayKey = (t: Tx) => (t.mcc === '4121' ? 'Taksit' : LABEL_OF_CATEGORY[t.category]);
  const everyday = new Map<string, number>();
  for (const t of spending(p)) {
    if (t.month !== month || basketOf(t) !== 'everyday' || !SPEND_CATEGORIES.has(t.category)) continue;
    everyday.set(everydayKey(t), (everyday.get(everydayKey(t)) ?? 0) + spendOf(t));
  }
  const [topLabel, topValue] = [...everyday.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['Ravintolat ja kahvilat', 0];

  // The category that grew most against the three months before.
  let grew = { label: 'Ruokaostokset', delta: -Infinity };
  for (const c of Object.values(CATEGORIES)) {
    if (c.category === 'Housing') continue;
    const now = spend(month, (t) => t.category === c.category);
    const before = [1, 2, 3].reduce((s, k) => s + spend(addMonths(month, -k), (t) => t.category === c.category), 0) / 3;
    if (now - before > grew.delta) grew = { label: c.label, delta: now - before };
  }

  const tiles: SummaryTile[] = [
    {
      id: 'safe',
      label: 'Vapaata palkkapäivään',
      value: safe.free_to_spend_until_payday_eur,
      unit: '€',
      sub:
        safe.free_to_spend_until_payday_eur > 0
          ? `≈ ${safe.free_per_day_eur} € päivässä · ${safe.days_until_payday} pv`
          : `${safe.days_until_payday} päivää palkkaan`,
      question: 'Paljonko voin käyttää ennen palkkapäivää?',
      tone: safe.free_to_spend_until_payday_eur < 0 ? 'negative' : 'neutral',
    },
    {
      id: 'month',
      label: `Menot ${inMonth}`,
      value: total,
      unit: '€',
      sub: Math.abs(change) < 3 ? 'tavallisen verran' : `${change > 0 ? '↑' : '↓'} ${Math.abs(change)} % tavallisesta`,
      question: `Mihin rahat menivät ${inMonth}?`,
      spark: totals,
    },
    {
      id: 'everyday',
      label: 'Sormien läpi',
      value: profile.everyday_share_of_spending_pct,
      unit: '%',
      sub: `Suomessa ikäisilläsi ${profile.finland_everyday_share_pct} %`,
      question: 'Millainen kuluttaja olen?',
      compare: [profile.everyday_share_of_spending_pct / 100, profile.finland_everyday_share_pct / 100],
    },
    {
      id: 'top',
      label: topLabel,
      value: round(topValue),
      unit: '€',
      sub: `${ofMonth} suurin arkimeno`,
      question: `Paljonko säästäisin, jos vähentäisin ${FORMS[topLabel]?.partitive ?? topLabel.toLowerCase()} 20 %?`,
    },
  ];

  const suggestions = [
    `Paljonko käytin ${FORMS[grew.label]?.illative ?? grew.label.toLowerCase()} ${inMonth}?`,
    'Miten kulutukseni on muuttunut vuodessa?',
  ];
  // The coach speaks first: the surprise that hurt most, and the plan that would have prevented it.
  const fund = replayFund(p);
  let insight: Insight | undefined;
  if (fund.worst && fund.worst.actualDays > 0) {
    insight = {
      text: `${dayLabel(fund.worst.date)} tullut ${formatThousands(round(fund.worst.amount))} euron yllätysmeno (${fund.worst.label.toLowerCase()}) vei tilisi ${fund.worst.actualDays} päiväksi miinukselle.`,
      question: 'Miten varaudun yllättäviin menoihin?',
      action: 'Katso, miten sen voi estää',
    };
  }
  const savings = p.other?.accounts.find((a) => a.kind === 'savings');
  const card = p.other?.accounts.find((a) => a.kind === 'credit');
  if (savings && card && card.balance < 0) {
    insight = {
      text: `Toisessa pankissa on ${formatThousands(savings.balance)} euroa säästöjä, mutta luottokortilla ${formatThousands(-card.balance)} euroa velkaa ${String(card.ratePct).replace('.', ',')}\u00A0%:n korolla.`,
      question: 'Kannattaako maksaa luottokortti säästöillä?',
      action: 'Katso, kumpi kannattaa',
    };
  }
  return { tiles, suggestions, insight, plan: { monthly: fund.monthly, nextPayday: dayLabel(nextPayday(p)) } };
}

export function runTool(p: Persona, name: string, args: Record<string, unknown>): ToolResult {
  const result = calculate(p, name, args);
  if ('error' in result.facts) return result;
  // Official figures the answer may compare with; the model decides whether one helps.
  const comparisons = officialComparisons(p, name, args);
  if (comparisons.length) result.facts.official_comparisons = comparisons;
  return result;
}

function officialComparisons(p: Persona, name: string, args: Record<string, unknown>): Comparison[] {
  switch (name) {
    case 'spending_total':
    case 'what_if': {
      const what = typeof args.what === 'string' ? args.what : 'all_spending';
      return [...forSpending(what, p.age, p.postalCode), ...(name === 'what_if' ? forSaving(p.age) : [])];
    }
    case 'top_categories':
      return forCategories(p.age);
    case 'spending_profile':
      return forProfile(p.age);
    case 'safe_to_spend':
      return forBuffer(p.age);
    case 'surprise_fund':
      return forSurprises(p.age);
    case 'all_accounts':
      return forBuffer(p.age);
    default:
      return [];
  }
}

function calculate(p: Persona, name: string, args: Record<string, unknown>): ToolResult {
  switch (name) {
    case 'spending_total':
      return spendingTotal(p, args);
    case 'safe_to_spend':
      return safeToSpend(p);
    case 'spending_profile':
      return spendingProfile(p);
    case 'what_if':
      return whatIf(p, args);
    case 'top_categories':
      return topCategories(p, args);
    case 'surprise_fund':
      return surpriseFund(p);
    case 'all_accounts':
      return allAccounts(p);
    default:
      return { facts: { error: `Unknown tool ${name}` } };
  }
}

// ---------------------------------------------------------------------------
// Tool descriptions for the model (OpenAI function-calling format).

const monthArg = (what: string) => ({ type: 'string', description: `${what} month, YYYY-MM`, pattern: '^\\d{4}-\\d{2}$' });
const whatArg = {
  type: 'string',
  enum: WHAT_KEYS,
  description:
    'What to measure: all_spending, a category (housing, utilities, groceries, transport, health, home_tech, restaurants_cafes, entertainment, shopping_hobbies, travel) or a narrower merchant group (taxi, fuel, public_transport, parking, restaurant, fast_food_cafe, bar, supermarket, kiosk, pharmacy, doctor, dentist, cinema, events, leisure, electronics, furniture, hardware_home, clothing, sporting_goods, books, toys_hobby, flights, hotels, travel_agency, car_rental). For everyday words such as restaurants, eating out, dining or cafés, use the whole category restaurants_cafes; use a narrower group only when the customer names it specifically (bars, fast food, coffee). Coffee shops are part of fast_food_cafe.',
};

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'surprise_fund',
      description:
        "How unexpected but unavoidable costs (health, a broken appliance) have hit the customer over the last year, how much to set aside on every payday to cover them, and a replay of how the account would have gone with such a fund. Use for: unexpected costs, emergencies, a buffer, 'why was I overdrawn', 'how can I be ready', saving for surprises.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'all_accounts',
      description:
        "All the customer's accounts in every connected bank (S-Pankki, plus other banks connected under PSD2): balances, savings, credit card debt and what it costs, and whether to pay the card from savings. Use for: how much money do I have in total, my whole financial situation, savings, debts, credit card, should I pay off my card or save, other banks.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spending_total',
      description: 'How much the customer spent on something in a month or a range of months, with the months before it for comparison. Also use it for trends ("has X gone up?").',
      parameters: {
        type: 'object',
        properties: {
          what: whatArg,
          from_month: monthArg('First'),
          to_month: monthArg('Last (inclusive)'),
          chart: { type: 'string', enum: ['line', 'columns'], description: 'How to draw it: line (default) or columns. Use columns when the customer asks for another kind of chart or for bars.' },
        },
        required: ['what', 'from_month', 'to_month'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'safe_to_spend',
      description: 'How much the customer can safely spend before the next payday, after setting aside upcoming mandatory costs and a cushion for surprises. Use for "what can I spend this week / until payday", "can I afford X now".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spending_profile',
      description: 'The customer\'s spending split into the three baskets over the last three full months, compared with people of the same age. Use for "what kind of spender am I", "where does my money go", "am I doing well".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'what_if',
      description: 'What changing spending on something by a percentage would save (or cost) per month and per year, based on the last six full months.',
      parameters: {
        type: 'object',
        properties: { what: whatArg, change_pct: { type: 'number', description: 'Change in percent, e.g. -20 for 20 % less' } },
        required: ['what', 'change_pct'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'top_categories',
      description: 'Spending by category in a month or a range of months, largest first. Use for "what did I spend most on in July".',
      parameters: {
        type: 'object',
        properties: {
          from_month: monthArg('First'),
          to_month: monthArg('Last (inclusive)'),
          chart: { type: 'string', enum: ['bars', 'donut'], description: 'How to draw it: bars (default) or donut. Use donut for shares, a pie, or when the customer asks for another kind of chart.' },
        },
        required: ['from_month', 'to_month'],
      },
    },
  },
];
