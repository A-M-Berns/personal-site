import assert from 'node:assert/strict';
import test from 'node:test';
import { CONDUCTOR } from '../src/lib/wireworldpp-core.mjs';
import { PERIOD, TEMPLATES, buildSim, stamp } from '../src/lib/wireworld-router.mjs';

function runBinaryGate(template, a, b) {
  const sim = buildSim(80, 30);
  const handle = stamp(sim, template, 4, 14);
  const tapX = handle.output.x + 16;
  sim.line(handle.output.x, handle.output.y, tapX, handle.output.y, handle.output.kind);
  for (let i = 0; i < handle.inputs.length; i++) {
    const port = handle.inputs[i];
    const enabled = i === 0 ? a : b;
    sim.source(port.x, port.y, 1, 0, port.kind, enabled, 0, PERIOD);
  }
  const tapDist = tapX - handle.output.x;
  const expectedFirstHit = handle.latency + tapDist;
  const observeUntil = expectedFirstHit + 3 * PERIOD;
  const hits = sim.observe({ x: tapX, y: handle.output.y, kind: handle.output.kind }, observeUntil);
  return { hits, expectedFirstHit };
}

function expectedTruth(name, a, b) {
  if (name === 'AND') return a && b;
  if (name === 'OR') return a || b;
  throw new Error(`unknown ${name}`);
}

for (const name of ['AND', 'OR']) {
  test(`${name}: truth table at period ${PERIOD}`, () => {
    for (const a of [false, true]) {
      for (const b of [false, true]) {
        const { hits, expectedFirstHit } = runBinaryGate(TEMPLATES[name], a, b);
        const truth = expectedTruth(name, a, b);
        if (truth) {
          assert.ok(hits.length >= 2, `${name}(${a},${b}) should pulse at least twice; got ${hits.length}`);
          assert.equal(hits[0], expectedFirstHit, `${name}(${a},${b}) first pulse timing`);
          for (let i = 1; i < hits.length; i++) {
            assert.equal(hits[i] - hits[i - 1], PERIOD, `${name}(${a},${b}) pulse spacing at i=${i}`);
          }
        } else {
          assert.equal(hits.length, 0, `${name}(${a},${b}) should not pulse; got ${hits.join(',')}`);
        }
      }
    }
  });
}

test('AND requires synchronous input arrival', () => {
  for (const skew of [1, 2, 3]) {
    const sim = buildSim(80, 30);
    const handle = stamp(sim, TEMPLATES.AND, 4, 14);
    const tapX = handle.output.x + 12;
    sim.line(handle.output.x, handle.output.y, tapX, handle.output.y, handle.output.kind);
    sim.source(handle.inputs[0].x, handle.inputs[0].y, 1, 0, handle.inputs[0].kind, true, 0, PERIOD);
    sim.source(handle.inputs[1].x, handle.inputs[1].y, 1, 0, handle.inputs[1].kind, true, skew, PERIOD);
    const hits = sim.observe({ x: tapX, y: handle.output.y, kind: handle.output.kind }, handle.latency + 12 + 3 * PERIOD);
    assert.equal(hits.length, 0, `AND(T,T) with skew ${skew} should not pulse`);
  }
});

test('OR fires on either input alone (single-input drive)', () => {
  for (const which of [0, 1]) {
    const sim = buildSim(80, 30);
    const handle = stamp(sim, TEMPLATES.OR, 4, 14);
    const tapX = handle.output.x + 12;
    sim.line(handle.output.x, handle.output.y, tapX, handle.output.y, handle.output.kind);
    sim.source(handle.inputs[which].x, handle.inputs[which].y, 1, 0, handle.inputs[which].kind, true, 0, PERIOD);
    const tapDist = tapX - handle.output.x;
    const hits = sim.observe({ x: tapX, y: handle.output.y, kind: handle.output.kind }, handle.latency + tapDist + 3 * PERIOD);
    assert.ok(hits.length >= 2, `OR with only input ${which} should still pulse; got ${hits.length}`);
    assert.equal(hits[0], handle.latency + tapDist);
  }
});

test('NOT: free-running oscillator pulses when input is false', () => {
  const sim = buildSim(40, 24);
  const handle = stamp(sim, TEMPLATES.NOT, 5, 5);
  const tap = { x: handle.output.x, y: handle.output.y, kind: handle.output.kind };
  sim.source(handle.inputs[0].x, handle.inputs[0].y, 1, 0, handle.inputs[0].kind, false, handle.inputs[0].phase, PERIOD);
  const hits = sim.observe(tap, 60);
  assert.ok(hits.length >= 4, `NOT(false) should produce a free-running pulse stream; got ${hits.length} hits: ${hits.join(',')}`);
  for (let i = 1; i < hits.length; i++) {
    assert.equal(hits[i] - hits[i - 1], PERIOD, `NOT(false) pulse spacing at i=${i}`);
  }
});

test('NOT: input quenches output when input is true', () => {
  const sim = buildSim(40, 24);
  const handle = stamp(sim, TEMPLATES.NOT, 5, 5);
  const tap = { x: handle.output.x, y: handle.output.y, kind: handle.output.kind };
  sim.source(handle.inputs[0].x, handle.inputs[0].y, 1, 0, handle.inputs[0].kind, true, handle.inputs[0].phase, PERIOD);
  const allHits = sim.observe(tap, 96);
  const settledHits = allHits.filter((t) => t > 24);
  assert.equal(settledHits.length, 0, `NOT(true) should be quenched after startup; got post-startup hits ${settledHits.join(',')}`);
});

test('stamped templates respect declared latency at the output port', () => {
  for (const name of ['AND', 'OR']) {
    const template = TEMPLATES[name];
    const sim = buildSim(80, 30);
    const handle = stamp(sim, template, 4, 14);
    for (const port of handle.inputs) {
      sim.source(port.x, port.y, 1, 0, port.kind, true, 0, PERIOD);
    }
    const tap = { x: handle.output.x, y: handle.output.y, kind: handle.output.kind };
    const hits = sim.observe(tap, handle.latency + 2 * PERIOD);
    assert.ok(hits.length >= 1, `${name} output port should fire`);
    assert.equal(hits[0], handle.latency, `${name} declared latency must match measured`);
  }
});

test('output ports remain conductors after stamp (no accidental pre-charge)', () => {
  for (const name of ['AND', 'OR']) {
    const sim = buildSim(40, 20);
    const handle = stamp(sim, TEMPLATES[name], 4, 10);
    assert.equal(sim.get(handle.output.x, handle.output.y, handle.output.kind), CONDUCTOR);
  }
});
