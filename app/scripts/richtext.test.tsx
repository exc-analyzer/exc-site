import { renderToStaticMarkup } from 'react-dom/server';
import { RichText } from '../src/lib/richText';

const CASES: [string, string, string[]][] = [
  ['bold', 'this is **strong** text', ['<strong', 'strong</strong>']],
  ['italic', 'this is *slanted* text', ['<em>slanted</em>']],
  ['inline code', 'run `npm test` now', ['<code', 'npm test']],
  ['code block', '```\nconst a = 1;\n```', ['<pre', 'const a = 1;']],
  ['quote', '> be careful here', ['<blockquote', 'be careful here']],
  ['list', '- one\n- two', ['<ul', '<li>one</li>', '<li>two</li>']],
  ['bare url', 'see https://example.com/x for more', ['href="https://example.com/x"']],
  ['markdown link', 'see [the docs](https://example.com) here', ['href="https://example.com"', 'the docs']],
  ['mention', 'ask @torvalds about it', ['href="https://github.com/torvalds"', '@torvalds']],
  ['repo link', 'look at exc-analyzer/exc today', ['href="/app/r/exc-analyzer/exc/"']],
  ['plain', 'nothing special here', ['nothing special here']],
];

const INJECTION = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '[click](javascript:alert(1))',
  '[click](data:text/html,<script>alert(1)</script>)',
  '<a href="javascript:alert(1)">x</a>',
  'javascript:alert(1)',
  '**bold** <svg onload=alert(1)>',
];

const ALLOWED = new Set(['div', 'p', 'a', 'strong', 'em', 'code', 'pre', 'ul', 'li', 'blockquote', 'span']);

function unsafeTags(html: string): string[] {
  const bad: string[] = [];
  for (const tag of html.match(/<[^>]+>/g) ?? []) {
    const name = /^<\/?([a-z0-9]+)/i.exec(tag)?.[1]?.toLowerCase();
    if (!name || !ALLOWED.has(name)) bad.push(`unexpected element ${tag}`);
    if (/\son[a-z]+=/i.test(tag)) bad.push(`event handler attribute ${tag}`);
    const href = /href="([^"]*)"/i.exec(tag)?.[1];
    if (href !== undefined && !/^(https?:\/\/|\/app\/)/.test(href)) bad.push(`unsafe href ${href}`);
  }
  return bad;
}

let bad = 0;
for (const [name, input, expects] of CASES) {
  const html = renderToStaticMarkup(<RichText body={input} />);
  for (const want of expects) {
    if (!html.includes(want)) {
      bad += 1;
      console.log(`  FAIL  ${name}: "${want}" missing -> ${html.slice(0, 140)}`);
    }
  }
}

for (const input of INJECTION) {
  const html = renderToStaticMarkup(<RichText body={input} />);
  for (const problem of unsafeTags(html)) {
    bad += 1;
    console.log(`  UNSAFE  ${problem}`);
  }
}

console.log(
  bad === 0
    ? `${CASES.length} formatting and ${INJECTION.length} injection cases behaved as expected.`
    : `${bad} rich text cases behaved wrongly.`,
);
if (bad > 0) process.exit(1);
