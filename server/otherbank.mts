import type { OtherBankInfo } from '../src/shared/banks.ts';

/**
 * A second bank, connected under PSD2 (account information). The challenge
 * data has only S-Pankki accounts, so this is clearly-labelled example data,
 * generated the same way for a customer every time: for a bank, a savings
 * account and a credit card with a revolving balance; for Revolut, an account
 * and a savings vault. Either way, the purchases made with that bank's card.
 */

export type OtherTx = { date: string; month: string; day: number; category: string; amount: number; balance: number; mcc: string; bank: 'other' };
export type OtherAccount = { name: string; kind: 'current' | 'savings' | 'credit'; balance: number; ratePct?: number; limit?: number };
export type OtherBank = { id: string; name: string; inessive: string; accounts: OtherAccount[]; tx: OtherTx[] };

/** Small deterministic random numbers (mulberry32), seeded from the customer id. */
function random(seed: string): () => number {
  let a = [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 1779033703);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');
const round2 = (v: number) => Math.round(v * 100) / 100;
function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

export function buildOtherBank(customerId: string, bank: OtherBankInfo, fromMonth: string, today: string, monthlyIncome: number): OtherBank {
  // Seeded per customer and bank, so two connected banks never show the same purchases.
  const r = random(`${customerId}|${bank.id}`);
  const tx: OtherTx[] = [];
  const todayMonth = today.slice(0, 7);
  const add = (date: string, category: string, amount: number, mcc: string) => {
    if (date > today) return;
    tx.push({ date, month: date.slice(0, 7), day: Number(date.slice(8, 10)), category, amount: -round2(amount), balance: 0, mcc, bank: 'other' });
  };
  const neobank = bank.kind === 'neobank';
  const subscriptions = neobank ? [] : [[12.99, 9.99], [14.99], [7.99, 11.99], [9.99]][Math.floor(r() * 4)];
  for (let month = fromMonth; month <= todayMonth; month = nextMonth(month)) {
    // A bank's card carries subscriptions and some shopping; Revolut's also food delivery.
    subscriptions.forEach((amount, i) => add(`${month}-${pad(3 + i * 12)}`, 'Entertainment', amount, '4899'));
    for (let i = 0, n = (neobank ? 1 : 0) + Math.floor(r() * 3); i < n; i++) {
      add(`${month}-${pad(2 + Math.floor(r() * 26))}`, 'Lifestyle', 24 + r() * 65, r() < 0.6 ? '5651' : '5942');
    }
    if (neobank) {
      for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) {
        add(`${month}-${pad(1 + Math.floor(r() * 27))}`, 'Restaurants', 17 + r() * 17, '5814');
      }
    }
  }
  if (neobank) {
    add('2025-12-12', 'Travel', 164, '7011');
    add('2026-06-05', 'Travel', 286, '4511');
  }
  tx.sort((a, b) => a.date.localeCompare(b.date));

  const tens = (v: number) => Math.round(v / 10) * 10;
  const accounts: OtherAccount[] = neobank
    ? [
        { name: `${bank.name}-tili`, kind: 'current', balance: tens(monthlyIncome * (0.15 + 0.1 * r())) },
        { name: 'Säästöholvi', kind: 'savings', balance: tens(monthlyIncome * (0.25 + 0.2 * r())), ratePct: 2 },
      ]
    : [
        { name: 'Säästötili', kind: 'savings', balance: tens(monthlyIncome * (0.4 + 0.3 * r())), ratePct: 1.25 },
        {
          name: 'Luottokortti',
          kind: 'credit',
          balance: -tens(monthlyIncome * (0.25 + 0.2 * r())),
          ratePct: [14.9, 15.9, 16.9, 17.9, 19.9][Math.floor(r() * 5)],
          limit: [2000, 3000, 5000][Math.floor(r() * 3)],
        },
      ];
  return { id: bank.id, name: bank.name, inessive: bank.inessive, accounts, tx };
}
