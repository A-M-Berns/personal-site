const EMPTY = 0;
const CONDUCTOR = 1;
const HEAD = 2;
const TAIL = 3;
const SIGNAL_PERIOD = 18;

class WireworldPP {
  constructor(width = 110, height = 44) {
    this.width = width;
    this.height = height;
    this.strong = new Uint8Array(width * height);
    this.weak = new Uint8Array(width * height);
    this.nextStrong = new Uint8Array(width * height);
    this.nextWeak = new Uint8Array(width * height);
    this.sources = [];
    this.time = 0;
  }

  idx(x, y) {
    return y * this.width + x;
  }

  inBounds(x, y) {
    return x > 1 && y > 1 && x < this.width - 2 && y < this.height - 2;
  }

  layer(kind) {
    return kind === 'strong' ? this.strong : this.weak;
  }

  otherLayer(kind) {
    return kind === 'strong' ? this.weak : this.strong;
  }

  set(x, y, kind, value) {
    if (!this.inBounds(x, y)) return;
    this.layer(kind)[this.idx(x, y)] = value;
    if (value !== EMPTY) this.otherLayer(kind)[this.idx(x, y)] = EMPTY;
  }

  line(x0, y0, x1, y1, kind) {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      this.set(x, y, kind, CONDUCTOR);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  source(x, y, dx, dy, kind, enabled, phase = 0, period = SIGNAL_PERIOD) {
    this.sources.push({ x, y, dx, dy, kind, enabled, phase, period });
  }

  countHeads(x, y) {
    let strongHeads = 0;
    let weakHeads = 0;
    for (let yy = -1; yy <= 1; yy++) {
      for (let xx = -1; xx <= 1; xx++) {
        if (xx === 0 && yy === 0) continue;
        const i = this.idx(x + xx, y + yy);
        if (this.strong[i] === HEAD) strongHeads++;
        if (this.weak[i] === HEAD) weakHeads++;
      }
    }
    return { strongHeads, weakHeads };
  }

  injectSource(source) {
    if (!source.enabled || (this.time + source.phase) % source.period !== 0) return;
    this.set(source.x, source.y, source.kind, HEAD);
    this.set(source.x - source.dx, source.y - source.dy, source.kind, TAIL);
  }

  stepLayer(src, dst, kind) {
    dst.fill(EMPTY);
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        const i = this.idx(x, y);
        const cell = src[i];
        if (cell === HEAD) {
          dst[i] = TAIL;
        } else if (cell === TAIL) {
          dst[i] = CONDUCTOR;
        } else if (cell === CONDUCTOR) {
          const { strongHeads, weakHeads } = this.countHeads(x, y);
          if (kind === 'strong') {
            dst[i] = strongHeads === 1 || strongHeads === 2 || weakHeads === 2 ? HEAD : CONDUCTOR;
          } else {
            dst[i] = weakHeads === 1 || weakHeads === 2 || strongHeads === 1 ? HEAD : CONDUCTOR;
          }
        }
      }
    }
  }

  step() {
    for (const source of this.sources) this.injectSource(source);
    this.stepLayer(this.strong, this.nextStrong, 'strong');
    this.stepLayer(this.weak, this.nextWeak, 'weak');
    [this.strong, this.nextStrong] = [this.nextStrong, this.strong];
    [this.weak, this.nextWeak] = [this.nextWeak, this.weak];
    this.time++;
  }

  observe(tap, steps = 220) {
    const hits = [];
    for (let i = 0; i < steps; i++) {
      this.step();
      if (this.layer(tap.kind)[this.idx(tap.x, tap.y)] === HEAD) hits.push(this.time);
    }
    return hits;
  }
}

function boolGate(op, a, b) {
  if (op === 'AND') return a && b;
  if (op === 'OR') return a || b;
  return a !== b;
}

function addPrimitiveGate(sim, op, x, y, a, b, outX, options = {}) {
  const {
    sourceA = true,
    sourceB = true,
    phaseA = 0,
    phaseB = 0,
  } = options;
  if (op === 'AND') {
    sim.line(x, y - 2, x + 8, y - 2, 'strong');
    sim.line(x, y + 2, x + 8, y + 2, 'strong');
    sim.set(x + 9, y - 1, 'weak', CONDUCTOR);
    sim.set(x + 9, y + 1, 'weak', CONDUCTOR);
    sim.line(x + 10, y, outX, y, 'strong');
    if (sourceA) sim.source(x, y - 2, 1, 0, 'strong', a, phaseA);
    if (sourceB) sim.source(x, y + 2, 1, 0, 'strong', b, phaseB);
    return { x: outX, y, kind: 'strong' };
  }
  if (op === 'OR') {
    sim.line(x, y - 1, x + 8, y - 1, 'strong');
    sim.line(x, y + 1, x + 8, y + 1, 'strong');
    sim.line(x + 9, y, outX, y, 'strong');
    if (sourceA) sim.source(x, y - 1, 1, 0, 'strong', a, phaseA);
    if (sourceB) sim.source(x, y + 1, 1, 0, 'strong', b, phaseB);
    return { x: outX, y, kind: 'strong' };
  }
  sim.line(x, y - 1, x + 8, y - 1, 'strong');
  sim.line(x, y + 1, x + 8, y + 1, 'strong');
  sim.line(x + 9, y, outX, y, 'weak');
  if (sourceA) sim.source(x, y - 1, 1, 0, 'strong', a, phaseA);
  if (sourceB) sim.source(x, y + 1, 1, 0, 'strong', b, phaseB);
  return { x: outX, y, kind: 'weak' };
}

function primitiveResult(op, a, b) {
  const sim = new WireworldPP(82, 32);
  const tap = addPrimitiveGate(sim, op, 4, 15, a, b, 50);
  return sim.observe({ x: tap.x - 1, y: tap.y, kind: tap.kind }, 90).length > 0;
}

function addFigure19NotCandidate(sim, x, y, input, inputPhase = 2) {
  const pattern = [
    '.....BBOOOO',
    '.....G....',
    '.....ww...',
    'OOOOOw.w..',
    '......O...',
    '.....O.O..',
    '.....B.O..',
    '......G...',
  ];
  for (let yy = 0; yy < pattern.length; yy++) {
    for (let xx = 0; xx < pattern[yy].length; xx++) {
      const cell = pattern[yy][xx];
      if (cell === 'O') sim.set(x + xx, y + yy, 'strong', CONDUCTOR);
      else if (cell === 'B') sim.set(x + xx, y + yy, 'strong', HEAD);
      else if (cell === 'G') sim.set(x + xx, y + yy, 'strong', TAIL);
      else if (cell === 'w') sim.set(x + xx, y + yy, 'weak', CONDUCTOR);
    }
  }
  sim.source(x, y + 3, 1, 0, 'strong', input, inputPhase, 6);
  return { x: x + 10, y, kind: 'strong' };
}

function notResult(input) {
  const sim = new WireworldPP(40, 24);
  const tap = addFigure19NotCandidate(sim, 5, 5, input);
  const hits = sim.observe(tap, 96).filter((t) => t > 18);
  return hits.length > 0;
}

function formulaAndThenOr(a, b, c) {
  const sim = new WireworldPP();
  const andOut = addPrimitiveGate(sim, 'AND', 4, 14, a, b, 35);
  const final = addPrimitiveGate(sim, 'OR', 45, 15, false, c, 84, { sourceA: false });
  sim.line(andOut.x, andOut.y, 45, 14, 'strong');
  return sim.observe({ x: final.x - 1, y: final.y, kind: final.kind }, 220).filter((t) => t > 70).length > 0;
}

function formulaOrThenAnd(a, b, c) {
  const sim = new WireworldPP();
  const orOut = addPrimitiveGate(sim, 'OR', 4, 13, a, b, 35);
  const final = addPrimitiveGate(sim, 'AND', 45, 15, false, c, 84, {
    sourceA: false,
    phaseB: 13,
  });
  sim.line(orOut.x, orOut.y, 45, 13, 'strong');
  return sim.observe({ x: final.x - 1, y: final.y, kind: final.kind }, 220).filter((t) => t > 70).length > 0;
}

function assertEqual(name, actual, expected) {
  if (actual !== expected) throw new Error(`${name}: expected ${expected}, got ${actual}`);
  console.log(`ok ${name}`);
}

for (const op of ['AND', 'OR', 'XOR']) {
  for (const a of [false, true]) {
    for (const b of [false, true]) {
      assertEqual(`${op}(${a}, ${b})`, primitiveResult(op, a, b), boolGate(op, a, b));
    }
  }
}

assertEqual('NOT(false)', notResult(false), true);
assertEqual('NOT(true)', notResult(true), false);

for (const a of [false, true]) {
  for (const b of [false, true]) {
    for (const c of [false, true]) {
      assertEqual(`(A AND B) OR C with ${a},${b},${c}`, formulaAndThenOr(a, b, c), (a && b) || c);
      assertEqual(`(A OR B) AND C with ${a},${b},${c}`, formulaOrThenAnd(a, b, c), (a || b) && c);
    }
  }
}

console.log('Wireworld++ primitive verification passed.');
