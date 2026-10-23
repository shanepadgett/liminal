# @shanepadgett/liminal-tool-output

Keeps long tool output out of the context. Wraps `tools/ToolCall`: when a result's text, failures included, is over 2,000 lines or 50 KB, the model gets the first and last halves with a line between them:

```text
[Output cut: 12,480 lines, 1.2 MB. Whole output: <temp>/liminal-tool-output/<session>/<call>.txt; read it with offset.]
```

The whole text is saved at `liminal-tool-output/<session>/<call id>.txt` in the system temp folder, where approvals lets `read` open it, the folder readable only by you (`0700`) and the file too (`0600`). At start, session folders unchanged for 7 days are removed. Image parts pass through uncut.

`read` pages within the same limits, so its results pass through whole.

Requires `ToolCall`, `FileSystem` and `Path`.

## Replace it

Leave `tool-output` out of the composition and wrap `ToolCall` with another cut.
