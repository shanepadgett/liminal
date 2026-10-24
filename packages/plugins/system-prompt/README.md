# @shanepadgett/liminal-system-prompt

The system prompt each model call sends, built from sections other plugins add.

- `Sections`: the sections, lowest `order` first. A section has a `name` and a function from the session to an effect that returns its text; empty text leaves it out.
- `SystemPrompt.sync(session)`: logs the whole prompt if the session has none. Otherwise it logs a `system-prompt/change` record with each section whose text changed or that was removed, and the model gets a note with the new text.
- `SystemPrompt.current(events)`: the prompt the log says the model is sent. It changes only at a fold, so the provider's cache holds.
- `SystemPrompt.fold(session)`: logs the whole prompt again from the current sections. It wraps `History` so change records before the latest whole prompt drop out, since that prompt holds them.

Requires `SessionLog`, `Converters` and `History`.

## Add a section

```ts
yield* (yield* Sections).add(
  { name: "project", text: () => Effect.succeed("This project uses Bun.") },
  { order: 10 },
);
```

A section's text is read before each model call, so it can change during a session.

## Replace a section

Leave out the plugin that adds it and add a section with the same name.
