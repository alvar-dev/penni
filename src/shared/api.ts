/**
 * Types shared by the app and the server (server/). Keep this file free of
 * imports so both sides can use it: the app through Metro, the server through
 * Node's type stripping (`import type` only).
 */

export type Basket = 'regular' | 'irregular' | 'everyday';

export type BasketPart = { basket: Basket; name: string; value: number };

/**
 * What the app draws above an answer. Every number in it is computed by the
 * server's calculation engine from the customer's own transactions.
 */
export type Viz =
  | {
      /** One measure month by month, the asked-about months highlighted. */
      kind: 'trend';
      label: string;
      value: number;
      /** Average of the months shown that were not asked about, if any. */
      average?: number;
      points: { label: string; title: string; value: number; selected: boolean }[];
    }
  | {
      /** Balance so far and the expected path to payday if only necessities are paid. */
      kind: 'runway';
      label: string;
      value: number;
      perDay: number;
      days: number;
      paydayLabel: string;
      points: { label: string; title: string; balance: number; projected: boolean }[];
      parts: BasketPart[];
    }
  | {
      /** Monthly spending in the three baskets, and the everyday share against peers. */
      kind: 'baskets';
      label: string;
      value: number;
      parts: BasketPart[];
      /** Everyday basket as a share of all spending, 0..1. */
      share: number;
      peerShare: number;
      peerLabel: string;
    }
  | {
      /** Cumulative spending over a year at today's pace and after a change. */
      kind: 'projection';
      label: string;
      value: number;
      nowMonthly: number;
      afterMonthly: number;
      changeLabel: string;
    }
  | {
      /** Spending by category, largest first, coloured by basket. */
      kind: 'ranking';
      label: string;
      value: number;
      rows: { label: string; value: number; basket: Basket }[];
    };

/** One tile on the start screen; tapping it asks `question`. */
export type SummaryTile = {
  id: 'safe' | 'month' | 'everyday' | 'top';
  label: string;
  value: number;
  unit: '€' | '%';
  sub: string;
  question: string;
  /** Whether the value is good or bad news, for colour. */
  tone?: 'neutral' | 'negative';
  /** Monthly totals, oldest first, for a small sparkline. */
  spark?: number[];
  /** Your share and your peers' share (0..1), for a small comparison. */
  compare?: [number, number];
};

/** The start screen's overview of the customer's own money. Computed without the model. */
export type Summary = { tiles: SummaryTile[]; suggestions: string[] };

export type HistoryItem = { role: 'user' | 'assistant'; text: string };

export type AskRequest = {
  personaId: string;
  question: string;
  /** The last few turns, oldest first, so follow-up questions make sense. */
  history: HistoryItem[];
};

export type AskResponse = { text: string; viz?: Viz } | { error: string };
