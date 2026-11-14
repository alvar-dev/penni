/** Answer text as it should be read aloud (shared by the app and the server, so both make the same audio): "€1,008" -> "1,008 euros", "18%" -> "18 percent". */
export function speakable(text: string, en = true): string {
  const euros = en ? 'euros' : 'euroa';
  const percent = en ? 'percent' : 'prosenttia';
  return (en ? text.replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2') : text)
    .replace(/−/g, en ? 'minus ' : 'miinus ')
    .replace(/€\s?(\d[\d,. ]*\d|\d)/g, (_, n: string) => `${n} ${euros}`)
    .replace(/(\d)[\s ]?€/g, `$1 ${euros}`)
    .replace(/(\d)[\s ]?%/g, `$1 ${percent}`)
    .replace(/\s+/g, ' ')
    .trim();
}
