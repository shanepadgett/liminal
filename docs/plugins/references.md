# references

Read-only git clones of other repositories, kept in Liminal's data folder. A session attaches some; the model is told where they are, and `@` tags reach them and their files.

Status: built

## Provides

- None

## Requires

- `SessionLog`, `EntryKinds`, `PromptSections`; uses `TagSources`

## Adds

- `references/attached` entries, hidden and not sent to the model
- The `/references` dialog and the sidebar's References section

## Requirements

### Library

- Clones live at `<data>/references/<name>`, the name taken from the URL's last part
- A clone runs into an unfinished `.clone-<name>-<time>` folder and is renamed when git is done; a failed clone removes it
- A clone silent for 3 minutes is stopped
- A failure says git's `fatal:` or `error:` line
- Each clone's description is GitHub's, saved at clone time and filled in at server start, else its README's first prose line

### Dialog

- `/references` lists every clone with its description and branch; the session's attached ones are marked
- Space marks, enter attaches the marked ones, ctrl+n clones a URL, ctrl+u pulls every clone, ctrl+r switches branch, ctrl+o opens in `$VISUAL`, `$EDITOR` or `code`, ctrl+x deletes after a confirm
- Progress, a check or git's error line shows at the row's right
- Deleting an attached clone takes it off the session

### Session

- Attaching saves a `references/attached` entry and creates the session when it has no entries yet
- The prompt section at order 230 names the attached clones whose folder still exists
- The sidebar's References section, at order 40, lists the attached names while there are any

### Tags

- The tag source at order 10 lists clones as `reference` rows tagged `~/<data path>/references/<name>/`; tab opens one to list its files
- The files source attaches a tagged folder's listing or picture

## References

- Tau `src/core/References.ts`, `src/host/References.ts`, `src/host/internal/{git-clone.ts,git-run.ts,reference-description.ts}`, `src/tui/internal/references-picker.ts`
