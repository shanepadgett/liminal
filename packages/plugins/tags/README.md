# @shanepadgett/liminal-tags

`@` tags: a message that names `@path` sends that file's text with it.

- `TagSources`: where tags come from. A source gives the rows a draft can tag and the text part a tag adds. For a tag two sources know, the one added first attaches it.
- `tags/list`: every source's rows, each with its frecency: uses over one plus the days since the last use, counted per workspace folder when a message sends the tag.
- `tagsIn(text)`: the tags written in a draft, `@path` or `@"path with spaces"`. `tagText(tag)` writes one.
Wraps `loop/Send`: a user message gains one text part per tag a source knows, counted in `loop/added`. A file sends `<file name="path">` with its first page as `read` shows it (`pageOf` from `tools-files`): numbered lines, at most 2000 lines or 50 KB, with a footer when more follows; a binary file a one-line note, and a folder `<folder name="path/">` with up to 200 entries one level down. A tag no source knows stays plain text, and a file that cannot be read sends a note, so a tag never fails a send.

Adds the workspace source: Git's tracked files and untracked ones not ignored, with the folders on their paths. Outside a repository its list is empty, and any path under the workspace still attaches.

Requires `loop/Send`, `Directories`, `SqlClient`, `ChildProcessSpawner`, `FileSystem` and `Path`.

## TUI

The `tui` entry adds the `@` draft trigger to chat's `DraftTriggers`: `@` at the start of the draft or after whitespace opens the list of tags. It loads `tags/list` each time it opens, and ranks rows by their `fuzzysort` match times one plus their frecency, 50 at most. Enter tags the row; Tab, shown only on a folder, opens it to list what is inside. A picked tag is a virtual extmark: the cursor steps over it and Backspace removes it whole.

The entry requires `Host`, `Colors` and `DraftTriggers`.
