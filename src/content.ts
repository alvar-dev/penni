import type { ToolCall, Viz } from './shared/api';

export type { Viz };

export type Message =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string; viz?: Viz; call?: ToolCall; sources?: string[]; example?: boolean; event?: boolean };

export type Persona = { id: string; name: string; age: number; postalCode: string; tagline: string };

/**
 * Customers from the synthetic challenge dataset (5 100 in all) chosen to show
 * different situations. The app is signed in as the first one; the others are
 * reachable only through the development link ?persona=<id>. The id, age and
 * postal code come from the data; the dataset has no names, so these are made up.
 */
export const personas: Persona[] = [
  { id: 'CUST03915', name: 'Aino', age: 36, postalCode: '01510', tagline: 'Maltillinen kuluttaja, jota yllätysmenot satuttavat' },
  { id: 'CUST04376', name: 'Noora', age: 27, postalCode: '01800', tagline: 'Pienet tulot, paljon ravintoloita' },
  { id: 'CUST04925', name: 'Mikael', age: 45, postalCode: '02680', tagline: 'Hyvät tulot, silti välillä miinuksella' },
  { id: 'CUST00332', name: 'Laura', age: 39, postalCode: '01400', tagline: 'Säästää kuukausittain' },
  { id: 'CUST04075', name: 'Marja', age: 59, postalCode: '00730', tagline: 'Paljon yllättäviä menoja' },
  { id: 'CUST00084', name: 'Eila', age: 72, postalCode: '00150', tagline: 'Eläkeläinen, tiukka talous' },
  { id: 'CUST03667', name: 'Petri', age: 45, postalCode: '00430', tagline: 'Palkka siirtyy toiseen pankkiin' },
];

export const strings = {
  heroTitle: 'Kysy rahoistasi',
  greeting: 'Hei',
  heroHint: 'Napauta palloa ja kysy rahoistasi.',
  listeningTitle: 'Kuuntelen',
  listeningHint: 'Kysy, ja pidä sitten pieni tauko.',
  transcribingInline: 'Tunnistetaan puhetta…',
  transcribingTitle: 'Hetki',
  transcribingHint: 'Muutan puheen tekstiksi.',
  noSpeech: 'En kuullut puhetta',
  notUnderstood: 'En saanut puheesta selvää',
  speechUnavailable: 'Puheentunnistus ei ole nyt käytössä',
  retry: 'Yritä uudelleen',
  micDenied: 'Mikrofonin käyttö on estetty. Salli se puhelimen asetuksista.',
  micError: 'Mikrofoni ei käynnistynyt.',
  inputPlaceholder: 'Kirjoita kysymys',
  thinking: 'Lasketaan…',
  exampleTag: 'Esimerkkidata',
  orbStart: 'Kysy puhumalla',
  orbStop: 'Lopeta kuuntelu',
  send: 'Lähetä',
  /** Before the Statistics Finland source under an answer. */
  source: 'Lähde: Tilastokeskus,',
  menuOpen: 'Avaa valikko',
  menuClose: 'Sulje valikko',
  newChat: 'Uusi keskustelu',
  historyTitle: 'Keskustelut',
  historyEmpty: 'Aiemmat keskustelusi näkyvät täällä.',
  noAnswer: 'Ei vastausta',
  deleteTitle: 'Poistetaanko keskustelu?',
  deleteHint: 'Pitkä painallus poistaa keskustelun.',
  delete: 'Poista',
  cancel: 'Peruuta',
  errorNetwork: 'En saanut yhteyttä valmentajaan. Tarkista, että palvelin on käynnissä, ja yritä uudelleen.',
  errorBusy: 'Kysymyksiä tuli juuri nyt liian monta. Odota hetki ja kysy uudelleen.',
  errorModel: 'Valmentaja ei ehtinyt vastata. Yritä uudelleen.',
  thinkingSteps: ['Katson tilitapahtumiasi…', 'Lasketaan…', 'Kirjoitan vastausta…'],
  // Another bank (PSD2). The other bank is example data in the demo.
  connectTitle: 'Yhdistä toinen pankki',
  connectLead: 'Kun annat luvan, S-Pankki hakee tilitietosi toisesta pankista. Valmentaja näkee silloin koko taloutesi ja neuvoo sen perusteella.',
  connectBank: 'Toinen pankki',
  connectBankNote: 'Esimerkkipankki tässä demossa',
  connectScopeTitle: 'Luvalla saa',
  connectScope: [
    ['Saldot ja tapahtumat', 'Tilit, kortit ja ostot'],
    ['Ei maksuoikeutta', 'Rahaa ei voi siirtää eikä maksaa'],
    ['Voimassa 180 päivää', 'Voit perua luvan milloin tahansa'],
  ] as [string, string][],
  connectLegal: 'Tilitietopalvelu perustuu maksupalveludirektiiviin (PSD2). Tunnistaudut toisen pankin omilla tunnuksilla.',
  connectContinue: 'Jatka tunnistautumiseen',
  connectAuthenticating: 'Tunnistaudutaan toisessa pankissa…',
  connectDone: 'Yhdistetty',
  connectClose: 'Sulje',
  connectedEvent: 'Toinen pankki yhdistetty',
  accountsConnect: 'Yhdistä toinen pankki',
  accountsConnectNote: 'PSD2 · vain lukuoikeus',
  accountsExample: 'esimerkkidata',
  banksTitle: 'Pankit',
  banksDisconnect: 'Poista yhteys',
  planStart: 'Aloita: {amount} € joka palkkapäivä',
  planOn: 'Yllätysrahasto päällä · alkaen {date}',
  planHome: 'Yllätysrahasto päällä · {amount} € joka palkkapäivä',
  planStop: 'Lopeta',
};

export const suggestions = [
  'Paljonko käytin takseihin viime kuussa?',
  'Paljonko voin käyttää tällä viikolla?',
  'Millainen kuluttaja olen?',
];

/*
 * PLACEHOLDER ANSWERS, used only by the development preview links in App.tsx
 * (?preview=chat etc.) so layouts can be checked without calling the model.
 * Nothing here is computed from the data; each is tagged "Esimerkkidata".
 * Real answers come from the server (src/api.ts).
 */
const MONTHS = ['maalis', 'huhti', 'touko', 'kesä', 'heinä', 'elo'];
const LONG = ['maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu', 'heinäkuu', 'elokuu'];

function placeholderRunway(): Extract<Viz, { kind: 'runway' }>['points'] {
  const points: Extract<Viz, { kind: 'runway' }>['points'] = [];
  for (let i = 0; i < 27; i++) {
    const day = new Date(Date.UTC(2026, 7, 20 + i));
    const label = `${day.getUTCDate()}.${day.getUTCMonth() + 1}.`;
    const balance = i <= 20 ? Math.round(1180 - i * 43 + 30 * Math.sin(i * 1.7)) : Math.round(309 - (i - 20) * 26.3);
    points.push({ label, title: label, balance, projected: i > 20 });
  }
  return points;
}

const placeholders: Record<string, { text: string; viz: Viz }> = {
  [suggestions[0]]: {
    viz: {
      kind: 'trend',
      label: 'Taksit, elokuu 2026',
      value: 84.2,
      average: 70.2,
      points: [52, 61, 96, 70, 72, 84.2].map((value, i) => ({
        label: MONTHS[i],
        title: `${LONG[i]} 2026`,
        value,
        selected: i === 5,
      })),
    },
    text: 'Käytit takseihin elokuussa 84,20 €. Se on noin 14 € enemmän kuin edeltävien kuukausien keskiarvo.',
  },
  [suggestions[1]]: {
    viz: {
      kind: 'runway',
      label: 'Vapaata rahaa palkkapäivään',
      value: 151,
      perDay: 25,
      days: 6,
      paydayLabel: 'palkka 15.9.',
      points: placeholderRunway(),
      parts: [
        { basket: 'regular', name: 'Pakolliset tulossa', value: 152 },
        { basket: 'irregular', name: 'Vara yllätyksiin', value: 6 },
        { basket: 'everyday', name: 'Vapaasti käytettävissä', value: 151 },
      ],
    },
    text: 'Palkkapäivään on kuusi päivää, ja vapaata jää noin 151 € eli 25 € päivässä.',
  },
  [suggestions[2]]: {
    viz: {
      kind: 'baskets',
      label: 'Menot keskimäärin kuukaudessa, kesä–elokuu 2026',
      value: 1530,
      parts: [
        { basket: 'regular', name: 'Pakolliset, säännölliset', value: 1008 },
        { basket: 'irregular', name: 'Pakolliset, yllättävät', value: 1 },
        { basket: 'everyday', name: 'Sormien läpi', value: 521 },
      ],
      share: 0.34,
      peerShare: 0.24,
      peerLabel: '18–29-vuotiaat',
    },
    text: 'Yli kolmannes menoistasi on arjen pieniä ostoksia. Samanikäisillä osuus on tyypillisesti noin neljännes.',
  },
  'whatif': {
    viz: { kind: 'projection', label: 'Säästö vuodessa, ravintolat ja kahvilat', value: 1339, nowMonthly: 558, afterMonthly: 446, changeLabel: '−20\u00A0%' },
    text: 'Jos vähentäisit ravintola- ja kahvilamenoja 20 %, säästäisit noin 112 € kuukaudessa eli 1 339 € vuodessa.',
  },
  'ranking': {
    viz: {
      kind: 'ranking',
      label: 'Mihin rahat menivät, heinäkuu 2026',
      value: 3064,
      rows: [
        { label: 'Ruokaostokset', value: 829, basket: 'regular' },
        { label: 'Asuminen', value: 740, basket: 'regular' },
        { label: 'Liikenne', value: 607, basket: 'regular' },
        { label: 'Ravintolat ja kahvilat', value: 583, basket: 'everyday' },
        { label: 'Viihde', value: 183, basket: 'everyday' },
        { label: 'Asumisen laskut', value: 121, basket: 'regular' },
      ],
    },
    text: 'Heinäkuussa eniten meni ruokaostoksiin ja asumiseen.',
  },
};

let nextId = 0;
/** Unique across app launches, so messages from saved conversations never share a key. */
export const newId = () => `m${Date.now().toString(36)}${++nextId}`;

/** `key` is a suggestion, or 'whatif' / 'ranking' for the other chart types. */
export function placeholderAnswer(key: string): Message {
  const hit = placeholders[key];
  if (hit) {
    return { id: newId(), role: 'assistant', text: hit.text, viz: hit.viz, example: true };
  }
  return {
    id: newId(),
    role: 'assistant',
    text: 'Tämä on asettelun esikatselu; vastauksia ei lasketa datasta.',
  };
}
