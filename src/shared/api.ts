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
      /** The same month-by-month measure as columns. */
      kind: 'columns';
      label: string;
      value: number;
      average?: number;
      bars: { label: string; title: string; value: number; selected: boolean }[];
    }
  | {
      /** Shares of a whole (spending by category) as a ring. */
      kind: 'donut';
      label: string;
      value: number;
      slices: { label: string; value: number }[];
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
      /** Under the comparison bar, e.g. its source. */
      peerNote?: string;
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
      /** The balance as it went, and as it would have gone with a surprise fund. */
      kind: 'replay';
      label: string;
      /** The monthly amount to set aside. */
      value: number;
      points: { label: string; title: string; actual: number; withFund: number }[];
      /** Where the surprise that hurt most happened. */
      event: { index: number; label: string };
      overdrawnDays: { actual: number; withFund: number };
      paydayLabel: string;
    }
  | {
      /** Accounts in every connected bank; S-Pankki only until another bank is connected. */
      kind: 'accounts';
      label: string;
      value: number;
      banks: { id?: string; name: string; accounts: { name: string; balance: number; note?: string }[] }[];
      /** No other bank connected yet: the card offers to connect one. */
      connectable: boolean;
      footnote?: string;
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

/** Something the coach notices on its own, shown under the greeting. */
/**
 * The coach's own observation on the start screen: `title` is the one line shown
 * under the greeting (advice with its value), `text` the longer version, and
 * `question` what tapping it asks.
 */
export type Insight = { kind: 'surprise' | 'banks'; title: string; text: string; question: string; action: string };

/** A surprise-fund plan the customer can switch on from the coach's suggestion. */
export type PlanSuggestion = { monthly: number; nextPayday: string };

/** The start screen's overview of the customer's own money. Computed without the model. */
export type Summary = { tiles: SummaryTile[]; suggestions: string[]; insight?: Insight; plan?: PlanSuggestion };

/** The calculation behind an answer's chart, so a follow-up can redraw it differently. */
export type ToolCall = { name: string; args: Record<string, unknown> };

export type HistoryItem = { role: 'user' | 'assistant'; text: string; call?: ToolCall };

export type AskRequest = {
  personaId: string;
  question: string;
  /** The last few turns, oldest first, so follow-up questions make sense. */
  history: HistoryItem[];
  /** Other banks connected under PSD2 (ids from shared/banks.ts), so the coach sees their accounts too. */
  banks?: string[];
  /** The app will read the answer with the server's voice: prepare its first sentence before answering. */
  serverVoice?: boolean;
};

export type AskResponse = { text: string; viz?: Viz; call?: ToolCall; sources?: string[] } | { error: string };
