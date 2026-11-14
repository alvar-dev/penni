import { EN } from '../lang';

/** Answer text as it should be read aloud: "€1,008" -> "1,008 euros", "18%" -> "18 percent". */
export function speakable(text: string): string {
  const euros = EN ? 'euros' : 'euroa';
  const percent = EN ? 'percent' : 'prosenttia';
  return text
    .replace(/−/g, EN ? 'minus ' : 'miinus ')
    .replace(/€\s?(\d[\d,. ]*\d|\d)/g, (_, n: string) => `${n} ${euros}`)
    .replace(/(\d)[\s ]?€/g, `$1 ${euros}`)
    .replace(/(\d)[\s ]?%/g, `$1 ${percent}`)
    .replace(/\s+/g, ' ')
    .trim();
}
