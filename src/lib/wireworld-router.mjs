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

export const TEMPLATES = {
  AND: {
    name: 'AND',
    cells: [
      ...strongRow(-2, 0, 9),
      ...strongRow(2, 0, 9),
      { dx: 9, dy: -1, kind: 'weak' },
      { dx: 9, dy: 1, kind: 'weak' },
      { dx: 10, dy: 0, kind: 'strong' },
    ],
    inputs: [
      { dx: 0, dy: -2, kind: 'strong', phase: 0 },
      { dx: 0, dy: 2, kind: 'strong', phase: 0 },
    ],
    output: { dx: 10, dy: 0, kind: 'strong', phase: 4 },
    latency: 10,
  },
  OR: {
    name: 'OR',
    cells: [
      ...strongRow(-1, 0, 9),
      ...strongRow(1, 0, 9),
      { dx: 9, dy: 0, kind: 'strong' },
    ],
    inputs: [
      { dx: 0, dy: -1, kind: 'strong', phase: 0 },
      { dx: 0, dy: 1, kind: 'strong', phase: 0 },
    ],
    output: { dx: 9, dy: 0, kind: 'strong', phase: 3 },
    latency: 9,
  },
  NOT: {
    name: 'NOT',
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
    inputs: [{ dx: 0, dy: 3, kind: 'strong', phase: 2 }],
    output: { dx: 10, dy: 0, kind: 'strong', phase: 0 },
    latency: 0,
  },
};

export function stamp(sim, template, x, y) {
  for (const cell of template.cells) {
    const state = cell.state ? STATE_MAP[cell.state] : CONDUCTOR;
    sim.set(x + cell.dx, y + cell.dy, cell.kind, state);
  }
  return {
    template,
    inputs: template.inputs.map((p) => ({ x: x + p.dx, y: y + p.dy, kind: p.kind, phase: p.phase })),
    output: { x: x + template.output.dx, y: y + template.output.dy, kind: template.output.kind, phase: template.output.phase },
    latency: template.latency,
  };
}

export function buildSim(width = 80, height = 40) {
  return new WireworldPP(width, height);
}
