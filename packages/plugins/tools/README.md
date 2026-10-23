# @shanepadgett/liminal-tools

The tools the model can call and the one path every tool call takes.

- `Tools`: the registry tool plugins add to. Of two tools with one name, the one added last is used, so adding a tool with a taken name replaces it.
- `defineTool({ name, description, input, run })`: a tool whose params `input` checks before `run` sees them. The model sees `input` as JSON Schema. The description says when and how to use the tool. Optional marks: `deferred`, left out of a session's tools until a plugin offers it through `ToolList.offer`; `sequential`, which makes every call in its reply run one after another.
- `access(input)` on `defineTool` says what a call touches, for approvals: `{ kind: "read", paths }`, `{ kind: "write", paths }`, or `runAccess` for a call that runs things. A tool without it, or params that fail to decode, count as `runAccess`; `noAccess` is a read of no paths, for a tool that touches nothing.
- `ToolCall`: the pipeline every call runs through. It returns a `ToolResult`. Wrong params, a `ToolFailed`, an unknown tool name or a crash come back as a failed result the model sees.
- `ToolOutput`: what a finished call returns. `content` holds text and image parts; the model reads the text as the result, and images reach models that take them.
- `ToolContext`: the session, the call id, the attributes of the latest input the turn consumed, and `progress(data)`, which shows the call's progress while it runs.
- `ToolProgress`: the delta `progress` publishes, `{ callId, data }`. It is not saved, and a frontend draws only the latest, so `data` holds the whole progress so far. The tool's own row decodes `data`.

Requires `SessionLog`.

## Add a tool

```ts
const add = defineTool({
  name: "add",
  description: "Adds two numbers.",
  input: Schema.Struct({ a: Schema.Finite, b: Schema.optionalKey(Schema.Finite) }),
  run: ({ a, b = 0 }) => Effect.succeed({ content: [{ type: "text", text: String(a + b) }] }),
});

yield* (yield* Tools).add(add);
```

- Use `Schema.Finite` for numbers and `Schema.optionalKey` for optional fields. `Schema.Number` adds `"NaN"` and `"Infinity"` strings to the JSON Schema, and `Schema.optional` adds `null`.
- A tool with no params uses `Tool.EmptyParams` from `effect/ai`; an empty `Schema.Struct` is not a JSON object schema.
- Fail with `ToolFailed` for a failure the model should read.

Habits that span several tools, such as preferring `read` over `cat`, go in a `system-prompt` section the tool's plugin adds.

Wrap `ToolCall` to see or change every call, such as asking before a call runs.
