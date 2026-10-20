# tools-execute

`execute`: a script whose functions are the registered tools, so one call can chain calls and filter their results.

Status: built

## Requires

- `SessionLog`
- `ToolPipeline`, `Tools`

## Requirements

- `execute` takes `code` and a required `timeout` in seconds, up to 3600; the script runs in `@opencode/codemode`
- The description gives the built-in `search` in one line
- The script's functions are the registered tools by the same names and params, other than `execute` and `checks`
- Each function call is an inner call through `ToolPipeline` with the outer call's id; checks, approvals and output spill judge it
- The repeat guard sees only the model's calls; the checks fix wrapper skips inner calls
- Inner calls of tools that cannot run alongside others wait for each other
- Each inner call is saved as a hidden `session-log/inner-call` entry and drawn under its outer call's row
- A failed or denied inner call throws in the script; an uncaught error fails the `execute` call
- The row reads `Execute`, with the chat's running arc and a shimmering label while the call forms and runs; it shows no script
- Each inner call draws under the row as its own row, never joined with its neighbours; opened, the row shows the script and its output
- Console logs are cut only when the script ends

## References

- Tau `src/sandbox/Sandbox.ts`, `src/core/internal/run-tool/run-tool.ts`
- OpenCode `packages/core/src/codemode/tool.ts`, `instructions.ts`
