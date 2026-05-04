import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PERIOD,
  compile,
  evalFormula,
  formulaText,
  mulberry32,
  randomFormula,
  simulateCompiled,
} from '../src/lib/wireworld-router.mjs';

function runFormula(formula, assignment) {
  const compiled = compile(formula, assignment);
  if (!compiled.ok) return { ok: false, reason: compiled.reason };
  const sim = simulateCompiled(compiled);
  return { ok: true, observed: sim.anySettled, expected: evalFormula(formula, assignment), text: formulaText(formula) };
}

test('compile: trivial leaf formula', () => {
  for (const value of [false, true]) {
    const formula = { kind: 'var', name: 'A' };
    const result = runFormula(formula, { A: value });
    assert.equal(result.ok, true);
    assert.equal(result.observed, result.expected, `leaf A=${value}: observed ${result.observed} expected ${result.expected}`);
  }
});

test('compile: AND of two leaves', () => {
  for (const a of [false, true]) {
    for (const b of [false, true]) {
      const formula = { kind: 'binary', op: 'AND', left: { kind: 'var', name: 'A' }, right: { kind: 'var', name: 'B' } };
      const result = runFormula(formula, { A: a, B: b });
      assert.equal(result.ok, true);
      assert.equal(result.observed, result.expected, `${result.text} A=${a} B=${b}: observed ${result.observed} expected ${result.expected}`);
    }
  }
});

test('compile: OR of two leaves', () => {
  for (const a of [false, true]) {
    for (const b of [false, true]) {
      const formula = { kind: 'binary', op: 'OR', left: { kind: 'var', name: 'A' }, right: { kind: 'var', name: 'B' } };
      const result = runFormula(formula, { A: a, B: b });
      assert.equal(result.ok, true);
      assert.equal(result.observed, result.expected, `${result.text} A=${a} B=${b}: observed ${result.observed} expected ${result.expected}`);
    }
  }
});

test('compile: NOT of a leaf', () => {
  for (const value of [false, true]) {
    const formula = { kind: 'not', child: { kind: 'var', name: 'A' } };
    const result = runFormula(formula, { A: value });
    assert.equal(result.ok, true);
    assert.equal(result.observed, result.expected, `NOT A=${value}: observed ${result.observed} expected ${result.expected}`);
  }
});

test('compile: nested (A AND B) OR C', () => {
  const formula = {
    kind: 'binary', op: 'OR',
    left: { kind: 'binary', op: 'AND', left: { kind: 'var', name: 'A' }, right: { kind: 'var', name: 'B' } },
    right: { kind: 'var', name: 'C' },
  };
  for (const a of [false, true]) {
    for (const b of [false, true]) {
      for (const c of [false, true]) {
        const result = runFormula(formula, { A: a, B: b, C: c });
        assert.equal(result.ok, true, `route should succeed`);
        assert.equal(result.observed, result.expected, `${result.text} A=${a} B=${b} C=${c}`);
      }
    }
  }
});

test('compile: nested (A OR B) AND C', () => {
  const formula = {
    kind: 'binary', op: 'AND',
    left: { kind: 'binary', op: 'OR', left: { kind: 'var', name: 'A' }, right: { kind: 'var', name: 'B' } },
    right: { kind: 'var', name: 'C' },
  };
  for (const a of [false, true]) {
    for (const b of [false, true]) {
      for (const c of [false, true]) {
        const result = runFormula(formula, { A: a, B: b, C: c });
        assert.equal(result.ok, true, `route should succeed`);
        assert.equal(result.observed, result.expected, `${result.text} A=${a} B=${b} C=${c}`);
      }
    }
  }
});

test('compile: random 4-leaf AND/OR formulas (no NOT) match Boolean semantics', () => {
  let routed = 0;
  let failed = 0;
  for (let trial = 0; trial < 30; trial++) {
    const rng = mulberry32(trial * 17 + 1);
    const names = ['A', 'B', 'C', 'D'];
    const assignment = Object.fromEntries(names.map((n) => [n, rng() < 0.5]));
    const formula = randomFormula(4, names, rng, { allowNot: false });
    const result = runFormula(formula, assignment);
    if (!result.ok) {
      failed++;
      continue;
    }
    routed++;
    assert.equal(result.observed, result.expected, `trial ${trial}: ${result.text} with ${JSON.stringify(assignment)} observed=${result.observed} expected=${result.expected}`);
  }
  assert.ok(routed >= 25, `at least 25/30 trials should route; got ${routed} routed, ${failed} failed`);
});
