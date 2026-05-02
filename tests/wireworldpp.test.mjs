import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONDUCTOR,
  HEAD,
  TAIL,
  WireworldPP,
  addPrimitiveGate,
  boolGate,
  evalFormula,
  formulaAndThenOr,
  formulaOrThenAnd,
  notResult,
  primitiveResult,
  routeStrongOnlyFormula,
} from '../src/lib/wireworldpp-core.mjs';

const assignments3 = [];
for (const A of [false, true]) {
  for (const B of [false, true]) {
    for (const C of [false, true]) assignments3.push({ A, B, C });
  }
}

test('strong Wireworld rules preserve empty and cycle head/tail/conductor', () => {
  const sim = new WireworldPP(18, 18);
  sim.set(8, 8, 'strong', HEAD);
  sim.step();
  assert.equal(sim.get(8, 8, 'strong'), TAIL);
  sim.step();
  assert.equal(sim.get(8, 8, 'strong'), CONDUCTOR);
  assert.equal(sim.get(4, 4, 'strong'), 0);
});

test('strong conductor fires from one or two strong heads, not three', () => {
  for (const count of [1, 2, 3]) {
    const sim = new WireworldPP(18, 18);
    sim.set(8, 8, 'strong', CONDUCTOR);
    for (let i = 0; i < count; i++) sim.set(7 + i, 7, 'strong', HEAD);
    sim.step();
    assert.equal(sim.get(8, 8, 'strong'), count <= 2 ? HEAD : CONDUCTOR);
  }
});

test('Wireworld++ cross coupling follows the paper rules', () => {
  const strong = new WireworldPP(18, 18);
  strong.set(8, 8, 'strong', CONDUCTOR);
  strong.set(7, 8, 'weak', HEAD);
  strong.step();
  assert.equal(strong.get(8, 8, 'strong'), CONDUCTOR, 'one weak head is not enough for strong');

  const strongTwoWeak = new WireworldPP(18, 18);
  strongTwoWeak.set(8, 8, 'strong', CONDUCTOR);
  strongTwoWeak.set(7, 8, 'weak', HEAD);
  strongTwoWeak.set(9, 8, 'weak', HEAD);
  strongTwoWeak.step();
  assert.equal(strongTwoWeak.get(8, 8, 'strong'), HEAD, 'two weak heads trigger strong');

  const weak = new WireworldPP(18, 18);
  weak.set(8, 8, 'weak', CONDUCTOR);
  weak.set(7, 8, 'strong', HEAD);
  weak.step();
  assert.equal(weak.get(8, 8, 'weak'), HEAD, 'one strong head triggers weak');
});

test('straight wires carry signal to the output tap', () => {
  const sim = new WireworldPP(50, 20);
  sim.line(5, 10, 35, 10, 'strong');
  sim.source(5, 10, 1, 0, 'strong', true, 0, 18);
  const hits = sim.observe({ x: 35, y: 10, kind: 'strong' }, 80);
  assert.ok(hits.length > 0);
});

test('primitive gates satisfy truth tables under cellular dynamics', () => {
  for (const op of ['AND', 'OR', 'XOR']) {
    for (const a of [false, true]) {
      for (const b of [false, true]) {
        assert.equal(primitiveResult(op, a, b), boolGate(op, a, b), `${op}(${a}, ${b})`);
      }
    }
  }
});

test('primitive gate output signal kinds are explicit', () => {
  const sim = new WireworldPP(82, 32);
  assert.equal(addPrimitiveGate(sim, 'AND', 4, 10, true, true, 50).kind, 'strong');
  assert.equal(addPrimitiveGate(sim, 'OR', 4, 18, true, false, 50).kind, 'strong');
  assert.equal(addPrimitiveGate(sim, 'XOR', 4, 26, true, false, 50).kind, 'weak');
});

test('NOT candidate inverts by quenching an oscillator stream', () => {
  assert.equal(notResult(false), true);
  assert.equal(notResult(true), false);
});

test('delay alignment is required for composed AND after OR', () => {
  assert.equal(formulaOrThenAnd(true, false, true, 0), false, 'undelayed C misses the OR output');
  assert.equal(formulaOrThenAnd(true, false, true, 13), true, 'delayed C aligns with the OR output');
});

test('composed formulas match Boolean semantics', () => {
  for (const assignment of assignments3) {
    const andThenOr = { op: 'OR', left: { op: 'AND', left: 'A', right: 'B' }, right: 'C' };
    const orThenAnd = { op: 'AND', left: { op: 'OR', left: 'A', right: 'B' }, right: 'C' };
    assert.equal(formulaAndThenOr(assignment.A, assignment.B, assignment.C), evalFormula(andThenOr, assignment));
    assert.equal(formulaOrThenAnd(assignment.A, assignment.B, assignment.C), evalFormula(orThenAnd, assignment));
  }
});

test('routing contract: accepted routed formulas match Boolean semantics', () => {
  const formulas = [
    { op: 'OR', left: { op: 'AND', left: 'A', right: 'B' }, right: 'C' },
    { op: 'AND', left: { op: 'OR', left: 'A', right: 'B' }, right: 'C' },
  ];
  for (const formula of formulas) {
    for (const assignment of assignments3) {
      const routed = routeStrongOnlyFormula(formula, assignment);
      assert.equal(routed.ok, true);
      assert.equal(routed.observed, evalFormula(formula, assignment));
    }
  }
});

test('routing contract: unsupported signal kinds are rejected until converters exist', () => {
  const formula = { op: 'AND', left: { op: 'XOR', left: 'A', right: 'B' }, right: 'C' };
  const routed = routeStrongOnlyFormula(formula, { A: true, B: false, C: true });
  assert.equal(routed.ok, false);
  assert.equal(routed.reason, 'unsupported-signal-kind');
});

test('routing contract: unimplemented layouts fail closed', () => {
  const formula = {
    op: 'OR',
    left: { op: 'AND', left: 'A', right: 'B' },
    right: { op: 'AND', left: 'C', right: 'D' },
  };
  const routed = routeStrongOnlyFormula(formula, { A: true, B: true, C: false, D: true });
  assert.equal(routed.ok, false);
  assert.equal(routed.reason, 'layout-not-implemented');
});
