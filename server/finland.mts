/**
 * Official comparisons from Statistics Finland (Tilastokeskus), fetched once by
 * tools/fetch_finland.py into data/finland.json. Each tool's facts get the few
 * comparisons that fit the question, already worded in Finnish with their
 * numbers; the model decides whether one makes the answer better.
 */
import { readFileSync } from 'node:fs';

import { EN, tr } from './lang.mts';

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

/** 1 234 / 1,6 (Finnish) or 1,234 / 1,6 (English: decimals take a comma too, whole units from 1,000 up). */
function num(v: number, decimals = 0): string {
  const [int, frac] = Math.abs(v).toFixed(EN && Math.abs(v) >= 1000 ? 0 : decimals).split('.');
  const sign = v < 0 ? '−' : '';
  return `${sign}${int.replace(/\B(?=(\d{3})+(?!\d))/g, EN ? ',' : ' ')}${frac ? `,${frac}` : ''}`;
}
const eur = (v: number, decimals = 0) => (EN ? `€${num(decimals ? v : Math.round(v), decimals)}` : `${num(decimals ? v : Math.round(v), decimals)} €`);
const pct = (v: number) => (EN ? `${num(v, Number.isInteger(v) ? 0 : 1)}%` : `${num(v, Number.isInteger(v) ? 0 : 1)} %`);
const MONTHS_IN = ['tammikuussa', 'helmikuussa', 'maaliskuussa', 'huhtikuussa', 'toukokuussa', 'kesäkuussa', 'heinäkuussa', 'elokuussa', 'syyskuussa', 'lokakuussa', 'marraskuussa', 'joulukuussa'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "elokuussa 2026" / "August 2026" */
const monthName = (ym: string) => `${(EN ? MONTHS_EN : MONTHS_IN)[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** The statistics' names in English, keyed by their Finnish names in finland.json. */
const SOURCE_EN: Record<string, string> = {
  kulutustutkimus: 'Household Budget Survey',
  kuluttajahintaindeksi: 'Consumer Price Index',
  'kansainvälinen hintavertailu': 'International Price Comparison',
  'tulo- ja elinolotilasto': 'Income and Living Conditions',
  varallisuustilasto: 'Wealth Statistics',
  velkaantumistilasto: 'Indebtedness Statistics',
  ulosottovelalliset: 'Debt Enforcement',
  tulonjakotilasto: 'Income Distribution Statistics',
  'asuntojen vuokrat': 'Rents of Dwellings',
  'energian hinnat': 'Energy Prices',
};
function source(key: keyof Stats['sources'] & string): string {
  const name = stats.sources[key].name; // e.g. "Tilastokeskus, kulutustutkimus 2022"
  if (!EN) return name;
  const m = name.match(/^Tilastokeskus, (.+) (\S+)$/);
  return m ? `Statistics Finland, ${SOURCE_EN[m[1]] ?? m[1]} ${m[2]}` : name.replace('Tilastokeskus', 'Statistics Finland');
}

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
/** Finnish genitive: "35–44-vuotiaiden", "yli 74-vuotiaiden". */
const ages = (code: string) => (code.endsWith('-') ? `yli ${Number(code.slice(0, -1)) - 1}-vuotiaiden` : `${code.replace('-', '–')}-vuotiaiden`);
/** English: "35–44", "75+". */
const agesEn = (code: string) => (code.endsWith('-') ? `${code.slice(0, -1)}+` : code.replace('-', '–'));
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "35–44-vuotiaiden kotitalouksissa" / "Finnish households headed by a 35–44-year-old" */
const households = (age: number) => tr(`${capital(ages(consumptionBand(age)))} kotitalouksissa`, `Finnish households headed by a ${agesEn(consumptionBand(age))}-year-old`);

/** Monthly consumption per consumption unit (a household scaled to one adult), summed over COICOP codes. */
function consumption(age: number, codes: string[]): number {
  const g = stats.consumption.groups[consumptionBand(age)];
  return codes.reduce((s, c) => s + (c.startsWith('-') ? -(g[c.slice(1)] ?? 0) : (g[c] ?? 0)), 0);
}
/** All consumption except the imputed rent of owner-occupied homes, which never shows on a bank account. */
const TOTAL = ['0', '-042'];

/** The national share of consumption going to the everyday basket: clothing, recreation and culture, restaurants and accommodation. */
export function everydayShareFinland(age: number): { share: number; label: string; source: string; note: string } {
  const share = consumption(age, ['03', '09', '11']) / consumption(age, TOTAL);
  const b = consumptionBand(age).replace('-', '–');
  return {
    share,
    label: tr(`Suomessa ${b}-v.`, `Finland, ${b}`),
    source: source('consumption'),
    note: `${tr('Tilastokeskus', 'Statistics Finland')} ${stats.consumption.year}`,
  };
}

function priceChange(code: string, what: [string, string]): Comparison | null {
  const v = stats.prices.yearChangePct[code];
  if (v === null || v === undefined) return null;
  const how = EN
    ? Math.abs(v) < 0.5 ? "stayed at last year's level" : v > 0 ? `rose ${pct(v)} in a year` : `fell ${pct(-v)} in a year`
    : Math.abs(v) < 0.5 ? 'pysyivät vuoden takaisella tasolla' : v > 0 ? `nousivat vuodessa ${pct(v)}` : `laskivat vuodessa ${pct(-v)}`;
  return { text: tr(`${what[0]} hinnat ${how} (${monthName(stats.prices.month)}).`, `${what[1]} prices ${how} (${monthName(stats.prices.month)}).`), source: source('prices') };
}

function euLevel(code: string, what: [string, string]): Comparison | null {
  const v = stats.priceLevelEU.index[code];
  if (v === null || v === undefined) return null;
  const diff = Math.round(v - 100);
  const text = EN
    ? `In Finland, ${what[1]} cost ${Math.abs(diff) < 3 ? 'about the EU average' : diff > 0 ? `${diff}% more than the EU average` : `${-diff}% less than the EU average`} (${stats.priceLevelEU.year}).`
    : `Suomessa ${what[0]} ovat ${Math.abs(diff) < 3 ? 'samaa tasoa kuin EU:ssa keskimäärin' : diff > 0 ? `${diff} % kalliimpia kuin EU:ssa keskimäärin` : `${-diff} % halvempia kuin EU:ssa keskimäärin`} (${stats.priceLevelEU.year}).`;
  return { text, source: source('priceLevelEU') };
}

function spendLike(age: number, codes: string[], what: [string, string]): Comparison {
  const amount = eur(consumption(age, codes));
  return {
    text: tr(
      `${households(age)} ${what[0]} meni keskimäärin ${amount} kuukaudessa yhtä aikuista kohden laskettuna (${stats.consumption.year}).`,
      `${households(age)} spent on average ${amount} a month per adult on ${what[1]} (${stats.consumption.year}).`,
    ),
    source: source('consumption'),
  };
}

/** Where the customer lives, from the first digits of the postal code, for rents. */
function area(postalCode: string): string {
  if (postalCode.startsWith('00')) return 'Helsinki';
  if (postalCode.startsWith('01')) return 'Vantaa';
  if (postalCode.startsWith('02')) return 'Espoo ja Kauniainen';
  return 'Koko maa';
}
const AREA_IN: Record<string, [string, string]> = {
  'Koko maa': ['Koko maassa', 'Across Finland'],
  Vantaa: ['Vantaalla', 'In Vantaa'],
  Helsinki: ['Helsingissä', 'In Helsinki'],
  'Espoo ja Kauniainen': ['Espoossa ja Kauniaisissa', 'In Espoo and Kauniainen'],
};

const moreOrLess = (change: number) => (change >= 0 ? tr('enemmän', 'more') : tr('vähemmän', 'less'));

/** Comparisons for a spending category or merchant group (the tools' `what` keys). */
const BY_WHAT: Record<string, (age: number, postalCode: string) => (Comparison | null)[]> = {
  all_spending: (age) => [
    {
      text: tr(
        `${households(age).replace('kotitalouksissa', 'kotitalouksien')} kulutusmenot olivat keskimäärin ${eur(consumption(age, TOTAL))} kuukaudessa yhtä aikuista kohden laskettuna, omistusasunnon laskennallista vuokraa lukuun ottamatta (${stats.consumption.year}).`,
        `${households(age)} spent on average ${eur(consumption(age, TOTAL))} a month per adult, not counting the imputed rent of owner-occupied homes (${stats.consumption.year}).`,
      ),
      source: source('consumption'),
    },
    priceChange('SSS', ['Kuluttaja', 'Consumer']),
  ],
  groceries: (age) => [
    spendLike(age, ['01'], ['ruokaan ja alkoholittomiin juomiin', 'food and non-alcoholic drinks']),
    priceChange('01', ['Ruoan', 'Food']),
    euLevel('01', ['ruoka ja alkoholittomat juomat', 'food and non-alcoholic drinks']),
  ],
  restaurants_cafes: (age) => [
    spendLike(age, ['111'], ['ravintoloihin ja kahviloihin', 'restaurants and cafés']),
    priceChange('111', ['Ravintoloiden ja kahviloiden', 'Restaurant and café']),
    euLevel('11', ['ravintola- ja majoituspalvelut', 'restaurants and accommodation']),
  ],
  housing: (_age, postalCode) => {
    const r = stats.rent.areas[area(postalCode)];
    const [whereFi, whereEn] = AREA_IN[area(postalCode)];
    const quarter = `${stats.rent.quarter.slice(5)}/${stats.rent.quarter.slice(0, 4)}`;
    return [
      {
        text: tr(
          `${whereFi} vapaarahoitteisen vuokra-asunnon keskivuokra oli ${num(r.eurPerM2.all, 1)} €/m² kuukaudessa, yksiöissä ${num(r.eurPerM2.studio, 1)} €/m² (${quarter}).`,
          `${whereEn}, the average rent of a privately financed rental home was ${eur(r.eurPerM2.all, 1)}/m² a month, ${eur(r.eurPerM2.studio, 1)}/m² for studios (${stats.rent.quarter.slice(4)} ${stats.rent.quarter.slice(0, 4)}).`,
        ),
        source: source('rent'),
      },
      priceChange('041', ['Asumisvuokrien', 'Rent']),
    ];
  },
  utilities: () => [
    {
      text: tr(
        `Kotitalouksien sähkön kokonaishinta veroineen oli ${num(stats.electricity.centsPerKwh, 1)} senttiä kilowattitunnilta, ${pct(Math.abs(stats.electricity.yearChangePct))} ${moreOrLess(stats.electricity.yearChangePct)} kuin vuotta aiemmin (${monthName(stats.electricity.month)}).`,
        `Household electricity cost ${num(stats.electricity.centsPerKwh, 1)} cents per kWh including taxes, ${pct(Math.abs(stats.electricity.yearChangePct))} ${moreOrLess(stats.electricity.yearChangePct)} than a year earlier (${monthName(stats.electricity.month)}).`,
      ),
      source: source('electricity'),
    },
    euLevel('045', ['sähkö ja lämmitys', 'electricity and heating']),
  ],
  transport: (age) => [spendLike(age, ['07'], ['liikenteeseen', 'transport']), priceChange('07', ['Liikenteen', 'Transport'])],
  fuel: () => [
    {
      text: tr(
        `Bensiinilitra (95 E10) maksoi keskimäärin ${eur(stats.fuel.petrol95.centsPerLitre / 100, 2)}, ${pct(Math.abs(stats.fuel.petrol95.yearChangePct))} ${moreOrLess(stats.fuel.petrol95.yearChangePct)} kuin vuotta aiemmin (${monthName(stats.fuel.month)}).`,
        `A litre of petrol (95 E10) cost on average ${eur(stats.fuel.petrol95.centsPerLitre / 100, 2)}, ${pct(Math.abs(stats.fuel.petrol95.yearChangePct))} ${moreOrLess(stats.fuel.petrol95.yearChangePct)} than a year earlier (${monthName(stats.fuel.month)}).`,
      ),
      source: source('fuel'),
    },
    priceChange('0722', ['Polttoaineiden', 'Fuel']),
  ],
  taxi: (age) => [
    spendLike(age, ['073'], ['taksi-, joukkoliikenne- ja muihin matkustuspalveluihin', 'taxis, public transport and other passenger transport']),
    euLevel('073', ['matkustuspalvelut, kuten taksit ja joukkoliikenne,', 'passenger transport services such as taxis and public transport']),
  ],
  health: (age) => [spendLike(age, ['06'], ['terveyteen', 'health']), priceChange('06', ['Terveydenhoidon', 'Health care'])],
  home_tech: (age) => [
    spendLike(age, ['05', '081'], ['kodin kalusteisiin, kodinkoneisiin ja laitteisiin', 'furniture, appliances and devices']),
    priceChange('05', ['Kalusteiden ja kodinkoneiden', 'Furniture and appliance']),
    euLevel('053', ['kodinkoneet', 'household appliances']),
  ],
  entertainment: (age) => [
    spendLike(age, ['094', '096'], ['vapaa-ajan ja kulttuurin palveluihin', 'leisure and cultural services']),
    priceChange('09', ['Kulttuurin ja vapaa-ajan', 'Leisure and culture']),
  ],
  shopping_hobbies: (age) => [
    spendLike(age, ['03', '09'], ['vaatteisiin, harrastuksiin ja vapaa-aikaan', 'clothing, hobbies and leisure']),
    priceChange('03', ['Vaatteiden ja kenkien', 'Clothing and footwear']),
    euLevel('031', ['vaatteet', 'clothes']),
  ],
  travel: (age) => [
    spendLike(age, ['098', '112'], ['valmismatkoihin ja majoitukseen', 'package holidays and accommodation']),
    priceChange('098', ['Valmismatkojen', 'Package holiday']),
  ],
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
      text: tr(
        `${households(age)} asumiseen meni ${share(['04', '-042'])}, ruokaan ${share(['01'])}, liikenteeseen ${share(['07'])} ja ravintoloihin ${share(['111'])} kulutuksesta (${stats.consumption.year}).`,
        `${households(age)} spent ${share(['04', '-042'])} of their spending on housing, ${share(['01'])} on food, ${share(['07'])} on transport and ${share(['111'])} on restaurants (${stats.consumption.year}).`,
      ),
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
      text: tr(
        `${households(age)} vaatteisiin, vapaa-aikaan, kulttuuriin, ravintoloihin ja matkoihin meni ${pct(Math.round(e.share * 100))} kulutuksesta (${stats.consumption.year}).`,
        `${households(age)} spent ${pct(Math.round(e.share * 100))} of their spending on clothing, leisure, culture, restaurants and travel (${stats.consumption.year}).`,
      ),
      source: e.source,
    },
    {
      text: tr(
        `${capital(ages(incomeAge))} käytettävissä olevien rahatulojen mediaani oli ${eur(income)} vuodessa eli noin ${eur(income / 12)} kuukaudessa (${stats.income.year}).`,
        `The median disposable income of ${agesEn(incomeAge)}-year-olds in Finland was ${eur(income)} a year, about ${eur(income / 12)} a month (${stats.income.year}).`,
      ),
      source: source('income'),
    },
  ];
}

/** Savings, buffers and debt (for safe-to-spend questions). */
export function forBuffer(age: number): Comparison[] {
  const all = stats.coping.groups.SS;
  const debt = stats.debt.groups[debtBand(age)];
  return [
    {
      text: tr(
        `Suomalaisista kotitalouksista ${pct(Math.round(all.cannotSavePct))}:lla ei jää rahaa säästöön (${stats.coping.year}).`,
        `${pct(Math.round(all.cannotSavePct))} of Finnish households have no money left over to save (${stats.coping.year}).`,
      ),
      source: source('coping'),
    },
    depositsMedian(age),
    {
      text: tr(
        `${capital(ages(debtBand(age)).replace('iden', 'ista'))} ${pct(Math.round(debt.consumer.sharePct))}:lla on kulutus- tai muuta velkaa, ja heidän velkansa mediaani on ${eur(debt.consumer.median)} (${stats.debt.year}).`,
        `${pct(Math.round(debt.consumer.sharePct))} of ${agesEn(debtBand(age))}-year-olds in Finland have consumer or other debt, with a median of ${eur(debt.consumer.median)} (${stats.debt.year}).`,
      ),
      source: source('debt'),
    },
  ];
}

function depositsMedian(age: number): Comparison {
  const dep = stats.deposits.groups[depositBand(age)];
  return {
    text: tr(
      `${capital(ages(depositBand(age)))} talletusten mediaani oli ${eur(dep.depositsMedian)} (${stats.deposits.year}).`,
      `The median bank deposits of ${agesEn(depositBand(age))}-year-olds in Finland were ${eur(dep.depositsMedian)} (${stats.deposits.year}).`,
    ),
    source: source('deposits'),
  };
}

/** For the surprise fund: how many could not cope with an unexpected expense. */
export function forSurprises(age: number): Comparison[] {
  const all = stats.coping.groups.SS;
  const single = stats.coping.groups['1'];
  return [
    {
      text: tr(
        `Suomalaisista kotitalouksista ${pct(Math.round(all.cannotCopePct))} ei selviäisi yllättävästä menosta omilla varoillaan, yhden hengen talouksista ${pct(Math.round(single.cannotCopePct))} (${stats.coping.year}).`,
        `${pct(Math.round(all.cannotCopePct))} of Finnish households could not cover an unexpected expense from their own money, ${pct(Math.round(single.cannotCopePct))} of single-person households (${stats.coping.year}).`,
      ),
      source: source('coping'),
    },
    depositsMedian(age),
  ];
}

/** For saving ideas: how many of that age invest at all. */
export function forSaving(age: number): Comparison[] {
  const dep = stats.deposits.groups[depositBand(age)];
  return [
    {
      text: tr(
        `${capital(ages(depositBand(age)))} talletusten mediaani oli ${eur(dep.depositsMedian)}, ja ${pct(Math.round(dep.investorsPct))} heistä omisti osakkeita tai rahastoja (${stats.deposits.year}).`,
        `The median bank deposits of ${agesEn(depositBand(age))}-year-olds in Finland were ${eur(dep.depositsMedian)}, and ${pct(Math.round(dep.investorsPct))} of them owned shares or funds (${stats.deposits.year}).`,
      ),
      source: source('deposits'),
    },
  ];
}

/** The sources an answer drew on: those whose numbers appear in its text. */
export function sourcesUsed(text: string, comparisons: Comparison[]): string[] {
  if (!/Tilastokesk|Statistics Finland/i.test(text) || comparisons.length === 0) return [];
  const norm = (s: string) => s.replace(/[   ]/g, '');
  const body = norm(text);
  // Amounts with their unit (332€, €332, 1,6%, 1.6%, 17,9senttiä), so age groups and years do not count as a match.
  const amounts = (s: string) => norm(s).match(/€\d[\d,.]*\d|€\d|\d[\d,.]*(?:€|%|sent|cent)/g) ?? [];
  const used = comparisons.filter((c) => amounts(c.text).some((n) => body.includes(n)));
  return [...new Set((used.length ? used : comparisons.slice(0, 1)).map((c) => c.source))];
}
