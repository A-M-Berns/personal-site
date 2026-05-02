# Wireworld++ Formalization Animation Plan

## Current Standard

The Formalization page should not fake Boolean evaluation with JavaScript and then draw decorative wires. The animation should use the Wireworld++ cellular automaton directly:

- Empty cells stay empty.
- Strong conductor becomes strong head when it has one or two strong-head neighbors, or exactly two weak-head neighbors.
- Strong head becomes strong tail.
- Strong tail becomes strong conductor.
- Weak conductor becomes weak head when it has one or two weak-head neighbors, or exactly one strong-head neighbor.
- Weak head becomes weak tail.
- Weak tail becomes weak conductor.
- Neighborhood is the Moore neighborhood.

These rules are from Vladislav Gladkikh and Alexandr Nigay, "Wireworld++: A Cellular Automaton for Simulation of Nonplanar Digital Electronic Circuits," Complex Systems 27, 2018.

## Current Implementation

`src/pages/formalization/index.astro` now runs the local Wireworld++ update rules rather than scheduling gate outputs from a separate formula evaluator.

The live page uses small paper-derived primitives:

- `AND`: two strong input signals create two weak heads, which trigger a strong output by the "exactly two weak heads" rule.
- `OR`: two strong inputs merge into a strong output by the ordinary strong conductor rule.
- `XOR`: two strong inputs touch a weak output conductor; exactly one strong head triggers the weak output, while two simultaneous strong heads do not.

This is intentionally less ambitious than an arbitrary formula compiler. It is preferable to show fewer, honest primitives than a large circuit whose displayed truth value is computed somewhere else.

## Verification Pass

Run:

```sh
npm run test:wireworldpp
```

This script simulates the local Wireworld++ rules directly. It currently verifies:

- Truth tables for the primitive `AND`, `OR`, and `XOR` structures used by the page.
- A transcribed Figure 19-style `NOT` oscillator/quench pattern. With no input it produces an output stream; with an input stream at the tested phase, the output is quenched after startup.
- Two composed formulas:
  - `(A AND B) OR C`
  - `(A OR B) AND C`

The second composed formula is the important warning case: it only works after adding a 13-tick delay to the direct `C` input. That confirms the core routing problem is not Boolean expression parsing; it is phase alignment.

## Routing Assessment

Full arbitrary routing is feasible, but it should be treated as a small circuit compiler rather than a drawing problem.

The easy part:

- Generating random Boolean formulas.
- Assigning each gate a verified primitive template.
- Drawing orthogonal strong/weak wires.
- Testing final output pulses against the formula truth table.

The hard part:

- Tracking signal kind at every port. The current `XOR` primitive emits weak signal, while the current `AND`/`OR` primitives consume strong signals.
- Inserting bridge templates when a weak output must feed a strong input, or vice versa.
- Computing path lengths and inserting delay lines so multi-input gates receive correctly phased signals.
- Avoiding accidental Moore-neighborhood coupling between nearby wires and gate bodies.
- Choosing crossings only when the signal period and channel assumptions match the paper's constraints.

Recommended next increment:

1. Extract gate definitions into data templates with explicit input ports, output ports, signal kinds, and latency.
2. Add tests for each template in isolation.
3. Add a tiny compiler for formulas using only strong-output gates first: `AND` and `OR`.
4. Add automatic delay-line insertion.
5. Add `NOT`.
6. Add type converters and then reintroduce `XOR`.

## Routing Assessment Update

Real routing looks medium-hard, not scary-hard, if we deliberately restrict the first target.

The useful abstraction is a VLSI-style two-phase router:

1. Global layout: place the formula tree left-to-right in generously spaced lanes.
2. Detailed routing: connect ports on a grid with obstacle-aware rectilinear paths.

For the detailed route, Lee-style maze routing is the right starting point: breadth-first search over the grid from a source port to a target port, then backtrace the path. That is not sophisticated, but it is deterministic, easy to test, and good enough for the site-scale grid.

The first arbitrary-formula version should make these restrictions:

- Only route tree-shaped formulas, not DAGs with fanout.
- Only use `AND` and `OR` at first, because they consume and emit strong signals.
- Keep gates far apart; reserve padded bounding boxes around every primitive.
- Route one net at a time, marking used path cells as obstacles.
- Insert Manhattan delay loops to align arrival phases at binary gates.
- Reject and reseed any formula/layout that cannot route cleanly.

This should be implementable in a few focused passes:

1. Template extraction and port metadata.
2. Isolated template tests.
3. Formula tree placement.
4. BFS path routing with obstacles.
5. Delay insertion and simulation tests.
6. Visual integration.

The hard version is substantially larger: `NOT`, `XOR`, weak/strong conversion, crossings, fanout, and compact layout all interact with signal kind and phase. Crossings in the Wireworld++ paper are excellent, but they have period/channel assumptions; they should not be used as a generic router escape hatch until the compiler can track signal period and occupancy.

## Next Work

1. Extract reusable gate templates from Figures 16-20 of the paper.
2. Store each primitive as a small coordinate template with ports, latency, signal kind, minimum period, and allowed input phases.
3. Add a deterministic test harness that runs each template for all input assignments and asserts observed output pulses.
4. Build a typed circuit compiler that only composes compatible ports:
   - strong-to-strong,
   - weak-to-weak,
   - strong-to-weak bridges,
   - weak-pair-to-strong joins.
5. Add delay lines so composed gates receive simultaneous inputs when a primitive requires phase alignment.
6. Reintroduce randomly generated formulas only after compiled layouts are verified by simulation, not by a separate Boolean label.
7. Keep the on-page text honest: if a cycle is showing primitive gates, call them primitives; if it is showing a compiled formula, display the formula.

## Visual Constraints

- Keep the bus close to the left edge.
- Do not draw grid lines.
- Inactive wire color must depend only on state kind, not on future or previous activation.
- Active strong/weak heads should use the selected site palette.
- Labels should remain white bitmap text.
- Do not reintroduce subformula emitters or scheduled gate pulses.
