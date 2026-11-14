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
  const r = random(customerId);
  const tx: OtherTx[] = [];
  const todayMonth = today.slice(0, 7);
  const add = (date: string, category: string, amount: number, mcc: string) => {
    if (date > today) return;
    tx.push({ date, month: date.slice(0, 7), day: Number(date.slice(8, 10)), category, amount: -round2(amount), balance: 0, mcc, bank: 'other' });
  };
  for (let month = fromMonth; month <= todayMonth; month = nextMonth(month)) {
    // Two streaming subscriptions on the card.
    add(`${month}-03`, 'Entertainment', 12.99, '4899');
    add(`${month}-18`, 'Entertainment', 9.99, '4899');
    // Online shopping now and then.
    for (let i = 0, n = 1 + Math.floor(r() * 3); i < n; i++) {
      add(`${month}-${pad(2 + Math.floor(r() * 26))}`, 'Lifestyle', 24 + r() * 65, r() < 0.6 ? '5651' : '5942');
    }
    // Food delivery.
    for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) {
      add(`${month}-${pad(1 + Math.floor(r() * 27))}`, 'Restaurants', 17 + r() * 17, '5814');
    }
  }
  add('2025-12-12', 'Travel', 164, '7011');
  add('2026-06-05', 'Travel', 286, '4511');
  tx.sort((a, b) => a.date.localeCompare(b.date));

  const tens = (v: number) => Math.round(v / 10) * 10;
  const accounts: OtherAccount[] =
    bank.kind === 'neobank'
      ? [
          { name: `${bank.name}-tili`, kind: 'current', balance: tens(monthlyIncome * 0.2) },
          { name: 'Säästöholvi', kind: 'savings', balance: tens(monthlyIncome * 0.35), ratePct: 2 },
        ]
      : [
          { name: 'Säästötili', kind: 'savings', balance: tens(monthlyIncome * 0.55), ratePct: 1.25 },
          { name: 'Luottokortti', kind: 'credit', balance: -tens(monthlyIncome * 0.39), ratePct: 15.9, limit: 3000 },
        ];
  return { id: bank.id, name: bank.name, inessive: bank.inessive, accounts, tx };
}
