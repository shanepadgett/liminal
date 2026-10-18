# trust

Asks the user to trust an untrusted workspace, in the composer's place, so its project settings and plugins load.

Status: built

## Requires

- `ProjectTrust` and `Directories` (base services)

## Adds

- RPCs `trust/workspace` and `trust/trust`
- TUI part: the trust prompt on `ChatSlots.composer` and its key hints on `ChatSlots.composerHints`, both at priority -1

## Requirements

- Every untrusted workspace, with or without `.liminal/`, opens with the prompt in place of the composer
- The prompt shows the workspace path, that trusting loads `.liminal/` settings and plugins which can run code, and that subfolders are trusted too
- Enter trusts the folder: it is saved in the global `plugins.json` and the composer returns; a failed save shows under the question
- Esc keeps the run untrusted and brings the composer back; nothing is saved, so the next launch asks again
- An answer holds across reloads and restarts until the app quits
