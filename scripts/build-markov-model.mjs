import { mkdir, writeFile } from 'node:fs/promises';
import https from 'node:https';

const ORDER = 4;
const TARGET_BYTES = 2_000_000;
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
  for (let i = 0; i < text.length - ORDER; i++) {
    const key = text.slice(i, i + ORDER);
    const next = text[i + ORDER];
    const bucket = counts.get(key) ?? new Map();
    bucket.set(next, (bucket.get(next) ?? 0) + 1);
    counts.set(key, bucket);
  }
}

function toFrequencyString(bucket, maxValueLength) {
  const entries = [...bucket.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const maxCount = entries[0]?.[1] ?? 1;
  const scaled = entries.map(([char, count]) => {
    const weight = Math.max(1, Math.round((Math.sqrt(count) / Math.sqrt(maxCount)) * 10));
    return [char, weight];
  });
  let value = scaled.map(([char, count]) => char.repeat(count)).join('');
  while (value.length > maxValueLength && scaled.some(([, count]) => count > 1)) {
    for (const item of scaled) {
      if (item[1] > 1) item[1]--;
      value = scaled.map(([char, count]) => char.repeat(count)).join('');
      if (value.length <= maxValueLength) break;
    }
  }
  if (value.length > maxValueLength) value = value.slice(0, maxValueLength);
  return value;
}

function transitionDiversity(bucket) {
  return bucket.size;
}

function totalCount(bucket) {
  return [...bucket.entries()]
    .reduce((sum, [, count]) => sum + count, 0);
}

function materialize(counts, minCount, maxValueLength) {
  const model = {};
  for (const [key, bucket] of counts) {
    const total = totalCount(bucket);
    if (total < minCount) continue;
    const value = toFrequencyString(bucket, Math.max(maxValueLength, transitionDiversity(bucket)));
    if (value.length > 1) model[key] = value;
  }
  return model;
}

async function main() {
  const counts = new Map();
  for (const url of SOURCES) {
    addCounts(counts, stripGutenberg(await fetchText(url)));
  }

  let minCount = 2;
  let maxValueLength = 64;
  let model = materialize(counts, minCount, maxValueLength);
  let json = JSON.stringify(model);
  while (Buffer.byteLength(json) > TARGET_BYTES && minCount < 240) {
    minCount++;
    if (minCount % 8 === 0) maxValueLength = Math.max(24, maxValueLength - 2);
    model = materialize(counts, minCount, maxValueLength);
    json = JSON.stringify(model);
  }

  await mkdir(new URL('../src/data/', import.meta.url), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(model, null, 0)}\n`);
  console.log(`states=${Object.keys(model).length} bytes=${Buffer.byteLength(json)} minCount=${minCount} maxValueLength=${maxValueLength}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
