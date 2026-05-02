export const EMPTY = 0;
export const CONDUCTOR = 1;
export const HEAD = 2;
export const TAIL = 3;
export const SIGNAL_PERIOD = 18;

export class WireworldPP {
  constructor(width = 120, height = 56) {
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

  get(x, y, kind) {
    return this.layer(kind)[this.idx(x, y)];
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
      if (this.get(tap.x, tap.y, tap.kind) === HEAD) hits.push(this.time);
    }
    return hits;
  }
}

export function evalFormula(node, assignment) {
  if (typeof node === 'string') return assignment[node];
  if (node.op === 'NOT') return !evalFormula(node.child, assignment);
  const a = evalFormula(node.left, assignment);
  const b = evalFormula(node.right, assignment);
  if (node.op === 'AND') return a && b;
  if (node.op === 'OR') return a || b;
  if (node.op === 'XOR') return a !== b;
  throw new Error(`Unknown op ${node.op}`);
}

export function boolGate(op, a, b) {
  if (op === 'AND') return a && b;
  if (op === 'OR') return a || b;
  if (op === 'XOR') return a !== b;
  throw new Error(`Unknown gate ${op}`);
}

export function addPrimitiveGate(sim, op, x, y, a, b, outX, options = {}) {
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
    return { x: outX, y, kind: 'strong', latency: outX - x };
  }
  if (op === 'OR') {
    sim.line(x, y - 1, x + 8, y - 1, 'strong');
    sim.line(x, y + 1, x + 8, y + 1, 'strong');
    sim.line(x + 9, y, outX, y, 'strong');
    if (sourceA) sim.source(x, y - 1, 1, 0, 'strong', a, phaseA);
    if (sourceB) sim.source(x, y + 1, 1, 0, 'strong', b, phaseB);
    return { x: outX, y, kind: 'strong', latency: outX - x };
  }
  if (op === 'XOR') {
    sim.line(x, y - 1, x + 8, y - 1, 'strong');
    sim.line(x, y + 1, x + 8, y + 1, 'strong');
    sim.line(x + 9, y, outX, y, 'weak');
    if (sourceA) sim.source(x, y - 1, 1, 0, 'strong', a, phaseA);
    if (sourceB) sim.source(x, y + 1, 1, 0, 'strong', b, phaseB);
    return { x: outX, y, kind: 'weak', latency: outX - x };
  }
  throw new Error(`Unknown gate ${op}`);
}

export function addFigure19NotCandidate(sim, x, y, input, inputPhase = 2) {
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

export function primitiveResult(op, a, b) {
  const sim = new WireworldPP(82, 32);
  const tap = addPrimitiveGate(sim, op, 4, 15, a, b, 50);
  return sim.observe({ x: tap.x - 1, y: tap.y, kind: tap.kind }, 90).length > 0;
}

export function notResult(input) {
  const sim = new WireworldPP(40, 24);
  const tap = addFigure19NotCandidate(sim, 5, 5, input);
  const hits = sim.observe(tap, 96).filter((t) => t > 18);
  return hits.length > 0;
}

export function formulaAndThenOr(a, b, c) {
  const sim = new WireworldPP();
  const andOut = addPrimitiveGate(sim, 'AND', 4, 14, a, b, 35);
  const final = addPrimitiveGate(sim, 'OR', 45, 15, false, c, 84, { sourceA: false });
  sim.line(andOut.x, andOut.y, 45, 14, 'strong');
  return sim.observe({ x: final.x - 1, y: final.y, kind: final.kind }, 220).filter((t) => t > 70).length > 0;
}

export function formulaOrThenAnd(a, b, c, phaseB = 13) {
  const sim = new WireworldPP();
  const orOut = addPrimitiveGate(sim, 'OR', 4, 13, a, b, 35);
  const final = addPrimitiveGate(sim, 'AND', 45, 15, false, c, 84, {
    sourceA: false,
    phaseB,
  });
  sim.line(orOut.x, orOut.y, 45, 13, 'strong');
  return sim.observe({ x: final.x - 1, y: final.y, kind: final.kind }, 220).filter((t) => t > 70).length > 0;
}

export function routeStrongOnlyFormula(formula, assignment) {
  const usesUnsupported = (node) => {
    if (typeof node === 'string') return false;
    if (node.op === 'NOT' || node.op === 'XOR') return true;
    return usesUnsupported(node.left) || usesUnsupported(node.right);
  };
  if (usesUnsupported(formula)) {
    return { ok: false, reason: 'unsupported-signal-kind' };
  }

  if (
    formula.op === 'OR' &&
    formula.left?.op === 'AND' &&
    typeof formula.right === 'string'
  ) {
    const a = evalFormula(formula.left.left, assignment);
    const b = evalFormula(formula.left.right, assignment);
    const c = evalFormula(formula.right, assignment);
    return { ok: true, observed: formulaAndThenOr(a, b, c) };
  }

  if (
    formula.op === 'AND' &&
    formula.left?.op === 'OR' &&
    typeof formula.right === 'string'
  ) {
    const a = evalFormula(formula.left.left, assignment);
    const b = evalFormula(formula.left.right, assignment);
    const c = evalFormula(formula.right, assignment);
    return { ok: true, observed: formulaOrThenAnd(a, b, c) };
  }

  return { ok: false, reason: 'layout-not-implemented' };
}
