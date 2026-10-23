# @shanepadgett/liminal-tools-read

The `read` tool.

`read` takes `path`, `offset` (from 1) and `limit`. The path is relative to the workspace, or absolute.

- A text file comes back as numbered lines, such as `12: text`, without their LF or CRLF endings. A page holds at most 2,000 lines or 50 KB, and a footer names the offset that reads on. Lines over 2,000 characters are cut.
- PNG, JPEG, GIF and WebP files, known by their first bytes, come back as image parts. One over 5 MB as base64 fails the call.
- A file with a NUL byte in its first 8 KB is binary and fails the call.
- A folder lists its entries, sorted, each folder's ending in `/`, paged like a file.
- Its `access` is a read of `path`, so approvals lets it run inside the allowed folders.

Requires `Tools`, `Directories`, `FileSystem` and `Path`.

## Contract

- `pageOf(text, offset?, limit?)`: a page of `text` as `read` shows it; none when `offset` is past the end. `tags` shows an `@` file with it.
- `isBinary(bytes)`: whether the first 8 KB hold a NUL byte. `edit` refuses such a file with it.
- `entriesOf(fs, path, folder)`: a folder's entries, sorted, each folder's ending in `/`.
- `MAX_LINES`: the most lines a page holds.

## Replace it

Add a tool named `read` after `tools-read`; of two tools with one name, the one added last is used.
