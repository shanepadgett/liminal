# @shanepadgett/liminal-history

The messages each model call sends, built from the session log.

- `Converters`: one converter per event kind turns its events into model messages. An event kind with no converter, such as `session/notice`, never reaches the model. Of two converters for one kind, the one added last is used.
- `defineConverter(EventKind, (data) => Message[])`: a converter that reads each event's data with its kind's schema.
- `History`: the pipeline from the log's events to the messages, in log order. An event whose data its schema rejects fails it with `EventInvalid`.

Adds the converter for `session/message`, which sends the message as logged.

Requires nothing.

## Send a plugin's events to the model

```ts
const Reminder = defineEvent("memory/reminder", Schema.Struct({ text: Schema.String }));

yield* (yield* Converters).add(
  defineConverter(Reminder, ({ text }) => [{ role: "user", parts: [{ type: "text", text }] }]),
);
```

Back-to-back user messages are fine; Effect AI's Anthropic provider joins them.

Wrap `History` to change the messages of every call, such as leaving out events before a summary.
