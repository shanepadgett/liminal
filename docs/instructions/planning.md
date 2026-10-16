# Planning

## Investigation

- Investigate before proposing. Read the code the work touches and show how it works today in a diagram or table.
- Search the workspace for shared capabilities first. For each new piece, name the existing function, service, type or plugin it reuses or extends, or say where you looked and why nothing fit.
- Extend a close fit instead of adding a parallel one. If the existing shape resists the work, plan the restructure as a prep step.
- Lean on dependencies. Find the dependency in `docs/reference/copies/index.md`, read its docs and API there, and name the module and function that provides each capability. Propose new code only when the reference shows nothing that fits.
- Name no API you did not find in the reference or the installed types.
- Read the relevant reference repositories for how other harnesses solved the same problem. Cite what you studied.

## Shape

- A plan fits in one to two pages and is mostly visual: diagrams, tables, trees. Prose only for a decision, a tradeoff or a question.
- Lead each section with the decision or the shape. Reasons follow in short sentences.
- Assume the reader is new to the code. Say in a few words what each system, file or term is and where it lives on first use.
- State what the change lets the user or the code do before how it works.
- Name what the change deletes or replaces. A plan that only adds code is incomplete.

## Rounds

- Plan in rounds. Each round asks a small batch of related decisions.
- Lasting plans live in `docs/plans/`, one file per piece of work. Delete the file once the work is built and verified.
- Record each agreed decision in the plan file in the same reply. A correction rewrites the affected part; no history.
- Settled decisions that outlive the plan go in `DECISIONS.md`. Open questions and deferred items go in `TOPICS.md`.

## Architecture plans

- Name each system involved and whether the work adds, changes or expands it.
- Show boundaries as a Mermaid diagram: one idea per diagram, 5 to 9 boxes, short labels.
- Name the pattern chosen (state machine, events, middleware, layers) and the alternative it beat, with one line of tradeoff.
- When work would add another flag or special case to a growing set of states, propose a structure instead.
- Stop at interfaces. No implementation code.

## Code-level plans

- File layout as a tree, with a one-line purpose for each new or changed file.
- Types at each boundary as TypeScript signatures: services, errors, schemas.
- The call path from entry point to leaves as a Mermaid sequence diagram or flowchart.
- Logic as pseudocode: one action per line, domain names, indentation for nesting.
- Show where behavior is injected (which layer provides which service). When production and tests differ only by that injection, show both.
