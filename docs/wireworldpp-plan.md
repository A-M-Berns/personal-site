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
