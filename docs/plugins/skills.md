# skills

Agent Skills folders, `<name>/SKILL.md`: the model sees a list and reads a skill when its task comes up; the user starts one with `/<name>` or tags it with `@skill:<name>`.

Status: built

## Provides

- RPCs: `skills/list`, `skills/use`, `skills/inventory`, `skills/delete`
- Prompt section `skills/list` at order 300
- Tag source for `@skill:<name>` at order 20

## Requires

- `PromptSections`, `SessionLog`, `Inbox`; uses `TagSources`

## Adds

- TUI: one `/<name>` command per skill and Manage skills in the palette

## Requirements

### Finding skills

- Skills are read from `~/.agents/skills` and the global `skills/` folder, then, in a trusted workspace, `.agents/skills` and `.liminal/skills` from the repository root down to the workspace
- Only folders in a skills folder are skills; files there, such as `.DS_Store`, are ignored
- A nearer skill replaces a farther one of the same name
- Front matter needs `description`; `name` defaults to the folder name and must be one word
- A skill without front matter or a description is skipped and told to the session once
- Every use scans again

### Using skills

- The model's list gives each skill's name, path and description; it reads `SKILL.md` with the read tool
- `disable-model-invocation: true` leaves the skill out of the model's list only
- `/<name> args` sends the skill's text, then the args, as the user's message; the transcript shows `/<name> args`
- A skill whose name another command has gets no command
- The TUI lists skill commands at startup and refreshes them when the manager refreshes or deletes a skill
- `@skill:<name>` adds the skill's text to the message

### Managing skills

- The main palette lists one Manage skills command, not individual skills
- The manager groups physical skills by every discovery source folder, including global and project `.agents/skills`, Liminal skills folders and trusted ancestor folders
- The manager includes overridden copies, malformed skill folders and broken symlinks without changing invocation precedence
- Ordinary folders have no type label; symlinks show Symlink and identify missing targets
- Skill descriptions appear beside names in muted, single-line text with ellipses instead of in the bottom details section
- The manager uses the Sessions dialog width of 90 columns, capped by the terminal width
- Skill folders can be permanently deleted after confirmation
- Symlinks offer Delete symlink only and Delete symlink and target
- Broken symlinks offer only link deletion
- Confirmation defaults to Cancel and shows the selected path, target and permanent-deletion warning
- Global deletion shows a global-scope warning
- No additional warning appears below Delete symlink and target
- The approved gallery includes empty and deletion-failure states

## References

- Tau `src/core/internal/skills/skills.ts`, `docs/guide/instructions.md`
