import type { Viz } from './shared/api';

export type { Viz };

export type Message =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string; viz?: Viz; example?: boolean };

export type Persona = { id: string; name: string; age: number; postalCode: string; tagline: string };

/**
 * Customers from the synthetic challenge dataset (5,100 in all) chosen to show
 * different situations. The app is signed in as the first one; the others are
 * reachable only through the development link ?persona=<id>. The id, age and
 * postal code come from the data; the dataset has no names, so these are made up.
 */
export const personas: Persona[] = [
  { id: 'CUST04376', name: 'Aino', age: 27, postalCode: '01800', tagline: 'Low income, lots of eating out' },
  { id: 'CUST04925', name: 'Mikael', age: 45, postalCode: '02680', tagline: 'Good income, still sometimes overdrawn' },
  { id: 'CUST00332', name: 'Laura', age: 39, postalCode: '01400', tagline: 'Saves every month' },
  { id: 'CUST04075', name: 'Marja', age: 59, postalCode: '00730', tagline: 'Many unexpected costs' },
  { id: 'CUST00084', name: 'Eila', age: 72, postalCode: '00150', tagline: 'Pensioner on a tight budget' },
  { id: 'CUST03667', name: 'Petri', age: 45, postalCode: '00430', tagline: 'Salary moves on to another bank' },
];

export const strings = {
  heroTitle: 'Ask about your money',
  greeting: 'Hi',
  heroHint: 'Tap the orb and ask about your money.',
  listeningTitle: 'Listening',
  listeningHint: 'Ask, then pause for a moment.',
  transcribingInline: 'Recognising speech…',
  transcribingTitle: 'One moment',
  transcribingHint: 'Turning speech into text.',
  noSpeech: "I didn't hear anything",
  notUnderstood: "I couldn't make that out",
  speechUnavailable: "Speech recognition isn't available right now",
  retry: 'Try again',
  micDenied: 'Microphone access is blocked. Allow it in your phone settings.',
  micError: "The microphone didn't start.",
  inputPlaceholder: 'Ask a question',
  thinking: 'Calculating…',
  exampleTag: 'Example data',
  orbStart: 'Ask by voice',
  orbStop: 'Stop listening',
  send: 'Send',
  menuOpen: 'Open menu',
  menuClose: 'Close menu',
  newChat: 'New conversation',
  historyTitle: 'Conversations',
  historyEmpty: 'Your conversations will appear here.',
  noAnswer: 'No answer',
  deleteTitle: 'Delete conversation?',
  deleteHint: 'Long press to delete the conversation.',
  delete: 'Delete',
  cancel: 'Cancel',
  errorNetwork: "I couldn't reach the coach. Check that the server is running and try again.",
  errorBusy: 'Too many questions just now. Wait a moment and ask again.',
  errorModel: "The coach didn't answer in time. Please try again.",
};

export const suggestions = [
  'How much did I spend on taxis last month?',
  'How much can I spend this week?',
  'What kind of spender am I?',
];

/*
 * PLACEHOLDER ANSWERS, used only by the development preview links in App.tsx
 * (?preview=chat etc.) so layouts can be checked without calling the model.
 * Nothing here is computed from the data; each is tagged "Example data".
 * Real answers come from the server (src/api.ts).
 */
const MONTHS = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
const LONG = ['March', 'April', 'May', 'June', 'July', 'August'];

function placeholderRunway(): Extract<Viz, { kind: 'runway' }>['points'] {
  const points: Extract<Viz, { kind: 'runway' }>['points'] = [];
  for (let i = 0; i < 27; i++) {
    const day = new Date(Date.UTC(2026, 7, 20 + i));
    const label = `${day.getUTCMonth() === 7 ? 'Aug' : 'Sep'} ${day.getUTCDate()}`;
    const balance = i <= 20 ? Math.round(1180 - i * 43 + 30 * Math.sin(i * 1.7)) : Math.round(309 - (i - 20) * 26.3);
    points.push({ label, title: label, balance, projected: i > 20 });
  }
  return points;
}

const placeholders: Record<string, { text: string; viz: Viz }> = {
  [suggestions[0]]: {
    viz: {
      kind: 'trend',
      label: 'Taxis, August 2026',
      value: 84.2,
      average: 70.2,
      points: [52, 61, 96, 70, 72, 84.2].map((value, i) => ({
        label: MONTHS[i],
        title: `${LONG[i]} 2026`,
        value,
        selected: i === 5,
      })),
    },
    text: 'You spent €84.20 on taxis in August. That is about €14 more than your average for the months before.',
  },
  [suggestions[1]]: {
    viz: {
      kind: 'runway',
      label: 'Free to spend until payday',
      value: 151,
      perDay: 25,
      days: 6,
      paydayLabel: 'payday Sep 15',
      points: placeholderRunway(),
      parts: [
        { basket: 'regular', name: 'Essentials still due', value: 152 },
        { basket: 'irregular', name: 'Cushion for surprises', value: 6 },
        { basket: 'everyday', name: 'Free to spend', value: 151 },
      ],
    },
    text: 'Payday is six days away, and about €151 is free to spend, roughly €25 a day.',
  },
  [suggestions[2]]: {
    viz: {
      kind: 'baskets',
      label: 'Average monthly spending, Jun–Aug 2026',
      value: 1530,
      parts: [
        { basket: 'regular', name: 'Essentials, regular', value: 1008 },
        { basket: 'irregular', name: 'Essentials, irregular', value: 1 },
        { basket: 'everyday', name: 'Slips through', value: 521 },
      ],
      share: 0.34,
      peerShare: 0.24,
      peerLabel: 'Ages 18–29',
    },
    text: 'More than a third of your spending is small everyday purchases. For people your age it is typically about a quarter.',
  },
  'whatif': {
    viz: { kind: 'projection', label: 'Yearly saving, restaurants and cafés', value: 1339, nowMonthly: 558, afterMonthly: 446, changeLabel: '−20%' },
    text: 'If you cut restaurants and cafés by 20%, you would save about €112 a month, or €1,339 a year.',
  },
  'ranking': {
    viz: {
      kind: 'ranking',
      label: 'Where your money went, July 2026',
      value: 3064,
      rows: [
        { label: 'Groceries', value: 829, basket: 'regular' },
        { label: 'Housing', value: 740, basket: 'regular' },
        { label: 'Transport', value: 607, basket: 'regular' },
        { label: 'Restaurants and cafés', value: 583, basket: 'everyday' },
        { label: 'Entertainment', value: 183, basket: 'everyday' },
        { label: 'Utility bills', value: 121, basket: 'regular' },
      ],
    },
    text: 'In July most of your money went on groceries and housing.',
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
    text: 'This is a layout preview; answers here are not computed from the data.',
  };
}
