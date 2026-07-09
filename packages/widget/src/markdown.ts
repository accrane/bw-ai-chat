/**
 * Minimal markdown → HTML for assistant messages. Security model: the source
 * is HTML-escaped FIRST, then a small set of markdown transforms produce the
 * only tags that can exist (pre/code/strong/em/a/ul/li/p/br). Links render
 * only for http(s) URLs, always with rel="noopener noreferrer".
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMarkdown(source: string): string {
  // \x00 sentinels cannot collide with real content (control chars never
  // appear in escaped text) — plain-number placeholders would clash with
  // ordinary numbers in the message.
  const stash: string[] = [];
  const keep = (html: string): string => `\x00${stash.push(html) - 1}\x00`;

  let text = escapeHtml(source.trim()).replace(/\x00/g, '');

  // fenced code blocks, protected from all later transforms
  text = text.replace(/```[a-z]*\n?([\s\S]*?)```/g, (_, code: string) =>
    keep(`<pre><code>${code.replace(/\n$/, '')}</code></pre>`),
  );
  text = text.replace(/`([^`\n]+)`/g, (_, code: string) => keep(`<code>${code}</code>`));

  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|\s)\*([^*\n]+)\*/g, '$1<em>$2</em>');

  // [label](https://…) — escaped quotes make the href attribute-safe
  text = text.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  // group consecutive "- " lines into lists, paragraphs elsewhere
  const blocks = text.split(/\n{2,}/).map((block) => {
    const lines = block.split('\n');
    if (lines.every((l) => /^\s*-\s+/.test(l))) {
      const items = lines.map((l) => `<li>${l.replace(/^\s*-\s+/, '')}</li>`).join('');
      return `<ul>${items}</ul>`;
    }
    if (/^\x00\d+\x00$/.test(block.trim())) return block.trim(); // bare code block
    return `<p>${lines.join('<br>')}</p>`;
  });

  return blocks.join('').replace(/\x00(\d+)\x00/g, (_, i: string) => stash[Number(i)] ?? '');
}
