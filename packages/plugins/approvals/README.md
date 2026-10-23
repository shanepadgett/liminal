# @shanepadgett/liminal-approvals

Wraps `ToolCall` so a call runs only when it is safe or the user says yes. Each tool's `access` says what a call touches:

- `read` and `write` calls run when every path is inside an allowed folder, and fail otherwise with a pointer to `request_access`. A `write` call needs a folder allowed for changing.
- `run` calls, and calls to tools without `access`, go to a classifier, then a reviewer model, then the user.

The allowed folders are the `AllowedFolders` entries, then the folders the user allowed in the session. Approvals adds the workspace and the system temp folder for changing. Paths are compared after `~` is expanded and `realpath` resolves the nearest existing folder, so a symlink cannot lead outside.

The classifier answers three questions on `Models.classify`: does the call run code it does not show, where does its most consequential change land, and did the user ask for it. It allows the call when hidden code is at most 0.5, nothing or the workspace at least 0.8, and nothing at least 0.8 or asked at least 0.5. An input over 6,000 characters, no answer within 3 seconds or any failure sends the call on.

The reviewer is one `Models.generateObject` call on the `small` model with two tools: `session_search`, a literal search over the session's user messages and tool-call inputs, and the registered `read` tool, checked against the allowed folders. Neither sees the agent's own text or any tool result. It allows the call, or writes what the user is shown: a one-sentence summary, at most 5 effects and the risk. When it fails, the user is told no one checked the call.

The user approves or rejects, with an optional note the model reads. With `Unattended` set, as in print mode, nothing is asked: `yolo` runs every call unchecked, folders included, and without it a call that would ask the user is denied. Every judged call is logged as `approvals/decided`.

`request_access({ path, write, reason })` asks for a folder outside the allowed ones. It is judged the same way, and an allowed folder is logged as `approvals/granted` and stays allowed for the rest of the session.

The `tui` entry adds the two asks to questions' `AskViews`.

Requires `ToolCall`, `Tools`, `Models`, `Questions`, `SessionLog`, `Directories`, `FileSystem` and `Path`; the `tui` entry requires `AskViews`.

## Contract

- `Unattended`: the attribute print mode sets on its input, `{ yolo }`.
- `AllowedFolder` and `AllowedFolders`: add a folder for reading or changing, such as a references plugin's repositories.
- `Granted`, `Decided`: the events approvals logs.
- `Verdict`, `Change`, `Review`, `Answer`, `callQuestion`, `accessQuestion`: the reviewer's answer and the two asks.
- `requestAccessName`.

## Replace it

Leave approvals out of the composition to run every call unchecked, or wrap `ToolCall` with another policy.
