# vocabulary

The project's agreed terms: stable names for its concepts, kept in a file, their names in the prompt and a tool to read and change them.

Status: built

## Requires

- `PromptSections`, `SessionLog`, `Tools`

## Adds

- The `vocabulary` tool
- The prompt section `vocabulary/terms`

## Requirements

- Terms are in `<project>/.liminal/vocabulary.json` as `{ "terms": [{ "term", "definition" }] }`; the file is created when the first term is saved
- A term is 1 to 80 characters and a definition 1 to 500, each on one line with single spaces; terms match whatever their case and are kept sorted
- The prompt section lists term names only, in the stable part of the prompt; later changes arrive as added and removed names
- The `vocabulary` tool has one `op`: `get` reads one term, or every term with its definition; `set` adds a term or replaces its definition, and with `was` renames a term; `remove` deletes a term
- Guidance in the system prompt: use the terms exactly; add or change one only after discussing the concept and definition with the user and the user clearly agreeing; a term names a product concept, not a code symbol or file name
- Writes are one at a time and finish by renaming a complete copy over the file
- A file that cannot be read or does not parse fails the tool, leaves the prompt section as it was and tells the session once
- In an untrusted folder the file is not read, the section is empty and writes are refused
- The tool is deferred: the model loads it through tool search
- The call reads as a work row: `Read`, `Saved term` or `Removed term`
- Approval modes apply to the tool as to any other
