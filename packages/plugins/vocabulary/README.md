# @shanepadgett/liminal-vocabulary

Vocabulary: the project's agreed product terms, so the model names things the way the user does.

The terms live in `.liminal/vocabulary.json` in the workspace as `{ "terms": [{ "term", "definition" }] }`, sorted by term ignoring case. Terms match ignoring case; a file that lists a term twice is an error to fix by hand. Each change is written to a temporary file and renamed over the old one.

- The `vocabulary` system prompt section, after skills, lists the term names and asks the model to agree changes with the user first. With no terms it is empty; a file that cannot be read logs a warning and leaves it empty.
- The `vocabulary` tool, sequential: `operation` is `list`, `get`, `create`, `update` or `delete`, with `term`, `replacementTerm` (update) and `definition` (create, update). Text is put on one line with single spaces. `list` and `get` touch nothing; the other operations count as a write to the file for approvals.

Requires `Sections`, `Tools`, `Directories`, `FileSystem` and `Path`.
