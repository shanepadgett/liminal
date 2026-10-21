# Docs

- `docs/_index.md` lists what each docs folder holds. Update it when you add, move or delete a doc.
- When the user agrees to something, record it in the same reply: design in `docs/architecture.md`, plugin work in its `docs/plugins/` file, focus, next steps and open questions in `docs/status.md`. Record nothing else: no discussion, reasoning or research notes.
- Keep `docs/status.md` current so the next chat knows where to start.
- Docs state only what is true now. No history or status words such as "decided", "agreed" or "replaces". Unsettled items go in an `Open` section.
- Agree on the purpose of a new doc with the user before creating it.
- Write just enough for the reader to act. Plain formats, no meta text about the doc itself.
- Fold new information into the existing doc and tidy it; do not split a topic across many small files.
- Update `docs/guides/` and `docs/usage/` in the same change as the code that makes a feature available to plugin authors or users.
- No paths from a personal machine in docs.

## Guides and usage

- Guides are for plugin authors; usage docs are for people using the CLI, TUI and desktop app.
- One guide per job a builder does, such as writing a plugin or a provider. A new concept gets a section in the guide for its job.
- Describe only what is built and shipped.
- Headings name tasks in the imperative ("Register a tool"). A section gives the steps, the rules and one short example under 25 lines that matches the real API.
- Use the exact names from the code. Write in second person, present tense, active voice.
- Add or remove a doc's row in `docs/guides/_index.md` or `docs/usage/_index.md` in the same change.
