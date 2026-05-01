import { mkdir, writeFile } from 'node:fs/promises';
import https from 'node:https';

const ORDER = 3;
const TARGET_BYTES = 8_000_000;
const OUT = new URL('../src/data/markov_model.json', import.meta.url);

const SOURCES = [
  'https://www.gutenberg.org/cache/epub/3800/pg3800.txt',
  'https://www.gutenberg.org/files/5740/5740-t/5740-t.tex',
  'https://www.gutenberg.org/cache/epub/26295/pg26295.txt',
  'https://www.gutenberg.org/cache/epub/12341/pg12341.txt',
  'https://www.gutenberg.org/cache/epub/26163/pg26163.txt',
  'https://www.gutenberg.org/cache/epub/2701/pg2701.txt',
  'https://www.gutenberg.org/cache/epub/1079/pg1079.txt',
];

function stripGutenberg(text) {
  const start = text.search(/\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  const end = text.search(/\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  const body = text.slice(start >= 0 ? text.indexOf('\n', start) + 1 : 0, end >= 0 ? end : text.length);
  return body
    .replace(/\r/g, '\n')
    .replace(/\\[a-zA-Z]+(?:\[[^\]]*\])?(?:\{[^}]*\})?/g, ' ')
    .replace(/[{}$\\]/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/[^A-Za-z0-9.,;:!?'"()\- \n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*(?:[.,;:!?]+)?|["()]/g) ?? [];
}

function keyFor(tokens, index) {
  return tokens.slice(index, index + ORDER).join('\t');
}

function fetchText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { family: 4, timeout: 30_000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0) && res.headers.location && redirects < 4) {
        res.resume();
        resolve(fetchText(new URL(res.headers.location, url).toString(), redirects + 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Failed ${url}: ${res.statusCode}`));
        return;
      }
      res.setEncoding('utf8');
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

function addCounts(counts, text) {
  const tokens = tokenize(text);
  for (let i = 0; i < tokens.length - ORDER; i++) {
    const key = keyFor(tokens, i);
    const next = tokens[i + ORDER];
    const bucket = counts.get(key) ?? new Map();
    bucket.set(next, (bucket.get(next) ?? 0) + 1);
    counts.set(key, bucket);
  }
}

function materialize(counts, minCount, maxTransitions) {
  const states = {};
  for (const [key, bucket] of counts) {
    const entries = [...bucket.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, maxTransitions);
    const total = entries.reduce((sum, [, count]) => sum + count, 0);
    if (total < minCount) continue;
    states[key] = entries;
  }
  return { order: ORDER, states };
}

async function main() {
  const counts = new Map();
  for (const url of SOURCES) {
    addCounts(counts, stripGutenberg(await fetchText(url)));
  }

  let minCount = 1;
  let maxTransitions = 18;
  let model = materialize(counts, minCount, maxTransitions);
  let json = JSON.stringify(model);
  while (Buffer.byteLength(json) > TARGET_BYTES && minCount < 80) {
    minCount++;
    if (minCount % 8 === 0) maxTransitions = Math.max(8, maxTransitions - 1);
    model = materialize(counts, minCount, maxTransitions);
    json = JSON.stringify(model);
  }

  await mkdir(new URL('../src/data/', import.meta.url), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(model, null, 0)}\n`);
  console.log(
    `order=${ORDER} states=${Object.keys(model.states).length} bytes=${Buffer.byteLength(json)} minCount=${minCount} maxTransitions=${maxTransitions}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
