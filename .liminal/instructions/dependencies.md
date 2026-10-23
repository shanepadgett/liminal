---
read-when: Writing code against a dependency, or adding or updating one
---

# Dependencies

- Find the dependency's entry in `docs/reference/copies/index.md` and read its docs and API there. Never guess an API.
- A new dependency starts at the latest stable release on the registry (`npm view <package> version`), never at a version copied from a reference repository.
- Every new dependency needs the user's approval.
- A new dependency or tool needs a source in `docs/reference/sources.json`. After adding one or changing a version, run `mise run docs`.
- A dependency planned for a plugin that is not built yet is pinned as a peer dependency in `tools/planned/package.json`. Move it to the plugin's `package.json` when the plugin is built.
