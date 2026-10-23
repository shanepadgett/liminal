# @shanepadgett/liminal-tool-definitions

What the model is told about each tool, and the tool list each model call sends.

- `ToolDefinitions`: the pipeline from a `Tool` to the name, description and input shape the model sees. Wrap it to change a description without replacing the tool.
- `ToolList.sync(session)`: logs the tool list if the session has none. Otherwise it logs a `tool-definitions/change` record with the tools added or changed and the tools removed, and the model gets a note naming them.
- `ToolList.current(events)`: the tools the log says the model is sent. A removed tool is still sent until the next fold, so the provider's cache holds; the note tells the model not to call it.
- `ToolList.fold(session)`: logs the full list again from the current tools.
- `ToolList.offer(session, names)`: logs a change adding the deferred tools `names`; nothing for those offered already.
- `ToolList.withdraw(session, names)`: logs a change removing the tools `names`; nothing for those not offered.

Deferred tools are left out of the list until offered, and a fold leaves offered ones out again. Each change reaches the model as a `tool-change` part in a user message. A call to a tool the session is not offered fails with `X is not available now. Call only the tools in your tool list.`

Requires `Tools`, `ToolCall`, `SessionLog` and `Converters`.
