# @shanepadgett/liminal-tags

`@` tags: a message that names `@path` sends that file's text with it.

- `TagSources`: where tags come from. A source gives the rows a draft can tag and the text part a tag adds. For a tag two sources know, the one added first attaches it.
- `tags/list`: every source's rows, each with its frecency: uses over one plus the days since the last use, counted per workspace folder when a message sends the tag.
- `tagsIn(text)`: the tags written in a draft, `@path` or `@"path with spaces"`. `tagText(tag)` writes one.
- `windowOf(content)`: at most the first 2000 lines and 50 KB, with a note when it cuts any.
- `Attached`: on a message, how many of its last parts its tags added, so screens can show only what the user wrote. `attachedOf(attributes)` reads it.

Wraps `loop/Send`: a user message gains one text part per tag a source knows. A file sends `<file name="path">` with its window, a binary file a one-line note, and a folder `<folder name="path/">` with up to 200 entries one level down. A tag no source knows stays plain text, and a file that cannot be read sends a note, so a tag never fails a send.

Adds the workspace source: Git's tracked files and untracked ones not ignored, with the folders on their paths. Outside a repository its list is empty, and any path under the workspace still attaches.

Requires `loop/Send`, `Directories`, `SqlClient`, `ChildProcessSpawner`, `FileSystem` and `Path`.
