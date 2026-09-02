import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PROJECT_REF = 'dfffwcesbxhvtiomhicb';
const TOKEN_FILE = path.join(process.cwd(), '.supabase-token');

async function readToken() {
  const fromEnv = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  try {
    const fromFile = (await readFile(TOKEN_FILE, 'utf8')).trim();
    if (fromFile) return fromFile;
  } catch {}
  throw new Error(
    `No access token. Create one at https://supabase.com/dashboard/account/tokens and paste it into ${TOKEN_FILE}, or set SUPABASE_ACCESS_TOKEN.`,
  );
}

function statements(sql) {
  const out = [];
  let current = '';
  let dollar = null;

  for (const line of sql.split('\n')) {
    const tag = line.match(/\$[A-Za-z_]*\$/g);
    if (tag) {
      for (const t of tag) {
        if (dollar === null) dollar = t;
        else if (dollar === t) dollar = null;
      }
    }
    current += line + '\n';
    if (dollar === null && line.trimEnd().endsWith(';')) {
      if (current.trim()) out.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

async function run(sql, token) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    const message =
      typeof body === 'object' && body && 'message' in body ? body.message : String(body).slice(0, 400);
    throw new Error(`HTTP ${res.status}: ${message}`);
  }
  return body;
}

const file = process.argv[2];
if (!file) {
  console.error('Usage: node supabase/run.mjs <file.sql> [--one-by-one]');
  process.exit(1);
}

const token = await readToken();
const sql = await readFile(file, 'utf8');
const oneByOne = process.argv.includes('--one-by-one');

if (!oneByOne) {
  const result = await run(sql, token);
  console.log(JSON.stringify(result, null, 2));
} else {
  const parts = statements(sql);
  console.log(`${parts.length} statements`);
  for (const [i, part] of parts.entries()) {
    const head = part.split('\n')[0].slice(0, 70);
    try {
      const result = await run(part, token);
      const rows = Array.isArray(result) ? result.length : 0;
      console.log(`  ${String(i + 1).padStart(2)}. ok   ${head}${rows ? `  (${rows} rows)` : ''}`);
      if (Array.isArray(result) && result.length > 0 && i === parts.length - 1) {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (err) {
      console.error(`  ${String(i + 1).padStart(2)}. FAIL ${head}`);
      console.error(`      ${err.message}`);
      process.exit(1);
    }
  }
}
