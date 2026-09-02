import type { ReactNode } from 'react';

const SAFE_URL = /^https?:\/\//i;
const REPO = /\b([A-Za-z0-9][\w.-]{0,38})\/([\w.-]{1,100})\b/;
const MENTION = /(^|[\s(])@([A-Za-z0-9][A-Za-z0-9-]{0,38})\b/;
const BARE_URL = /https?:\/\/[^\s<>"')]+/;
const MD_LINK = /\[([^\]]{1,120})\]\((https?:\/\/[^\s)]+)\)/;
const BOLD = /\*\*([^*]{1,200})\*\*/;
const ITALIC = /(^|[^*])\*([^*]{1,200})\*/;
const CODE = /`([^`]{1,200})`/;

interface Rule {
  test: RegExp;
  render: (m: RegExpExecArray, key: string) => { node: ReactNode; before: string; after: string };
}

const link = (href: string, text: string, key: string) => (
  <a
    key={key}
    href={href}
    target={SAFE_URL.test(href) ? '_blank' : undefined}
    rel={SAFE_URL.test(href) ? 'noopener noreferrer' : undefined}
    className="text-[var(--color-link)] hover:underline"
  >
    {text}
  </a>
);

const RULES: Rule[] = [
  {
    test: CODE,
    render: (m, key) => ({
      node: (
        <code
          key={key}
          className="rounded bg-[var(--color-sunken)] px-1.5 py-0.5 font-mono text-[0.92em] text-[var(--color-text)]"
        >
          {m[1]}
        </code>
      ),
      before: m.input.slice(0, m.index),
      after: m.input.slice(m.index + m[0].length),
    }),
  },
  {
    test: MD_LINK,
    render: (m, key) => ({
      node: link(m[2], m[1], key),
      before: m.input.slice(0, m.index),
      after: m.input.slice(m.index + m[0].length),
    }),
  },
  {
    test: BOLD,
    render: (m, key) => ({
      node: (
        <strong key={key} className="font-semibold text-[var(--color-text)]">
          {m[1]}
        </strong>
      ),
      before: m.input.slice(0, m.index),
      after: m.input.slice(m.index + m[0].length),
    }),
  },
  {
    test: ITALIC,
    render: (m, key) => ({
      node: <em key={key}>{m[2]}</em>,
      before: m.input.slice(0, m.index) + m[1],
      after: m.input.slice(m.index + m[0].length),
    }),
  },
  {
    test: BARE_URL,
    render: (m, key) => {
      const href = m[0].replace(/[.,;:]$/, '');
      const shown = href.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48);
      return {
        node: link(href, shown, key),
        before: m.input.slice(0, m.index),
        after: m.input.slice(m.index + href.length),
      };
    },
  },
  {
    test: MENTION,
    render: (m, key) => ({
      node: (
        <span key={key}>
          {m[1]}
          {link(`/app/people/${m[2]}/`, `@${m[2]}`, `${key}-a`)}
        </span>
      ),
      before: m.input.slice(0, m.index),
      after: m.input.slice(m.index + m[0].length),
    }),
  },
  {
    test: REPO,
    render: (m, key) => ({
      node: link(`/app/r/${m[1]}/${m[2]}/`, `${m[1]}/${m[2]}`, key),
      before: m.input.slice(0, m.index),
      after: m.input.slice(m.index + m[0].length),
    }),
  },
];

function inline(text: string, keyBase: string): ReactNode[] {
  if (!text) return [];
  let earliest: { rule: Rule; match: RegExpExecArray } | null = null;

  for (const rule of RULES) {
    const match = rule.test.exec(text);
    if (!match) continue;
    const at = rule.test === ITALIC ? match.index + match[1].length : match.index;
    const bestAt =
      earliest === null
        ? Infinity
        : earliest.rule.test === ITALIC
          ? earliest.match.index + earliest.match[1].length
          : earliest.match.index;
    if (at < bestAt) earliest = { rule, match };
  }

  if (!earliest) return [text];

  const { node, before, after } = earliest.rule.render(earliest.match, `${keyBase}-n`);
  return [...inline(before, `${keyBase}b`), node, ...inline(after, `${keyBase}a`)];
}

export function RichText({ body }: { body: string }) {
  const blocks: ReactNode[] = [];
  const lines = body.split('\n');
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trimStart().startsWith('```')) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(
        <pre
          key={`k${key++}`}
          className="my-2.5 overflow-x-auto rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-sunken)] p-3 font-mono text-xs leading-relaxed"
        >
          {code.join('\n')}
        </pre>,
      );
      continue;
    }

    if (line.trimStart().startsWith('> ')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('> ')) {
        quote.push(lines[i].trimStart().slice(2));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={`k${key++}`}
          className="my-2.5 border-l-2 border-[var(--color-line-strong)] pl-3 text-[var(--color-muted)]"
        >
          {inline(quote.join(' '), `q${key}`)}
        </blockquote>,
      );
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`k${key++}`} className="my-2 list-disc space-y-1 pl-5">
          {items.map((item, n) => (
            <li key={n}>{inline(item, `l${key}-${n}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !lines[i].trimStart().startsWith('> ') &&
      !/^\s*[-*]\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    if (para.length > 0) {
      blocks.push(
        <p key={`k${key++}`} className="whitespace-pre-wrap">
          {inline(para.join('\n'), `p${key}`)}
        </p>,
      );
    } else {
      i += 1;
    }
  }

  return <div className="space-y-1 text-base text-[var(--color-text)]">{blocks}</div>;
}
