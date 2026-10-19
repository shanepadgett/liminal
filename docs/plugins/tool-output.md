# tool-output

Cuts long tool output and saves the whole text to a file.

Status: built

## Requires

- `ToolWrappers`

## Requirements

- A result or failure message past 50,000 characters or 2,000 lines keeps its first and last halves, with a line naming the file that holds the whole text
- The whole text goes to `<tmpdir>/liminal/tool-output/<session>/<call>.txt`, readable only by the user
- Runs outermost, so it sees every call's final outcome, inner calls of `run` included
- Denials pass unchanged
- `LongOutput` fits any long text the same way, such as a checks report

## References

- Tau `src/proc/Output.ts`, `src/core/internal/output/output-files.ts`
