# @shanepadgett/liminal-skills

Skills: folders of instructions the model reads when a task matches, and the user tags with `$name`.

A skill is a direct child folder of a skills folder that holds `SKILL.md`; symlinks are followed and names starting with `.` are skipped. The skills folders, farthest first: `~/.agents/skills`, `~/.liminal/skills`, then `.agents/skills` and `.liminal/skills` in each folder from the repository root down to the workspace. The nearest skill of a name wins, and one file reached two ways counts once. Front matter parses with `Bun.YAML`: `description` is required, `name` defaults to the folder's name, and `disable-model-invocation: true` keeps a skill off the prompt's list. A skill without a description, or whose front matter does not parse, is skipped with a logged warning. Skills are found again on each use, so a new or changed skill shows without a restart.

- The `skills` system prompt section, after the instruction files, lists each skill's name, description and `SKILL.md` path. With no listed skills it is empty.
- Wraps `loop/Send`: for each `$name` in a user message that names a skill, a text part after the user's text holds `SKILL.md` without its front matter, read at send, inside `<skill name="…" path="…">`, counted in `loop/added`. A skill already in what `History` sends the model is not sent again.
- Adds each skills folder to `AllowedFolders` for reading.
- `skills/list`: each skill's name and description.
- `skillsIn(text)`: the skill names written in a draft as `$name` where a word starts.

Requires `loop/Send`, `Sections`, `AllowedFolders`, `History`, `SessionLog`, `Directories`, `FileSystem` and `Path`.

## TUI

The `tui` entry adds the `$` draft trigger to chat's `DraftTriggers`: `$` at the start of the draft or after whitespace opens the list of skills, loaded each time it opens. With nothing typed the rows go by name; otherwise by their `fuzzysort` match, 50 at most. Enter or Tab writes `$name` as a mark with `writeMark`.

The entry requires `Host`, `Colors` and `DraftTriggers`.
