import { CONDUCTOR, HEAD, TAIL, WireworldPP } from './wireworldpp-core.mjs';

export const PERIOD = 6;

const STATE_MAP = { cond: CONDUCTOR, head: HEAD, tail: TAIL };

function strongRow(y, x0, x1) {
  const out = [];
  for (let x = x0; x < x1; x++) out.push({ dx: x, dy: y, kind: 'strong' });
  return out;
}

function parsePattern(lines) {
  const out = [];
  for (let y = 0; y < lines.length; y++) {
    for (let x = 0; x < lines[y].length; x++) {
      const c = lines[y][x];
      if (c === '.') continue;
      if (c === 'O') out.push({ dx: x, dy: y, kind: 'strong' });
      else if (c === 'B') out.push({ dx: x, dy: y, kind: 'strong', state: 'head' });
      else if (c === 'G') out.push({ dx: x, dy: y, kind: 'strong', state: 'tail' });
      else if (c === 'w') out.push({ dx: x, dy: y, kind: 'weak' });
    }
  }
  return out;
}

const STUB_LEFT = { dx: -1, dy: 0 };
const STUB_RIGHT = { dx: 1, dy: 0 };

export const TEMPLATES = {
  AND: {
    name: 'AND',
    arity: 2,
    cells: [
      ...strongRow(-2, 0, 9),
      ...strongRow(2, 0, 9),
      { dx: 9, dy: -1, kind: 'weak' },
      { dx: 9, dy: 1, kind: 'weak' },
      { dx: 10, dy: 0, kind: 'strong' },
    ],
    inputs: [
      { dx: 0, dy: -2, kind: 'strong', phase: 0, stubDir: STUB_LEFT },
      { dx: 0, dy: 2, kind: 'strong', phase: 0, stubDir: STUB_LEFT },
    ],
    output: { dx: 10, dy: 0, kind: 'strong', phase: 4, stubDir: STUB_RIGHT },
    latency: 10,
    bbox: { x0: -1, x1: 11, y0: -3, y1: 3 },
  },
  OR: {
    name: 'OR',
    arity: 2,
    cells: [
      ...strongRow(-1, 0, 9),
      ...strongRow(1, 0, 9),
      { dx: 9, dy: 0, kind: 'strong' },
    ],
    inputs: [
      { dx: 0, dy: -1, kind: 'strong', phase: 0, stubDir: STUB_LEFT },
      { dx: 0, dy: 1, kind: 'strong', phase: 0, stubDir: STUB_LEFT },
    ],
    output: { dx: 9, dy: 0, kind: 'strong', phase: 3, stubDir: STUB_RIGHT },
    latency: 9,
    bbox: { x0: -1, x1: 10, y0: -2, y1: 2 },
  },
  NOT: {
    name: 'NOT',
    arity: 1,
    cells: parsePattern([
      '.....BBOOOO',
      '.....G....',
      '.....ww...',
      'OOOOOw.w..',
      '......O...',
      '.....O.O..',
      '.....B.O..',
      '......G...',
    ]),
    inputs: [{ dx: 0, dy: 3, kind: 'strong', phase: 2, stubDir: STUB_LEFT }],
    output: { dx: 10, dy: 0, kind: 'strong', phase: 0, stubDir: STUB_RIGHT },
    latency: 0,
    fixedOutputPhase: true,
    bbox: { x0: -1, x1: 11, y0: -1, y1: 8 },
  },
};

export function stamp(sim, template, x, y) {
  for (const cell of template.cells) {
    const state = cell.state ? STATE_MAP[cell.state] : CONDUCTOR;
    sim.set(x + cell.dx, y + cell.dy, cell.kind, state);
  }
  return {
    template,
    inputs: template.inputs.map((p) => ({
      x: x + p.dx, y: y + p.dy, kind: p.kind, phase: p.phase,
      stub: { x: x + p.dx + p.stubDir.dx, y: y + p.dy + p.stubDir.dy },
    })),
    output: {
      x: x + template.output.dx, y: y + template.output.dy,
      kind: template.output.kind, phase: template.output.phase,
      stub: { x: x + template.output.dx + template.output.stubDir.dx, y: y + template.output.dy + template.output.stubDir.dy },
    },
    latency: template.latency,
  };
}

export function buildSim(width = 80, height = 40) {
  return new WireworldPP(width, height);
}

export function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomFormula(numLeaves, varNames, rng, opts = {}) {
  const { allowNot = true, notProb = 0.2 } = opts;
  function build(leaves) {
    if (leaves.length === 1) {
      let node = { kind: 'var', name: leaves[0] };
      if (allowNot && rng() < notProb) node = { kind: 'not', child: node };
      return node;
    }
    const split = 1 + Math.floor(rng() * (leaves.length - 1));
    const left = build(leaves.slice(0, split));
    const right = build(leaves.slice(split));
    let node = { kind: 'binary', op: rng() < 0.5 ? 'AND' : 'OR', left, right };
    if (allowNot && rng() < notProb) node = { kind: 'not', child: node };
    return node;
  }
  return build(varNames.slice(0, numLeaves));
}

export function evalFormula(formula, assignment) {
  if (formula.kind === 'var') return assignment[formula.name];
  if (formula.kind === 'not') return !evalFormula(formula.child, assignment);
  const a = evalFormula(formula.left, assignment);
  const b = evalFormula(formula.right, assignment);
  return formula.op === 'AND' ? (a && b) : (a || b);
}

export function leavesOf(formula) {
  if (formula.kind === 'var') return [formula.name];
  if (formula.kind === 'not') return leavesOf(formula.child);
  return [...leavesOf(formula.left), ...leavesOf(formula.right)];
}

export function depthOf(formula) {
  if (formula.kind === 'var') return 0;
  if (formula.kind === 'not') return 1 + depthOf(formula.child);
  return 1 + Math.max(depthOf(formula.left), depthOf(formula.right));
}

export function formulaText(formula) {
  if (formula.kind === 'var') return formula.name;
  if (formula.kind === 'not') {
    const child = formulaText(formula.child);
    return formula.child.kind === 'var' ? `!${child}` : `!${child}`;
  }
  return `(${formulaText(formula.left)} ${formula.op} ${formulaText(formula.right)})`;
}

function buildNodeTree(formula, assignment) {
  let leafIdx = 0;
  function visit(f) {
    if (f.kind === 'var') {
      return { type: 'leaf', name: f.name, value: assignment[f.name], leafIndex: leafIdx++ };
    }
    if (f.kind === 'not') {
      return { type: 'gate', op: 'NOT', children: [visit(f.child)] };
    }
    return { type: 'gate', op: f.op, children: [visit(f.left), visit(f.right)] };
  }
  return visit(formula);
}

function nodeDepth(node) {
  if (node.type === 'leaf') return 0;
  return 1 + Math.max(...node.children.map(nodeDepth));
}

function collectLeaves(node, out = []) {
  if (node.type === 'leaf') out.push(node);
  else for (const c of node.children) collectLeaves(c, out);
  return out;
}

function collectGates(node, out = []) {
  if (node.type === 'gate') {
    for (const c of node.children) collectGates(c, out);
    out.push(node);
  }
  return out;
}

function placeTree(root, opts = {}) {
  const { colWidth = 16, rowHeight = 8, leftMargin = 3, topMargin = 6 } = opts;
  const treeDepth = nodeDepth(root);
  const leaves = collectLeaves(root);
  for (const leaf of leaves) {
    leaf.x = leftMargin;
    leaf.y = topMargin + leaf.leafIndex * rowHeight;
  }
  function assign(node) {
    if (node.type === 'leaf') return node.y;
    const childYs = node.children.map((c) => assign(c));
    const d = nodeDepth(node);
    node.x = leftMargin + d * colWidth;
    node.y = Math.round(childYs.reduce((s, y) => s + y, 0) / childYs.length);
    return node.y;
  }
  assign(root);
  const totalWidth = leftMargin + (treeDepth + 1) * colWidth + 16;
  const totalHeight = topMargin + leaves.length * rowHeight + 4;
  return { totalWidth, totalHeight, treeDepth, leafCount: leaves.length };
}

function bfsRoute(W, H, isFree, start, end) {
  const visited = new Uint8Array(W * H);
  const prev = new Int32Array(W * H).fill(-1);
  const idx = (x, y) => y * W + x;
  const queue = [];
  let qHead = 0;
  const startI = idx(start.x, start.y);
  visited[startI] = 1;
  queue.push(startI);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (qHead < queue.length) {
    const i = queue[qHead++];
    const x = i % W;
    const y = (i - x) / W;
    if (x === end.x && y === end.y) {
      const path = [];
      let cur = i;
      while (cur !== -1) {
        const cx = cur % W;
        const cy = (cur - cx) / W;
        path.push({ x: cx, y: cy });
        cur = prev[cur];
      }
      return path.reverse();
    }
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = idx(nx, ny);
      if (visited[j]) continue;
      if (!isFree(nx, ny)) continue;
      visited[j] = 1;
      prev[j] = i;
      queue.push(j);
    }
  }
  return null;
}

function reserveTemplateFootprint(forbidden, W, H, template, x, y) {
  const ports = new Set();
  for (const p of template.inputs) ports.add(`${x + p.dx},${y + p.dy}`);
  ports.add(`${x + template.output.dx},${y + template.output.dy}`);
  const stubs = new Set();
  for (const p of template.inputs) stubs.add(`${x + p.dx + p.stubDir.dx},${y + p.dy + p.stubDir.dy}`);
  stubs.add(`${x + template.output.dx + template.output.stubDir.dx},${y + template.output.dy + template.output.stubDir.dy}`);
  for (const cell of template.cells) {
    const cx = x + cell.dx;
    const cy = y + cell.dy;
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
    forbidden[cy * W + cx] = 1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const hx = cx + dx;
        const hy = cy + dy;
        if (hx < 0 || hy < 0 || hx >= W || hy >= H) continue;
        const key = `${hx},${hy}`;
        if (stubs.has(key)) continue;
        forbidden[hy * W + hx] = 1;
      }
    }
  }
}

function reservePathHalo(forbidden, W, H, path, allowedKeys) {
  for (const cell of path) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const hx = cell.x + dx;
        const hy = cell.y + dy;
        if (hx < 0 || hy < 0 || hx >= W || hy >= H) continue;
        if (allowedKeys && allowedKeys.has(`${hx},${hy}`)) continue;
        forbidden[hy * W + hx] = 1;
      }
    }
  }
}

function reserveLeafFootprint(forbidden, W, H, leaf) {
  const cells = [
    { x: leaf.x - 1, y: leaf.y },
    { x: leaf.x, y: leaf.y },
  ];
  const stubKey = `${leaf.x + 1},${leaf.y}`;
  for (const cell of cells) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= W || cell.y >= H) continue;
    forbidden[cell.y * W + cell.x] = 1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const hx = cell.x + dx;
        const hy = cell.y + dy;
        if (hx < 0 || hy < 0 || hx >= W || hy >= H) continue;
        if (`${hx},${hy}` === stubKey) continue;
        forbidden[hy * W + hx] = 1;
      }
    }
  }
}

function padPath(path, padding, forbidden, W, H) {
  if (padding === 0) return path;
  const cells = path.slice();
  let added = 0;
  let attempts = 0;
  while (added < padding && attempts < 200) {
    attempts++;
    let inserted = false;
    for (let i = 1; i < cells.length - 1 && added < padding; i++) {
      const a = cells[i - 1];
      const b = cells[i];
      const c = cells[i + 1];
      const horizontal = a.y === b.y && b.y === c.y;
      const vertical = a.x === b.x && b.x === c.x;
      if (!horizontal && !vertical) continue;
      const candidates = [];
      if (horizontal) {
        candidates.push({ dx: 0, dy: 1 }, { dx: 0, dy: -1 });
      } else if (vertical) {
        candidates.push({ dx: 1, dy: 0 }, { dx: -1, dy: 0 });
      }
      for (const { dx, dy } of candidates) {
        const u = { x: b.x + dx, y: b.y + dy };
        if (u.x < 0 || u.y < 0 || u.x >= W || u.y >= H) continue;
        if (forbidden[u.y * W + u.x]) continue;
        const v = { x: u.x + dx, y: u.y + dy };
        if (v.x < 0 || v.y < 0 || v.x >= W || v.y >= H) continue;
        if (forbidden[v.y * W + v.x]) continue;
        const haloOk = (() => {
          for (const cell of [u, v]) {
            for (let hy = -1; hy <= 1; hy++) {
              for (let hx = -1; hx <= 1; hx++) {
                const px = cell.x + hx;
                const py = cell.y + hy;
                if (px < 0 || py < 0 || px >= W || py >= H) continue;
                if (forbidden[py * W + px]) {
                  const isOnPath = cells.some((p) => p.x === px && p.y === py);
                  if (!isOnPath) return false;
                }
              }
            }
          }
          return true;
        })();
        if (!haloOk) continue;
        cells.splice(i + 1, 0, u, v, u);
        added += 2;
        forbidden[u.y * W + u.x] = 1;
        forbidden[v.y * W + v.x] = 1;
        inserted = true;
        break;
      }
    }
    if (!inserted) break;
  }
  if (added < padding) return null;
  return cells;
}

function paintPath(sim, path, kind) {
  for (const cell of path) {
    sim.set(cell.x, cell.y, kind, CONDUCTOR);
  }
}

function measureWireTravel(path, kind) {
  if (path.length < 2) return 0;
  let maxX = 0;
  let maxY = 0;
  for (const cell of path) {
    if (cell.x > maxX) maxX = cell.x;
    if (cell.y > maxY) maxY = cell.y;
  }
  const W = maxX + 4;
  const H = maxY + 4;
  const sim = new WireworldPP(W, H);
  for (const cell of path) sim.set(cell.x, cell.y, kind, CONDUCTOR);
  sim.set(path[0].x, path[0].y, kind, HEAD);
  const end = path[path.length - 1];
  for (let t = 1; t <= path.length + 4; t++) {
    sim.step();
    if (sim.get(end.x, end.y, kind) === HEAD) return t;
  }
  return -1;
}

function inputArrivalPhase(template, idx) {
  return template.inputs[idx].phase;
}

function expectedOutputEmit(template, inputPhase) {
  if (template.fixedOutputPhase) return template.output.phase;
  return ((inputPhase + template.latency) % PERIOD + PERIOD) % PERIOD;
}

function gateInputPhase(template) {
  if (template.arity === 1) return template.inputs[0].phase;
  return template.inputs[0].phase;
}

function solvePhases(root) {
  function solve(node, requiredEmit) {
    if (node.type === 'leaf') {
      node.sourcePhase = ((requiredEmit ?? 0) % PERIOD + PERIOD) % PERIOD;
      return node.sourcePhase;
    }
    const template = TEMPLATES[node.op];
    if (template.arity === 1) {
      const wireLen = node.netLengths[0];
      const targetInputPhase = template.inputs[0].phase;
      const requiredChildEmit = ((targetInputPhase - wireLen) % PERIOD + PERIOD) % PERIOD;
      const childEmit = solve(node.children[0], requiredChildEmit);
      const arrival = ((childEmit + wireLen) % PERIOD + PERIOD) % PERIOD;
      const padding = ((targetInputPhase - arrival) % PERIOD + PERIOD) % PERIOD;
      node.delayPadding = [padding];
      node.actualInputPhase = (arrival + padding) % PERIOD;
      const emit = template.fixedOutputPhase
        ? template.output.phase
        : ((node.actualInputPhase + template.latency) % PERIOD + PERIOD) % PERIOD;
      node.emitPhase = emit;
      return emit;
    }
    const targetInputPhase = requiredEmit !== null && requiredEmit !== undefined
      ? ((requiredEmit - template.latency) % PERIOD + PERIOD) % PERIOD
      : 0;
    node.delayPadding = [];
    for (let i = 0; i < node.children.length; i++) {
      const wireLen = node.netLengths[i];
      const requiredChildEmit = ((targetInputPhase - wireLen) % PERIOD + PERIOD) % PERIOD;
      const childEmit = solve(node.children[i], requiredChildEmit);
      const arrival = ((childEmit + wireLen) % PERIOD + PERIOD) % PERIOD;
      const padding = ((targetInputPhase - arrival) % PERIOD + PERIOD) % PERIOD;
      node.delayPadding.push(padding);
    }
    node.actualInputPhase = targetInputPhase;
    const emit = ((targetInputPhase + template.latency) % PERIOD + PERIOD) % PERIOD;
    node.emitPhase = emit;
    return emit;
  }
  return solve(root, null);
}

export function compile(formula, assignment, opts = {}) {
  const root = buildNodeTree(formula, assignment);
  const layout = placeTree(root, opts.placement);
  const W = opts.width ?? layout.totalWidth + 4;
  const H = opts.height ?? layout.totalHeight + 4;
  const sim = buildSim(W, H);
  const forbidden = new Uint8Array(W * H);
  const leaves = collectLeaves(root);
  for (const leaf of leaves) reserveLeafFootprint(forbidden, W, H, leaf);
  const gates = collectGates(root);
  for (const gate of gates) {
    const template = TEMPLATES[gate.op];
    reserveTemplateFootprint(forbidden, W, H, template, gate.x, gate.y);
    gate.handle = stamp(sim, template, gate.x, gate.y);
  }
  for (const leaf of leaves) {
    leaf.handle = {
      output: {
        x: leaf.x, y: leaf.y, kind: 'strong', phase: 0,
        stub: { x: leaf.x + 1, y: leaf.y },
      },
    };
  }

  for (const gate of gates) {
    gate.netPaths = [];
    gate.netLengths = [];
    for (let i = 0; i < gate.children.length; i++) {
      const child = gate.children[i];
      const sourceStub = child.handle.output.stub;
      const sinkStub = gate.handle.inputs[i].stub;
      const stubKeys = new Set([
        `${sourceStub.x},${sourceStub.y}`,
        `${sinkStub.x},${sinkStub.y}`,
      ]);
      const wasForbidden = [
        forbidden[sourceStub.y * W + sourceStub.x],
        forbidden[sinkStub.y * W + sinkStub.x],
      ];
      forbidden[sourceStub.y * W + sourceStub.x] = 0;
      forbidden[sinkStub.y * W + sinkStub.x] = 0;
      const path = bfsRoute(W, H, (x, y) => !forbidden[y * W + x], sourceStub, sinkStub);
      if (!path) {
        forbidden[sourceStub.y * W + sourceStub.x] = wasForbidden[0];
        forbidden[sinkStub.y * W + sinkStub.x] = wasForbidden[1];
        return { ok: false, reason: 'route-failed', formula, layout };
      }
      gate.netPaths.push(path);
      gate.netLengths.push(path.length + 1);
      reservePathHalo(forbidden, W, H, path, stubKeys);
    }
  }

  solvePhases(root);

  for (const gate of gates) {
    for (let i = 0; i < gate.netPaths.length; i++) {
      const padding = gate.delayPadding[i];
      const padded = padPath(gate.netPaths[i], padding, forbidden, W, H);
      if (!padded) {
        return { ok: false, reason: 'pad-failed', formula, layout };
      }
      gate.netPaths[i] = padded;
      paintPath(sim, padded, 'strong');
    }
  }

  for (const leaf of leaves) {
    sim.source(leaf.x, leaf.y, 1, 0, 'strong', leaf.value, leaf.sourcePhase, PERIOD);
  }

  let outputTap;
  const rootEmitPhase = root.emitPhase;
  if (root.type === 'leaf') {
    outputTap = { x: leaves[0].x, y: leaves[0].y, kind: 'strong' };
  } else {
    const out = root.handle.output;
    outputTap = { x: out.x, y: out.y, kind: out.kind };
  }

  return { ok: true, sim, root, leaves, gates, outputTap, layout, formula, assignment, rootEmitPhase, W, H };
}

export function simulateCompiled(compiled, opts = {}) {
  const { warmupCycles = 6, observeCycles = 4 } = opts;
  const totalSteps = (warmupCycles + observeCycles) * PERIOD;
  const tap = compiled.outputTap;
  const hits = compiled.sim.observe(tap, totalSteps);
  const settled = hits.filter((t) => t > warmupCycles * PERIOD);
  return { hits, settled, anySettled: settled.length > 0 };
}
