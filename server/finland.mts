/**
 * Official comparisons from Statistics Finland (Tilastokeskus), fetched once by
 * tools/fetch_finland.py into data/finland.json. Each tool's facts get the few
 * comparisons that fit the question, already worded in Finnish with their
 * numbers; the model decides whether one makes the answer better.
 */
import { readFileSync } from 'node:fs';

type Stats = {
  consumption: { year: number; groups: Record<string, Record<string, number>> };
  prices: { month: string; yearChangePct: Record<string, number | null> };
  priceLevelEU: { year: number; index: Record<string, number | null> };
  coping: { year: number; groups: Record<string, { savesPct: number; cannotSavePct: number; copesPct: number; cannotCopePct: number }> };
  deposits: { year: number; groups: Record<string, { depositsMedian: number; depositOwnersPct: number; investmentsMedian: number; investorsPct: number }> };
  debt: { year: number; groups: Record<string, Record<'housing' | 'consumer', { sharePct: number; median: number }>> };
  enforcement: { year: number; people: Record<string, number> };
  income: { year: number; medians: Record<string, number> };
  rent: { quarter: string; areas: Record<string, { eurPerM2: { all: number; studio: number; oneBedroom: number }; yearChangePct: number }> };
  fuel: { month: string; petrol95: { centsPerLitre: number; yearChangePct: number }; diesel: { centsPerLitre: number; yearChangePct: number } };
  electricity: { month: string; centsPerKwh: number; yearChangePct: number };
  sources: Record<string, { name: string; url: string }>;
};

export type Comparison = { text: string; source: string };

const stats = JSON.parse(readFileSync(new URL('./data/finland.json', import.meta.url), 'utf8')) as Stats;

/** Finnish number: 1 234 or 1,6 (non-breaking space between thousands). */
function fi(v: number, decimals = 0): string {
  const [int, frac] = Math.abs(v).toFixed(decimals).split('.');
  return `${v < 0 ? '−' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${frac ? `,${frac}` : ''}`;
}
const eur = (v: number) => `${fi(Math.round(v))} €`;
const pct = (v: number) => `${fi(v, Number.isInteger(v) ? 0 : 1)} %`;
const monthName = (ym: string) =>
  ['tammikuussa', 'helmikuussa', 'maaliskuussa', 'huhtikuussa', 'toukokuussa', 'kesäkuussa', 'heinäkuussa', 'elokuussa', 'syyskuussa', 'lokakuussa', 'marraskuussa', 'joulukuussa'][
    Number(ym.slice(5, 7)) - 1
  ] + ` ${ym.slice(0, 4)}`;
const source = (key: keyof Stats['sources'] & string) => stats.sources[key].name;

// Age groups differ between statistics; each picks the band the customer is in.
const band = (age: number, edges: [number, number, string][]) => edges.find(([lo, hi]) => age >= lo && age <= hi)?.[2];
const consumptionBand = (age: number) =>
  band(age, [[17, 24, '17-24'], [25, 34, '25-34'], [35, 44, '35-44'], [45, 54, '45-54'], [55, 64, '55-64'], [65, 74, '65-74'], [75, 84, '75-84'], [85, 200, '85-']]) ?? 'SSS';
const debtBand = (age: number) => band(age, [[15, 24, '15-24'], [25, 34, '25-34'], [35, 44, '35-44'], [45, 54, '45-54'], [55, 64, '55-64'], [65, 74, '65-74'], [75, 200, '75-']]) ?? 'SSS';
const incomeBand = (age: number) => band(age, [[18, 24, '18-24'], [25, 34, '25-34'], [35, 49, '35-49'], [50, 64, '50-64'], [65, 74, '65-74'], [75, 200, '75-']]) ?? '18-';
const depositBand = (age: number) => {
  if (age < 25) return '18-24';
  if (age >= 85) return '85-';
  const lo = Math.floor(age / 5) * 5;
  return `${lo}-${lo + 4}`;
};
const ages = (code: string) => (code.endsWith('-') ? `yli ${Number(code.slice(0, -1)) - 1}-vuotiaiden` : `${code.replace('-', '–')}-vuotiaiden`);

/** Monthly consumption per consumption unit (a household scaled to one adult), summed over COICOP codes. */
function consumption(age: number, codes: string[]): number {
  const g = stats.consumption.groups[consumptionBand(age)];
  return codes.reduce((s, c) => s + (c.startsWith('-') ? -(g[c.slice(1)] ?? 0) : (g[c] ?? 0)), 0);
}
/** All consumption except the imputed rent of owner-occupied homes, which never shows on a bank account. */
const TOTAL = ['0', '-042'];

/** The national share of consumption going to the everyday basket: clothing, recreation and culture, restaurants and accommodation. */
export function everydayShareFinland(age: number): { share: number; label: string; source: string } {
  const share = consumption(age, ['03', '09', '11']) / consumption(age, TOTAL);
  return { share, label: `Suomessa ${consumptionBand(age).replace('-', '–')}-v.`, source: source('consumption') };
}

function priceChange(code: string, what: string): Comparison | null {
  const v = stats.prices.yearChangePct[code];
  if (v === null || v === undefined) return null;
  const how = Math.abs(v) < 0.5 ? 'pysyivät vuoden takaisella tasolla' : v > 0 ? `nousivat vuodessa ${pct(v)}` : `laskivat vuodessa ${pct(-v)}`;
  return { text: `${what} hinnat ${how} (${monthName(stats.prices.month)}).`, source: source('prices') };
}

function euLevel(code: string, what: string): Comparison | null {
  const v = stats.priceLevelEU.index[code];
  if (v === null || v === undefined) return null;
  const diff = Math.round(v - 100);
  const how = Math.abs(diff) < 3 ? 'samaa tasoa kuin EU:ssa keskimäärin' : diff > 0 ? `${diff} % kalliimpia kuin EU:ssa keskimäärin` : `${-diff} % halvempia kuin EU:ssa keskimäärin`;
  return { text: `Suomessa ${what} ovat ${how} (${stats.priceLevelEU.year}).`, source: source('priceLevelEU') };
}

function spendLike(age: number, codes: string[], what: string): Comparison {
  return {
    text: `${capital(ages(consumptionBand(age)))} kotitalouksissa ${what} meni keskimäärin ${eur(consumption(age, codes))} kuukaudessa yhtä aikuista kohden laskettuna (${stats.consumption.year}).`,
    source: source('consumption'),
  };
}
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Where the customer lives, from the first digits of the postal code, for rents. */
function area(postalCode: string): string {
  if (postalCode.startsWith('00')) return 'Helsinki';
  if (postalCode.startsWith('01')) return 'Vantaa';
  if (postalCode.startsWith('02')) return 'Espoo ja Kauniainen';
  return 'Koko maa';
}

/** Comparisons for a spending category or merchant group (the tools' `what` keys). */
const BY_WHAT: Record<string, (age: number, postalCode: string) => (Comparison | null)[]> = {
  all_spending: (age) => [
    { text: `${capital(ages(consumptionBand(age)))} kotitalouksien kulutusmenot olivat keskimäärin ${eur(consumption(age, TOTAL))} kuukaudessa yhtä aikuista kohden laskettuna, omistusasunnon laskennallista vuokraa lukuun ottamatta (${stats.consumption.year}).`, source: source('consumption') },
    priceChange('SSS', 'Kuluttaja'),
  ],
  groceries: (age) => [spendLike(age, ['01'], 'ruokaan ja alkoholittomiin juomiin'), priceChange('01', 'Ruoan'), euLevel('01', 'ruoka ja alkoholittomat juomat')],
  restaurants_cafes: (age) => [spendLike(age, ['111'], 'ravintoloihin ja kahviloihin'), priceChange('111', 'Ravintoloiden ja kahviloiden'), euLevel('11', 'ravintola- ja majoituspalvelut')],
  housing: (_age, postalCode) => {
    const name = area(postalCode);
    const r = stats.rent.areas[name];
    const where = name === 'Koko maa' ? 'Koko maassa' : name === 'Vantaa' ? 'Vantaalla' : name === 'Helsinki' ? 'Helsingissä' : 'Espoossa ja Kauniaisissa';
    return [
      { text: `${where} vapaarahoitteisen vuokra-asunnon keskivuokra oli ${fi(r.eurPerM2.all, 1)} €/m² kuukaudessa, yksiöissä ${fi(r.eurPerM2.studio, 1)} €/m² (${stats.rent.quarter.slice(5)}/${stats.rent.quarter.slice(0, 4)}).`, source: source('rent') },
      priceChange('041', 'Asumisvuokrien'),
    ];
  },
  utilities: () => [
    { text: `Kotitalouksien sähkön kokonaishinta veroineen oli ${fi(stats.electricity.centsPerKwh, 1)} senttiä kilowattitunnilta, ${pct(Math.abs(stats.electricity.yearChangePct))} ${stats.electricity.yearChangePct >= 0 ? 'enemmän' : 'vähemmän'} kuin vuotta aiemmin (${monthName(stats.electricity.month)}).`, source: source('electricity') },
    euLevel('045', 'sähkö ja lämmitys'),
  ],
  transport: (age) => [spendLike(age, ['07'], 'liikenteeseen'), priceChange('07', 'Liikenteen')],
  fuel: () => [
    { text: `Bensiinilitra (95 E10) maksoi keskimäärin ${fi(stats.fuel.petrol95.centsPerLitre / 100, 2)} €, ${pct(Math.abs(stats.fuel.petrol95.yearChangePct))} ${stats.fuel.petrol95.yearChangePct >= 0 ? 'enemmän' : 'vähemmän'} kuin vuotta aiemmin (${monthName(stats.fuel.month)}).`, source: source('fuel') },
    priceChange('0722', 'Polttoaineiden'),
  ],
  taxi: (age) => [spendLike(age, ['073'], 'taksi-, joukkoliikenne- ja muihin matkustuspalveluihin'), euLevel('073', 'matkustuspalvelut, kuten taksit ja joukkoliikenne,')],
  health: (age) => [spendLike(age, ['06'], 'terveyteen'), priceChange('06', 'Terveydenhoidon')],
  home_tech: (age) => [spendLike(age, ['05', '081'], 'kodin kalusteisiin, kodinkoneisiin ja laitteisiin'), priceChange('05', 'Kalusteiden ja kodinkoneiden'), euLevel('053', 'kodinkoneet')],
  entertainment: (age) => [spendLike(age, ['094', '096'], 'vapaa-ajan ja kulttuurin palveluihin'), priceChange('09', 'Kulttuurin ja vapaa-ajan')],
  shopping_hobbies: (age) => [spendLike(age, ['03', '09'], 'vaatteisiin, harrastuksiin ja vapaa-aikaan'), priceChange('03', 'Vaatteiden ja kenkien'), euLevel('031', 'vaatteet')],
  travel: (age) => [spendLike(age, ['098', '112'], 'valmismatkoihin ja majoitukseen'), priceChange('098', 'Valmismatkojen')],
};
// Finer merchant groups borrow their category's comparisons.
const ALIASES: Record<string, string> = {
  supermarket: 'groceries', kiosk: 'groceries',
  restaurant: 'restaurants_cafes', fast_food_cafe: 'restaurants_cafes', bar: 'restaurants_cafes',
  public_transport: 'taxi', parking: 'transport',
  pharmacy: 'health', doctor: 'health', dentist: 'health',
  cinema: 'entertainment', events: 'entertainment', leisure: 'entertainment', streaming: 'entertainment',
  electronics: 'home_tech', furniture: 'home_tech', hardware_home: 'home_tech',
  clothing: 'shopping_hobbies', sporting_goods: 'shopping_hobbies', books: 'shopping_hobbies', toys_hobby: 'shopping_hobbies',
  flights: 'travel', hotels: 'travel', travel_agency: 'travel', car_rental: 'travel',
};

export function forSpending(what: string, age: number, postalCode: string): Comparison[] {
  const make = BY_WHAT[what] ?? BY_WHAT[ALIASES[what] ?? ''];
  return make ? make(age, postalCode).filter((c): c is Comparison => c !== null) : [];
}

/** How a typical household of that age splits its spending (for "where did my money go"). */
export function forCategories(age: number): Comparison[] {
  const total = consumption(age, TOTAL);
  const share = (codes: string[]) => pct(Math.round((consumption(age, codes) / total) * 100));
  return [
    {
      text: `${capital(ages(consumptionBand(age)))} kotitalouksissa asumiseen meni ${share(['04', '-042'])}, ruokaan ${share(['01'])}, liikenteeseen ${share(['07'])} ja ravintoloihin ${share(['111'])} kulutuksesta (${stats.consumption.year}).`,
      source: source('consumption'),
    },
  ];
}

/** For the spending profile: the everyday share nationally, and typical income. */
export function forProfile(age: number): Comparison[] {
  const e = everydayShareFinland(age);
  const incomeAge = incomeBand(age);
  const income = stats.income.medians[incomeAge];
  return [
    {
      text: `${capital(ages(consumptionBand(age)))} kotitalouksissa vaatteisiin, vapaa-aikaan, kulttuuriin, ravintoloihin ja matkoihin meni ${pct(Math.round(e.share * 100))} kulutuksesta (${stats.consumption.year}).`,
      source: e.source,
    },
    {
      text: `${capital(ages(incomeAge))} käytettävissä olevien rahatulojen mediaani oli ${eur(income)} vuodessa eli noin ${eur(income / 12)} kuukaudessa (${stats.income.year}).`,
      source: source('income'),
    },
  ];
}

/** Savings, buffers and debt (for safe-to-spend questions). */
export function forBuffer(age: number): Comparison[] {
  const all = stats.coping.groups.SS;
  const dep = stats.deposits.groups[depositBand(age)];
  const debt = stats.debt.groups[debtBand(age)];
  return [
    { text: `Suomalaisista kotitalouksista ${pct(Math.round(all.cannotSavePct))}:lla ei jää rahaa säästöön (${stats.coping.year}).`, source: source('coping') },
    { text: `${capital(ages(depositBand(age)))} talletusten mediaani oli ${eur(dep.depositsMedian)} (${stats.deposits.year}).`, source: source('deposits') },
    { text: `${capital(ages(debtBand(age)).replace('iden', 'ista'))} ${pct(Math.round(debt.consumer.sharePct))}:lla on kulutus- tai muuta velkaa, ja heidän velkansa mediaani on ${eur(debt.consumer.median)} (${stats.debt.year}).`, source: source('debt') },
  ];
}

/** For the surprise fund: how many could not cope with an unexpected expense. */
export function forSurprises(age: number): Comparison[] {
  const all = stats.coping.groups.SS;
  const single = stats.coping.groups['1'];
  const dep = stats.deposits.groups[depositBand(age)];
  return [
    {
      text: `Suomalaisista kotitalouksista ${pct(Math.round(all.cannotCopePct))} ei selviäisi yllättävästä menosta omilla varoillaan, yhden hengen talouksista ${pct(Math.round(single.cannotCopePct))} (${stats.coping.year}).`,
      source: source('coping'),
    },
    { text: `${capital(ages(depositBand(age)))} talletusten mediaani oli ${eur(dep.depositsMedian)} (${stats.deposits.year}).`, source: source('deposits') },
  ];
}

/** For saving ideas: how many of that age invest at all. */
export function forSaving(age: number): Comparison[] {
  const dep = stats.deposits.groups[depositBand(age)];
  return [
    { text: `${capital(ages(depositBand(age)))} talletusten mediaani oli ${eur(dep.depositsMedian)}, ja ${pct(Math.round(dep.investorsPct))} heistä omisti osakkeita tai rahastoja (${stats.deposits.year}).`, source: source('deposits') },
  ];
}

/** The sources an answer drew on: those whose numbers appear in its text. */
export function sourcesUsed(text: string, comparisons: Comparison[]): string[] {
  if (!/Tilastokesk/i.test(text) || comparisons.length === 0) return [];
  const norm = (s: string) => s.replace(/[   ]/g, '');
  const body = norm(text);
  // Amounts with their unit (332€, 1,6%, 17,9senttiä), so age groups and years do not count as a match.
  const amounts = (s: string) => norm(s).match(/\d[\d,]*(?:€|%|sent)/g) ?? [];
  const used = comparisons.filter((c) => amounts(c.text).some((n) => body.includes(n)));
  return [...new Set((used.length ? used : comparisons.slice(0, 1)).map((c) => c.source))];
}
