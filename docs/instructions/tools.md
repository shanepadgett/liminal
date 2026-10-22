# Tools

- A rule that a check can enforce becomes a lint rule, a fallow boundary or a repository check, and leaves the instruction files.
- Lint rules live in `tools/lint/` with a test beside each rule file. Repository checks live in `tools/checks/` with fixtures.
- A new check gets a `mise` task and an entry in `.pi/tau/settings.json` with globs for the files that can break it.
- Keep the globs in `.pi/tau/settings.json` in sync when a check starts reading new files.
- Fallow owns layers between packages; oxlint owns runtime imports and plugin entries.
- `apps/gallery` has its own checks, `gallery:types`, `gallery:lint` and `gallery:dupes`. The repository checks leave it out, and a gallery check runs only when gallery files or the shared lint setup change.
