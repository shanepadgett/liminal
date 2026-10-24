# Vocabulary

The project's agreed product terms, in every system prompt, read and changed through a `vocabulary` tool. It works like the Tau vocabulary tool, with the file in `.liminal/`.

## Shape

```text
 .liminal/vocabulary.json ──▶ store (read, change under a lock)
                                 │                 │
             `vocabulary` section (order 30)   `vocabulary` tool
                                 │                 │
                          system prompt       approvals (write access on changes)
```

- One plugin, `packages/plugins/vocabulary`, no `tui` entry: the plain tool row shows the call.
- File: `<workspace>/.liminal/vocabulary.json` (`Directories.project`), `{ "terms": [{ "term", "definition" }] }`, sorted by term ignoring case, written to a temporary file and renamed over the old one. Terms match ignoring case; a file listing a term twice is an error to fix by hand.
- Section `vocabulary`, order 30 (after skills): the term names and the rule to agree changes with the user first. Empty with no terms. A file that cannot be read logs a warning and the section is empty.
- Tool `vocabulary`, sequential, not deferred until `tools-search`: `operation` is `list`, `get`, `create`, `update` or `delete`, with `term`, `replacementTerm` (update) and `definition` (create, update). Text is put on one line with single spaces. `list` and `get` touch nothing; the others are a write to the file, so approvals sees them.
- Its description says to change terms only after the user clearly agrees, and to register product concepts, not code symbols or file names.

## Transfer

Copy the terms in `.pi/tau/vocabulary.json` to `.liminal/vocabulary.json` once the plugin is built. The Tau file stays, since Tau still reads it.
