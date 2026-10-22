# @shanepadgett/liminal-tools

The tools the model can call and the one path every tool call takes.

- `Tools`: the registry tool plugins add to. Of two tools with one name, the one added last is used, so adding a tool with a taken name replaces it.
- `defineTool({ name, description, input, run })`: a tool whose params `input` checks before `run` sees them. The model sees `input` as JSON Schema. The description says when and how to use the tool. Optional marks: `deferred`, shown by name only until a result loads it; `sequential`, which makes every call in its reply run one after another.
- `ToolCall`: the pipeline every call runs through. It returns a `ToolResult`. Wrong params, a `ToolFailed`, an unknown tool name or a crash come back as a failed result the model sees.
- `ToolContext`: the session, the call id and the attributes of the latest input the turn consumed.

Requires nothing.

## Add a tool

```ts
const add = defineTool({
  name: "add",
  description: "Adds two numbers.",
  input: Schema.Struct({ a: Schema.Finite, b: Schema.optionalKey(Schema.Finite) }),
  run: ({ a, b = 0 }) => Effect.succeed({ result: a + b }),
});

yield* (yield* Tools).add(add);
```

- Use `Schema.Finite` for numbers and `Schema.optionalKey` for optional fields. `Schema.Number` adds `"NaN"` and `"Infinity"` strings to the JSON Schema, and `Schema.optional` adds `null`.
- A tool with no params uses `Tool.EmptyParams` from `effect/ai`; an empty `Schema.Struct` is not a JSON object schema.
- Fail with `ToolFailed` for a failure the model should read. A result's `loads` names the deferred tools it loads.

Habits that span several tools, such as preferring `read` over `cat`, go in a `system-prompt` section the tool's plugin adds.

Wrap `ToolCall` to see or change every call, such as asking before a call runs.
