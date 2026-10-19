# skills

Agent Skills folders, `<name>/SKILL.md`: the model sees a list and reads a skill when its task comes up; the user starts one with `/<name>` or tags it with `@skill:<name>`.

Status: built

## Provides

- RPCs: `skills/list`, `skills/use`
- Prompt section `skills/list` at order 300
- Tag source for `@skill:<name>` at order 20

## Requires

- `PromptSections`, `SessionLog`, `Inbox`; uses `TagSources`

## Adds

- TUI: one `/<name>` command per skill, palette category Skills

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
- The TUI lists skill commands once, when it starts
- `@skill:<name>` adds the skill's text to the message

## References

- Tau `src/core/internal/skills/skills.ts`, `docs/guide/instructions.md`
