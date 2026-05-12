#!/usr/bin/env node
// Word-level higher-order Markov model with backoff (orders 6 → 1).
// Trained on a curated set of public-domain philosophical / literary texts
// from Project Gutenberg. See src/data/markov_sources.json for additions.
//
// Output: src/data/markov_model.json
//   {
//     kind: "word-markov-backoff",
//     order: 6,
//     startToken: "<S>",
//     endToken:   "<E>",
//     orders: { "1": {...}, "2": {...}, ..., "6": {...} },
//     states: <alias for orders["6"], for older readers>,
//     meta:   { sources, sentences, tokens, bytes }
//   }
//
// Each entry under `orders[N]` is keyed by a tab-joined N-gram of tokens
// (e.g. "the\twhale\tis") and maps to a list of `[nextToken, count]` pairs,
// already sorted by count desc and truncated.  Counts are preserved (not
// probabilities) so that the runtime can re-temper.

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import https from 'node:https';
import { createHash } from 'node:crypto';

// ===== Tunables =====================================================
const ORDER             = 8;     // highest n-gram context kept
const TEMPERATURE       = 0.78;  // only used for the in-script preview generator
const TARGET_BYTES      = 5_500_000;  // tries to keep markov_model.json near this
const MIN_SENTENCE_WORDS = 5;
const MAX_SENTENCE_WORDS = 55;
const PREVIEW_PASSAGES  = 16;
const PREVIEW_MAX_TOKENS = 80;

// Per-order pruning guidance.  These are the *initial* settings; the script
// will tighten them iteratively until the JSON fits TARGET_BYTES.
//
// Bigrams dominate file size (every word pair you have ever read), so we
// start them already pruned.  Higher orders are sparse by nature.
const ORDER_PRUNING = {
  1: { minTotal: 1, maxTransitions: 18 },
  2: { minTotal: 2, maxTransitions: 10 },
  3: { minTotal: 2, maxTransitions: 8  },
  4: { minTotal: 2, maxTransitions: 6  },
  5: { minTotal: 2, maxTransitions: 5  },
  6: { minTotal: 2, maxTransitions: 4  },
  7: { minTotal: 2, maxTransitions: 3  },
  8: { minTotal: 2, maxTransitions: 3  },
};

// ===== Sources ======================================================
// To add a corpus:
//   1. Find a public-domain Project Gutenberg .txt.utf-8 URL.
//   2. Append it to src/data/markov_sources.json.
//   3. Re-run `npm run build:markov`.
const SOURCES_FILE = new URL('../src/data/markov_sources.json', import.meta.url);

const START = '<S>';
const END   = '<E>';

const OUT       = new URL('../src/data/markov_model.json', import.meta.url);
const CACHE_DIR = new URL('../.cache/markov-corpus/', import.meta.url);

function sourceLabel(src) {
  return src.label ?? `${src.title} (${src.author})`;
}

async function loadSources() {
  const sources = JSON.parse(await readFile(SOURCES_FILE, 'utf8'));
  for (const src of sources) {
    if (!src.title || !src.author || !src.year || !src.url) {
      throw new Error(`Invalid Markov source entry: ${JSON.stringify(src)}`);
    }
  }
  return sources;
}

// ===== Network ======================================================
function fetchText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { family: 4, timeout: 60_000, headers: { 'User-Agent': 'personal-site-markov-builder/1' } }, (res) => {
      const status = res.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirects < 6) {
        res.resume();
        // Upgrade http -> https; gutenberg.org serves both but the node `https`
        // module rejects http: URLs.
        const next = new URL(res.headers.location, url);
        if (next.protocol === 'http:') next.protocol = 'https:';
        resolve(fetchText(next.toString(), redirects + 1));
        return;
      }
      if (status !== 200) {
        res.resume();
        reject(new Error(`HTTP ${status} for ${url}`));
        return;
      }
      res.setEncoding('utf8');
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve(body));
    });
    req.on('timeout', () => { req.destroy(new Error(`Timeout for ${url}`)); });
    req.on('error', reject);
  });
}

async function getCached(url) {
  await mkdir(CACHE_DIR, { recursive: true });
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 12);
  const file = new URL(`${hash}.txt`, CACHE_DIR);
  if (existsSync(file)) {
    const s = await stat(file);
    if (s.size > 1024) return readFile(file, 'utf8');
  }
  const text = await fetchText(url);
  await writeFile(file, text);
  return text;
}

// ===== Cleanup ======================================================
function htmlToText(html) {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<(?:p|br|div|h[1-6]|li|hr|tr|td|blockquote|section|article)\b[^>]*>/gi, '\n\n');
  s = s.replace(/<\/(?:p|div|h[1-6]|li|tr|td|blockquote|section|article)>/gi, '\n\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
  return s;
}

function looksLikeHtml(text) {
  const head = text.slice(0, 4000).toLowerCase();
  return /<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]/.test(head);
}

function stripGutenbergFrame(text) {
  // Strip Project Gutenberg license/header preamble and trailing license.
  const startIdx = text.search(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*?\*\*\*/i);
  const endIdx   = text.search(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  let body = text;
  if (startIdx >= 0) {
    const newline = text.indexOf('\n', startIdx);
    body = body.slice(newline >= 0 ? newline + 1 : startIdx);
  }
  if (endIdx >= 0) {
    const cutAt = endIdx - (startIdx >= 0 ? text.indexOf('\n', startIdx) + 1 : 0);
    if (cutAt > 0) body = body.slice(0, cutAt);
  }
  return body;
}

function normalizeText(text) {
  return text
    .replace(/\r/g, '')
    // Smart quotes / dashes
    .replace(/[‘’ʼʻ]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[–—―]/g, '--')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    // Footnote markers like [1], [12], [Footnote A]
    .replace(/\[(?:[0-9]{1,3}|footnote[^\]]{0,80})\]/gi, ' ')
    // Editorial brackets: [Illustration: ...], [Sidenote: ...], [Greek: ...]
    .replace(/\[(?:illustration|sidenote|greek|transcriber'?s? note|note)[^\]]{0,300}\]/gi, ' ')
    // Asterisk dividers and decorative lines
    .replace(/^\s*[*=_~+\-]{2,}\s*$/gm, '')
    // Page numbers / chapter markers like "[Pg 12]" or "{12}"
    .replace(/\[pg\s*\d+\]/gi, ' ')
    .replace(/\{[^}]{0,80}\}/g, ' ')
    // Stray underscores used for italics
    .replace(/_+/g, ' ')
    // Lines that are clearly headings (ALL CAPS short lines) -> drop
    .replace(/^[ \t]*[A-Z][A-Z0-9 ,.'\-]{2,}[ \t]*$/gm, '')
    // Roman-numeral chapter headings
    .replace(/^[ \t]*(?:chapter|book|part|section|canto|tractate|ennead|proposition|theorem)\b[^.\n]{0,80}$/gim, '')
    // Drop common Project Gutenberg meta lines
    .replace(/^[ \t]*(?:produced by|transcriber's? note|edited by|translator|introduction|contents)\b[^\n]*$/gim, '')
    // Collapse remaining whitespace inside paragraphs but preserve blank lines
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

function paragraphs(text) {
  return text.split(/\n\s*\n/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean);
}

// ===== Sentence segmentation ========================================
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'st', 'sr', 'jr', 'prof', 'rev', 'gen', 'col',
  'capt', 'lt', 'sgt', 'maj', 'fr', 'pp', 'no', 'vol', 'ch', 'sec',
  'e.g', 'i.e', 'etc', 'viz', 'cf', 'op', 'al', 'ibid', 'inst', 'ult',
]);

function looksLikeAbbreviation(piece) {
  // piece is the text just before the period.  Take the trailing token.
  const m = piece.match(/([A-Za-z][A-Za-z'.]*)\s*$/);
  if (!m) return false;
  const tok = m[1].toLowerCase().replace(/\.$/, '');
  if (tok.length === 1) return true;        // single letter like "A." in "A. M. Berns"
  return ABBREVIATIONS.has(tok);
}

function splitSentences(paragraph) {
  // Walk the paragraph and split on sentence-ending punctuation followed by
  // whitespace + (capital letter | quote | digit).  Tolerates abbreviations.
  const out = [];
  let buf = '';
  for (let i = 0; i < paragraph.length; i++) {
    const ch = paragraph[i];
    buf += ch;
    if (ch === '.' || ch === '!' || ch === '?') {
      // include trailing closing quotes / parens / further terminators
      while (i + 1 < paragraph.length && /["')\]\.!?]/.test(paragraph[i + 1])) {
        buf += paragraph[i + 1];
        i++;
      }
      const after = paragraph.slice(i + 1);
      if (/^\s+["'(\[]?[A-Z0-9]/.test(after) || i === paragraph.length - 1) {
        if (!(ch === '.' && looksLikeAbbreviation(buf.slice(0, -1)))) {
          out.push(buf.trim());
          buf = '';
        }
      }
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

// ===== Tokenization =================================================
// Words can include internal apostrophes (don't, ne'er) and hyphens
// (well-being). Punctuation tokens stand alone, but paired punctuation
// like quotes and parentheses is deliberately dropped so generated text
// cannot display visually unbalanced marks.
const WORD_RE = /[A-Za-z][A-Za-z'\-]*[A-Za-z]|[A-Za-z]/;
const TOKEN_RE = /[A-Za-z][A-Za-z'\-]*[A-Za-z]|[A-Za-z]|[0-9]+|[.,;:!?]|--/g;

function tokenizeSentence(sentence) {
  const raw = sentence.match(TOKEN_RE) ?? [];
  const tokens = [];
  for (let t of raw) {
    // Trim repeated punctuation like "?!" -> "?"
    if (/^[.,;:!?]+$/.test(t)) t = t[0];
    // Lowercase words while preserving "I" and proper noun feel by keeping
    // capitalization for single-letter "I" only (helps cadence at runtime).
    if (/^[A-Za-z]/.test(t)) {
      t = t === 'I' ? 'I' : t.toLowerCase();
      // Strip stray apostrophes / hyphens at the edge
      t = t.replace(/^['\-]+|['\-]+$/g, '');
      if (!t) continue;
    }
    tokens.push(t);
  }
  return tokens;
}

function countWords(tokens) {
  let n = 0;
  for (const t of tokens) if (WORD_RE.test(t)) n++;
  return n;
}

// ===== Counting =====================================================
function makeCountStore() {
  const orders = {};
  for (let n = 1; n <= ORDER; n++) orders[n] = new Map();
  return orders;
}

function addSentence(orders, tokens) {
  // Pad with ORDER copies of START at the front, single END at the back.
  // This produces every (state, next) pair for every order 1..ORDER.
  const padded = [];
  for (let i = 0; i < ORDER; i++) padded.push(START);
  for (const t of tokens) padded.push(t);
  padded.push(END);

  for (let n = 1; n <= ORDER; n++) {
    const store = orders[n];
    for (let i = ORDER - n; i + n < padded.length; i++) {
      const ctx = padded.slice(i, i + n).join('\t');
      const nxt = padded[i + n];
      let bucket = store.get(ctx);
      if (!bucket) { bucket = new Map(); store.set(ctx, bucket); }
      bucket.set(nxt, (bucket.get(nxt) ?? 0) + 1);
    }
  }
}

// ===== Materialize / prune ==========================================
function materializeOrder(store, { minTotal, maxTransitions }) {
  const out = {};
  let stateCount = 0;
  let edgeCount = 0;
  for (const [ctx, bucket] of store) {
    let total = 0;
    for (const c of bucket.values()) total += c;
    if (total < minTotal) continue;
    const entries = [...bucket.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, maxTransitions);
    out[ctx] = entries;
    stateCount++;
    edgeCount += entries.length;
  }
  return { table: out, stateCount, edgeCount };
}

function buildModel(orders, pruning) {
  const orderTables = {};
  const stats = {};
  for (let n = 1; n <= ORDER; n++) {
    const m = materializeOrder(orders[n], pruning[n]);
    orderTables[n] = m.table;
    stats[n] = { states: m.stateCount, edges: m.edgeCount };
  }
  const model = {
    kind: 'word-markov-backoff',
    order: ORDER,
    startToken: START,
    endToken: END,
    orders: orderTables,
  };
  return { model, stats };
}

function tightenPruning(p) {
  // Tighten higher orders first.  Returns a new pruning config or null when
  // we can no longer reasonably tighten.
  const next = JSON.parse(JSON.stringify(p));
  let changed = false;
  for (let n = ORDER; n >= 2; n--) {
    if (next[n].maxTransitions > 3) { next[n].maxTransitions -= 1; changed = true; break; }
    if (next[n].minTotal < 8)       { next[n].minTotal      += 1; changed = true; break; }
  }
  if (!changed) {
    // Last resort: tighten order 1 a bit.
    if (next[1].maxTransitions > 8) { next[1].maxTransitions -= 2; changed = true; }
  }
  return changed ? next : null;
}

// ===== In-script preview generator ==================================
function backoffLookup(model, ctxTokens) {
  // ctxTokens is the trailing tokens of the running passage; we try the
  // longest available context first.
  const orders = model.orders;
  for (let n = Math.min(ctxTokens.length, model.order); n >= 1; n--) {
    const key = ctxTokens.slice(ctxTokens.length - n).join('\t');
    const entries = orders[n][key];
    if (entries && entries.length) return { entries, order: n };
  }
  return null;
}

function sampleWeighted(entries, temperature, rng) {
  let total = 0;
  for (const [, c] of entries) total += c;
  let weightSum = 0;
  const weights = entries.map(([w, c]) => {
    const p = c / total;
    const wt = Math.pow(p, 1 / Math.max(0.05, temperature));
    weightSum += wt;
    return wt;
  });
  let roll = rng() * weightSum;
  for (let i = 0; i < entries.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return entries[i][0];
  }
  return entries[entries.length - 1][0];
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function detokenize(tokens) {
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === START || t === END) continue;
    if (i === 0) { out += t; continue; }
    if (/^[.,;:!?]$/.test(t)) out += t;
    else if (t === ')' || t === '"' || t === ']') out += t;
    else if (out.endsWith('(') || out.endsWith('"') || out.endsWith('[')) out += t;
    else out += ' ' + t;
  }
  return out;
}

function generatePassage(model, rng, { temperature = TEMPERATURE, maxTokens = PREVIEW_MAX_TOKENS } = {}) {
  const ctx = [];
  for (let i = 0; i < model.order; i++) ctx.push(START);
  const out = [];
  for (let step = 0; step < maxTokens; step++) {
    const look = backoffLookup(model, ctx);
    if (!look) break;
    const next = sampleWeighted(look.entries, temperature, rng);
    if (next === END) {
      // Decide to keep going (next sentence) or stop.
      if (out.length > 18 && rng() < 0.55) break;
      ctx.length = 0;
      for (let i = 0; i < model.order; i++) ctx.push(START);
      continue;
    }
    out.push(next);
    ctx.push(next);
    if (ctx.length > model.order) ctx.shift();
  }
  return detokenize(out);
}

// ===== Driver =======================================================
async function main() {
  const sources = await loadSources();
  const counts = makeCountStore();
  let totalSentences = 0;
  let totalTokens = 0;
  const skipped = [];

  console.log(`Loading ${sources.length} sources...`);
  for (const src of sources) {
    const label = sourceLabel(src);
    try {
      const raw = await getCached(src.url);
      const decoded = looksLikeHtml(raw) ? htmlToText(raw) : raw;
      const body = normalizeText(stripGutenbergFrame(decoded));
      const paras = paragraphs(body);
      let sentencesFromSource = 0;
      let tokensFromSource = 0;
      for (const p of paras) {
        for (const sent of splitSentences(p)) {
          const tokens = tokenizeSentence(sent);
          const w = countWords(tokens);
          if (w < MIN_SENTENCE_WORDS || w > MAX_SENTENCE_WORDS) continue;
          addSentence(counts, tokens);
          sentencesFromSource++;
          tokensFromSource += tokens.length;
        }
      }
      totalSentences += sentencesFromSource;
      totalTokens    += tokensFromSource;
      console.log(`  ✓ ${label.padEnd(40)} sentences=${sentencesFromSource}  tokens=${tokensFromSource}`);
    } catch (err) {
      skipped.push({ ...src, reason: err.message });
      console.log(`  ✗ ${label.padEnd(40)} ${err.message}`);
    }
  }

  // Iteratively tighten pruning until JSON fits TARGET_BYTES.
  let pruning = ORDER_PRUNING;
  let { model, stats } = buildModel(counts, pruning);
  let json = JSON.stringify(model);
  let bytes = Buffer.byteLength(json);
  let pass = 0;
  while (bytes > TARGET_BYTES) {
    const tighter = tightenPruning(pruning);
    if (!tighter) break;
    pruning = tighter;
    ({ model, stats } = buildModel(counts, pruning));
    json = JSON.stringify(model);
    bytes = Buffer.byteLength(json);
    pass++;
    if (pass > 200) break;
  }

  await mkdir(new URL('../src/data/', import.meta.url), { recursive: true });
  model.meta = {
    sources: sources.length - skipped.length,
    sentences: totalSentences,
    tokens: totalTokens,
    bytes,
  };
  json = JSON.stringify(model);
  await writeFile(OUT, json + '\n');

  console.log('');
  console.log(`Wrote ${OUT.pathname}`);
  console.log(`  order               = ${ORDER}`);
  console.log(`  sources loaded      = ${sources.length - skipped.length} / ${sources.length}`);
  console.log(`  sentences kept      ≈ ${totalSentences.toLocaleString()}`);
  console.log(`  tokens kept         ≈ ${totalTokens.toLocaleString()}`);
  console.log(`  output size         = ${(bytes / 1_000_000).toFixed(2)} MB`);
  console.log('  states by order:');
  for (let n = 1; n <= ORDER; n++) {
    console.log(`    order ${n}: states=${stats[n].states.toLocaleString().padStart(9)}  edges=${stats[n].edges.toLocaleString().padStart(10)}  (minTotal=${pruning[n].minTotal}, maxTrans=${pruning[n].maxTransitions})`);
  }
  if (skipped.length) {
    console.log('  skipped:');
    for (const s of skipped) console.log(`    - ${sourceLabel(s)} :: ${s.reason}`);
  }

  // ----- preview -----
  console.log('');
  console.log(`Preview ${PREVIEW_PASSAGES} passages (temperature=${TEMPERATURE}):`);
  console.log('-----------------------------------------------------------------');
  const rng = mulberry32(Date.now() & 0xffffffff);
  for (let i = 0; i < PREVIEW_PASSAGES; i++) {
    const p = generatePassage(model, rng);
    console.log(`  ${String(i + 1).padStart(2)}. ${p}`);
    console.log('');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
