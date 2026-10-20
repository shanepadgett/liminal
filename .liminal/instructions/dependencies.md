---
read-when: writing or planning code against a dependency, or adding or updating a dependency or tool
---

# Dependencies

- Find the dependency's entry in `docs/reference/copies/index.md` and read its docs and API there. Never guess an API.
- A new dependency starts at the latest stable release on the registry (`npm view <package> version`), never at a version copied from a reference repository.
- A new dependency or tool needs a source in `docs/reference/sources.json`. After adding one or changing a version, run `mise run docs`.
