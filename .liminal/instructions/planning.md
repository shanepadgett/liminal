---
read-when: Planning work, in chat or in `docs/plans/`
---

# Planning

## Investigation

- Investigate before proposing. Read the code the work touches and show how it works today in a diagram or table.
- Search the workspace for shared capabilities first. For each new piece, name the existing function, service, type or plugin it reuses or extends, or say where you looked and why nothing fit.
- Extend a close fit instead of adding a parallel one. If the existing shape resists the work, plan the restructure as a prep step.
- Lean on dependencies. Read their docs in `docs/reference/copies/` and name the module and function that provides each capability. Name no API you did not find there or in the installed types.
- For each new piece, search the reference repositories for prior art. Cite what you studied.
- Own the code by default. Propose a new dependency only when building the piece would take thousands of lines, and state the size of the work.

## Shape

- A plan fits in one to two pages and is mostly diagrams, tables and trees. Prose only for a decision, a tradeoff or a question.
- Lead each section with the decision or the shape. Reasons follow in short sentences.
- Present each decision in plain terms: the real options, a recommendation, and why it beats the others.
- Say in a few words what each system, file or term is on first use.
- Name what the change deletes or replaces. A plan that only adds code is incomplete.

## Rounds

- Plan in rounds. Each round asks a small batch of related decisions.
- Lasting plans live in `docs/plans/`, one file per piece of work. Record each agreed decision in the plan file in the same reply; a correction rewrites the affected part.
- Once a plan's work is built and verified, move its file to `docs/plans/_archive/` and fix its links.

## Architecture plans

- Name each system involved and whether the work adds, changes or expands it.
- Show boundaries as a Mermaid diagram: one idea per diagram, 5 to 9 boxes, short labels.
- Name the pattern chosen (state machine, events, middleware, layers) and the alternative it beat.
- Stop at interfaces. No implementation code.

## Code-level plans

- File layout as a tree, with a one-line purpose for each new or changed file.
- Types at each boundary as TypeScript signatures: services, errors, schemas.
- The call path from entry point to leaves as a Mermaid sequence diagram or flowchart.
- Logic as pseudocode: one action per line, domain names.
- Show which layer provides which service. When production and tests differ only by that injection, show both.
