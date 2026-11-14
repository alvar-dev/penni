/**
 * The conversation with the model (Featherless, OpenAI-compatible API).
 *
 *   1. The model reads the question and calls one calculation tool.
 *   2. The engine runs it on the customer's own transactions.
 *   3. The model words a short answer from the tool's facts only.
 *
 * The model never sees individual transactions, only the computed facts.
 */
import type { HistoryItem, ToolCall, Viz } from '../src/shared/api.ts';
import { runTool, TODAY, TOOLS, type Persona } from './engine.mts';

const API_URL = 'https://api.featherless.ai/v1/chat/completions';
const KEY = process.env.FEATHERLESS_API_KEY ?? '';
export const MODEL = process.env.FEATHERLESS_MODEL ?? 'moonshotai/Kimi-K3';

/** USD per million tokens, from Featherless's model list on 2026-11-14. */
const PRICES: Record<string, { input: number; output: number }> = {
  'moonshotai/Kimi-K3': { input: 3, output: 15 },
  'zai-org/GLM-5.3': { input: 1.4, output: 4.4 },
  'deepseek-ai/DeepSeek-V4.1-Flash': { input: 0.3, output: 1.2 },
};

type Message = Record<string, unknown> & { role: string };
type Usage = { prompt_tokens?: number; completion_tokens?: number };
type Completion = {
  choices: { message: { content?: string | null; reasoning_content?: string; tool_calls?: ModelToolCall[] }; finish_reason?: string }[];
  usage?: Usage;
};
type ModelToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };

export type Answer = {
  text: string;
  viz?: Viz;
  tool?: string;
  call?: ToolCall;
  usage: { input: number; output: number; usd: number | null };
};

function systemPrompt(p: Persona): string {
  const [y, m, d] = TODAY.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  return `You are the money coach inside S-mobiili, S-Pankki's mobile app. You help one customer understand their own spending and build healthier money habits.

Today is ${weekday} ${TODAY}. The customer is ${p.age} years old and lives in postal code ${p.postalCode}. You can see their S-Pankki account transactions from October 2024 up to today.

Spending falls into three baskets:
1. mandatory and regular: housing, utility bills, groceries, transport
2. mandatory but irregular: health, home and tech (a broken washing machine)
3. everyday spending that slips through your fingers: restaurants and cafés, entertainment, shopping and hobbies, travel, taxis

How to work:
- For any question about the customer's own money, call exactly one tool. Never compute, estimate or invent numbers yourself, and never say you are showing a chart or a view unless a tool in this turn produced it.
- Requests to draw, show or change a chart ("piirrä toisenlainen kaavio", "näytä pylväinä", "piirakkana") are questions about their money: call the same tool as for the chart shown before, with the other chart option (spending_total: chart columns or line; top_categories: chart donut or bars). Earlier assistant turns end with a note of the chart that was shown.
- "Last month" is ${TODAY.slice(0, 4)}-${String(m - 1).padStart(2, '0')}. "This year" is ${y}-01 to ${TODAY.slice(0, 7)}. If no period is given for a total, use the last full month.
- The data has categories and merchant types but no merchant names, so it cannot show single subscriptions (such as Netflix), single shops or accounts in other banks. If asked about those, use the closest tool if it helps and say plainly what the data cannot show.
- If the question is not about the customer's money, answer briefly without a tool and steer back to their spending.
- For unexpected costs, emergencies, a buffer, saving for surprises or "why was I overdrawn", use surprise_fund.

How to answer, once you have a tool result:
- Reply in Finnish, unless the customer clearly wrote in another language.
- Two or three short sentences, at most 55 words, in plain everyday language. No markdown, no lists, no headings, and no dashes (— or –) between clauses: use a comma or a full stop instead.
- Use only numbers that appear in the tool result. Round to whole euros unless the amount is under 10 €. Write amounts the Finnish way: 84 €, 1 234 €, 84,20 €.
- A chart above your text already shows the numbers, so pick the one or two that matter instead of repeating them all.
- You are a coach, not only a calculator. When the numbers show a pattern (surprises causing overdrafts, everyday spending well above people their age, a month far from usual), name it in plain words and end with one concrete, friendly next step that uses their own numbers. Never shame or lecture.
- After a surprise_fund result, explain that big irregular costs feel random one by one but add up to a predictable amount, and suggest setting aside the suggested amount every payday, paid for by spending that much less on everyday extras. The app shows a button under your answer to start that plan, so you can invite them to start it.
- If the tool result contains pass_through: true, say that their salary moves on to another bank, so you see only part of their spending.
- If the tool result contains an error, explain briefly what you could not look up.`;
}

async function complete(body: Record<string, unknown>): Promise<Completion> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, ...body }),
      signal: AbortSignal.timeout(60_000),
    });
    if (response.ok) return (await response.json()) as Completion;
    const detail = (await response.text()).slice(0, 300);
    // One retry for capacity errors only; anything else is a bug worth seeing.
    if (attempt === 0 && [429, 502, 503].includes(response.status)) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }
    throw new Error(`Featherless ${response.status}: ${detail}`);
  }
}

/**
 * No dashes between clauses: a spaced dash (or any em dash) becomes a comma.
 * Ranges written without spaces, like "kesä–elokuu", are left alone.
 */
export function tidy(text: string): string {
  return text
    .replace(/\s+[—–-]\s+/g, ', ')
    .replace(/\s*—\s*/g, ', ')
    .replace(/,\s*,/g, ',')
    .trim();
}

function clean(text: string | null | undefined): string {
  return tidy(
    (text ?? '')
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/\[(Näytetty|Edellinen) kaavio[^\]]*\]/g, '')
      .replace(/\*\*|__|`/g, '')
      .replace(/^\s*[-*•]\s+/gm, ''),
  );
}

export async function askModel(p: Persona, question: string, history: HistoryItem[]): Promise<Answer> {
  if (!KEY) throw new Error('FEATHERLESS_API_KEY is missing from .env.local');

  // Which chart the latest answer showed, as a note for the model (not part of
  // any message text, so it is not copied into answers).
  const lastCall = [...history].reverse().find((h) => h.role === 'assistant' && h.call)?.call;
  const messages: Message[] = [
    { role: 'system', content: systemPrompt(p) },
    ...history.map((h) => ({ role: h.role, content: h.text })),
    ...(lastCall
      ? [{ role: 'system', content: `The previous answer's chart came from ${lastCall.name} with arguments ${JSON.stringify(lastCall.args)}.` }]
      : []),
    { role: 'user', content: question },
  ];
  const usage = { input: 0, output: 0 };
  const count = (u?: Usage) => {
    usage.input += u?.prompt_tokens ?? 0;
    usage.output += u?.completion_tokens ?? 0;
  };
  const price = PRICES[MODEL];
  const finish = (text: string, viz?: Viz, tool?: string): Answer => ({
    text,
    viz,
    tool,
    usage: { ...usage, usd: price ? (usage.input * price.input + usage.output * price.output) / 1e6 : null },
  });

  // 1. Pick a calculation.
  let first = await complete({ messages, tools: TOOLS, tool_choice: 'auto', max_tokens: 2000, temperature: 0.3 });
  count(first.usage);
  let choice = first.choices[0];
  let call = choice.message.tool_calls?.[0];

  // Guard: an answer with numbers (or a chart request) must come from a tool.
  // If the model skipped the tool, ask again and insist; never pass on numbers
  // it made up.
  const wantsChart = /kaavio|kuvaaja|graafi|piirr|näytä|chart|graph|plot|draw|show/i.test(question);
  if (!call && (/\d/.test(clean(choice.message.content)) || wantsChart)) {
    const insist: Message = {
      role: 'system',
      content:
        'You answered without a tool. Every number and every chart must come from a tool in this turn. Call the one tool that answers the question (for "another chart", call the same tool as before with a different chart option).',
    };
    first = await complete({ messages: [...messages, insist], tools: TOOLS, tool_choice: 'auto', max_tokens: 2000, temperature: 0.2 });
    count(first.usage);
    choice = first.choices[0];
    call = choice.message.tool_calls?.[0];
    // Still no tool for a chart request: redraw the previous chart the other way.
    const other = lastCall && wantsChart ? otherChart(lastCall) : null;
    if (!call && other) {
      call = { id: 'switch-chart', type: 'function', function: { name: other.name, arguments: JSON.stringify(other.args) } };
      choice = { ...choice, message: { ...choice.message, content: '', tool_calls: [call] } };
    }
    if (!call) return finish(NO_TOOL_ANSWER);
  }
  if (!call) {
    const text = clean(choice.message.content);
    if (!text) throw new Error(`Model returned neither a tool call nor text (finish: ${choice.finish_reason})`);
    return finish(text);
  }

  // 2. Run it.
  let args: Record<string, unknown> = {};
  try {
    args = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
  } catch {
    args = {};
  }
  const result = runTool(p, call.function.name, args);

  // 3. Word the answer from the facts.
  const assistantTurn: Message = { role: 'assistant', content: choice.message.content ?? '', tool_calls: [call] };
  if (choice.message.reasoning_content) assistantTurn.reasoning_content = choice.message.reasoning_content;
  const followUp = [...messages, assistantTurn, { role: 'tool', tool_call_id: call.id, content: JSON.stringify(result.facts) }];
  // The model thinks before it writes, and the thinking counts towards
  // max_tokens, so leave plenty of room; only generated tokens are billed.
  const second = await complete({ messages: followUp, tools: TOOLS, tool_choice: 'none', max_tokens: 1800, temperature: 0.5 });
  count(second.usage);
  let text = clean(second.choices[0].message.content);
  if (second.choices[0].finish_reason === 'length') text = lastFullSentence(text);
  if (!text) throw new Error(`Model returned no answer text (finish: ${second.choices[0].finish_reason})`);
  const ok = !('error' in result.facts);
  return {
    ...finish(text, ok ? result.viz : undefined, call.function.name),
    call: ok && result.viz ? { name: call.function.name, args } : undefined,
  };
}

/** The same calculation drawn the other way, for tools that have two charts. */
function otherChart(previous: ToolCall): ToolCall | null {
  const chart = previous.args.chart;
  if (previous.name === 'spending_total') return { name: previous.name, args: { ...previous.args, chart: chart === 'columns' ? 'line' : 'columns' } };
  if (previous.name === 'top_categories') return { name: previous.name, args: { ...previous.args, chart: chart === 'donut' ? 'bars' : 'donut' } };
  return null;
}

/** Shown instead of an answer whose numbers did not come from the data. */
const NO_TOOL_ANSWER = 'En osannut laskea tähän vastausta tiedoistasi. Kokeile kysyä tarkemmin, esimerkiksi mistä kuukaudesta tai mistä menoista on kyse.';

/** A cut-off answer is shown up to its last complete sentence, never mid-word. */
function lastFullSentence(text: string): string {
  const end = Math.max(text.lastIndexOf('. '), text.lastIndexOf('! '), text.lastIndexOf('? '));
  if (/[.!?]$/.test(text)) return text;
  return end > 0 ? text.slice(0, end + 1) : '';
}
