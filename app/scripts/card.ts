import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const BROWSER_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean) as string[];

async function findBrowser(): Promise<string> {
  for (const candidate of BROWSER_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error(
    `No Chrome or Edge binary found. Looked at:\n  ${BROWSER_CANDIDATES.join('\n  ')}\nSet CHROME_PATH to override.`,
  );
}

export interface CardFact {
  text: string;
  missing?: boolean;
}

export interface CardData {
  label: string;
  score: number | null;
  headline: string;
  facts: CardFact[];
  url: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scoreColor(score: number): string {
  if (score >= 90) return '#34d399';
  if (score >= 75) return '#fbbf24';
  if (score >= 50) return '#fb923c';
  return '#f87171';
}

export function cardHtml(data: CardData, logo: string): string {
  const accent = data.score === null ? '#818cf8' : scoreColor(data.score);
  const scoreBlock =
    data.score === null
      ? ''
      : `<div class="score"><span class="value" style="color:${accent}">${data.score}</span><span class="max">/100</span></div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&family=Fira+Code:wght@500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${CARD_WIDTH}px;
    height: ${CARD_HEIGHT}px;
    background: #0a0912;
    color: #f4f4f7;
    font-family: Inter, system-ui, sans-serif;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 64px 72px;
    position: relative;
    overflow: hidden;
  }
  body::before {
    content: '';
    position: absolute;
    inset: -40% 30% 40% -10%;
    background: radial-gradient(circle at 30% 30%, rgba(130,83,234,0.30), transparent 62%);
  }
  body::after {
    content: '';
    position: absolute;
    inset: 45% -15% -45% 45%;
    background: radial-gradient(circle at 70% 70%, rgba(225,71,135,0.18), transparent 60%);
  }
  .layer { position: relative; z-index: 1; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .mark { width: 52px; height: 52px; display: block; }
  .brand span { font-size: 22px; font-weight: 600; letter-spacing: 0.01em; }
  .middle { display: flex; align-items: flex-end; justify-content: space-between; gap: 48px; }
  .repo {
    font-family: 'Fira Code', ui-monospace, monospace;
    font-size: 54px; font-weight: 500; letter-spacing: -0.02em;
    line-height: 1.12; word-break: break-word;
  }
  .headline { margin-top: 22px; font-size: 30px; font-weight: 600; line-height: 1.25; color: #e8e8ef; }
  .facts { margin-top: 20px; display: flex; flex-wrap: wrap; gap: 10px; }
  .fact {
    display: flex; align-items: center; gap: 9px;
    font-size: 19px; color: #a9a9bb;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 999px; padding: 7px 16px;
  }
  .fact.missing { color: #f2b8b8; border-color: rgba(248,113,113,0.34); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: #f87171; }
  .score { text-align: right; flex-shrink: 0; }
  .score .value { font-size: 148px; font-weight: 800; line-height: 0.9; letter-spacing: -0.04em; }
  .score .max { display: block; margin-top: 10px; font-size: 26px; color: #6f6f82; }
  .foot {
    display: flex; align-items: center; justify-content: space-between;
    padding-top: 24px; position: relative;
    font-size: 21px; color: #8a8a9e;
  }
  .foot::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, #f3802d, #e12649, #cd187e, #7d258f, #4f2f94, #1f61b2);
    opacity: 0.85;
  }
  .foot .url { font-family: 'Fira Code', ui-monospace, monospace; font-size: 19px; }
</style>
</head>
<body>
  <div class="layer brand"><img class="mark" src="${logo}" alt=""><span>EXC Analyzer</span></div>
  <div class="layer middle">
    <div>
      <div class="repo">${escapeHtml(data.label)}</div>
      <div class="headline">${escapeHtml(data.headline)}</div>
      <div class="facts">${data.facts
        .map(
          (f) =>
            `<span class="fact${f.missing ? ' missing' : ''}">${f.missing ? '<span class="dot"></span>' : ''}${escapeHtml(f.text)}</span>`,
        )
        .join('')}</div>
    </div>
    ${scoreBlock}
  </div>
  <div class="layer foot">
    <span>Can you trust this repository?</span>
    <span class="url">${escapeHtml(data.url)}</span>
  </div>
</body>
</html>`;
}

export async function renderCards(
  cards: { data: CardData; outPath: string }[],
  publicDir: string,
): Promise<number> {
  if (cards.length === 0) return 0;

  const logoFile = path.join(publicDir, 'logo.png');
  let logo: string;
  try {
    logo = `data:image/png;base64,${(await fs.readFile(logoFile)).toString('base64')}`;
  } catch {
    throw new Error(`The share card needs the logo at ${logoFile}.`);
  }

  const executablePath = await findBrowser();
  const browser: Browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none'],
  });

  let written = 0;
  let usedFallbackFont = false;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: CARD_WIDTH, height: CARD_HEIGHT, deviceScaleFactor: 1 });

    for (const card of cards) {
      await page.setContent(cardHtml(card.data, logo), { waitUntil: 'load', timeout: 20_000 });
      const fontsLoaded = await page.evaluate(async () => {
        await document.fonts.ready;
        return document.fonts.check('600 30px Inter');
      });
      if (!usedFallbackFont && !fontsLoaded) {
        usedFallbackFont = true;
        console.warn('Inter did not load; cards fall back to the system sans-serif.');
      }
      const png = await page.screenshot({ type: 'png' });
      const full = path.join(publicDir, card.outPath);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, png);
      if (png.length < 8_000) {
        throw new Error(`${card.outPath} came out at ${png.length} bytes, which means it rendered blank.`);
      }
      written += 1;
    }
  } finally {
    await browser.close();
  }
  return written;
}
