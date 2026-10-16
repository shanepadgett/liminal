# Instructions

- Every change to `AGENTS.md` or `docs/instructions/` needs the user's approval. Show the exact text and wait. A direct request from the user to make that change is the approval.

## AGENTS.md

- It holds the instructions table and rules that apply to all work. Nothing else.
- Each rule is one or two plain sentences. No nested lists.
- A rule that applies to one area goes in that area's instruction file.
- Remove rules that no longer apply. Do not add rules for completeness.

## Instruction files

- Write only what a check cannot enforce.
- Exception: a checked rule that agents often break may get a one-line note when knowing it first saves a failed check cycle. List these under "Checked".
- When a rule becomes checkable, add the check and delete the rule.
- One file per area, split by code boundary or kind of work.
- A file holds only its rules. When to read it lives in the table.
- "Read when" names an action ("Writing or changing X"), never a topic.
- Add or remove the table row in the same change that adds or deletes the file.
- One rule per bullet, imperative, plain words. State the rule, not its history or reason. Add an example only when the rule is unclear without one.
- Each rule lives in one file. Search for an existing home before adding one.
