import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.js';

describe('renderMarkdown security', () => {
  it('escapes raw HTML from the model', () => {
    const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('refuses non-http(s) link schemes', () => {
    const html = renderMarkdown('[click](javascript:alert(1)) and [ok](https://a.com)');
    expect(html).not.toContain('href="javascript');
    expect(html).toContain('<a href="https://a.com"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('neutralizes quote breakouts in link URLs', () => {
    const html = renderMarkdown('[x](https://a.com/"onmouseover="alert(1))');
    expect(html).not.toContain('"onmouseover');
  });

  it('strips raw NUL sentinels from input', () => {
    expect(renderMarkdown('a\x000\x00b')).toBe('<p>a0b</p>');
  });
});

describe('renderMarkdown formatting', () => {
  it('renders paragraphs, breaks, bold, italics, and inline code', () => {
    const html = renderMarkdown('**Bold** and *soft* with `code`\nnext line\n\nnew para');
    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<em>soft</em>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<br>');
    expect(html).toContain('<p>new para</p>');
  });

  it('renders fenced code blocks untouched by other transforms', () => {
    const html = renderMarkdown('```js\nconst a = "**hi**";\n```');
    expect(html).toContain('<pre><code>const a = &quot;**hi**&quot;;</code></pre>');
  });

  it('renders bullet lists', () => {
    const html = renderMarkdown('- one\n- two');
    expect(html).toBe('<ul><li>one</li><li>two</li></ul>');
  });

  it('keeps ordinary numbers intact', () => {
    expect(renderMarkdown('Trips cost 89 dollars, or 149 for `full` day 5 .')).toContain(
      'cost 89 dollars, or 149 for',
    );
  });
});
