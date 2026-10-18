---
read-when: writing or changing a file in `docs/guides/`
---

# Guides

## Scope

- One guide per job a builder does, such as writing a plugin or a provider. Add a guide only for a new job; a new concept gets a section in the guide for its job.
- Each concept lives in one guide. Elsewhere, link to its section.
- Describe only what is built. No plans, history or "coming soon".
- A change that adds or changes an extension point, an SDK export, or a contract other plugins build on updates its guide section in the same change.
- Add or remove the guide's row in `docs/guides/_index.md` in the same change.

## Shape

- Open with one or two sentences: what the job produces and when to do it.
- Headings name tasks in the imperative ("Register a tool"), not topics ("Tools").
- A section gives the steps, the rules, and one short example. Numbered steps for a sequence; a single bullet for a one-step task.
- End a section with the built files that show it, as paths. End the guide with links to related guides.
- Keep a guide under 400 lines. Split by job, never by size alone.

## Writing

- Write in second person, present tense, active voice.
- Use the exact names from the code: services, functions, fields, file paths.
- Example code matches the real API and stays under 25 lines. Copy the shape from a built plugin and cut what the point does not need.
- Use a table for parallel facts, such as a registry list or option fields.
- Cut meta-language: no "this guide", "this section", "note that", "it's important", "overview", "summary" or "in conclusion".
- Cut reasons a builder does not act on. Give a reason only when it changes what the builder writes.
