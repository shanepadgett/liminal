# Docs

| Path | Holds | Lifecycle |
| --- | --- | --- |
| [architecture.md](architecture.md) | The intended design | Changes when the user agrees to a design change; corrected when built code differs |
| [status.md](status.md) | Scope rules, current focus, milestones | Ticked as work lands |
| [instructions/](instructions/) | Rules for agents, each read only when doing that work; listed in `AGENTS.md` | Changes with the user's approval |
| [extension-basics.md](extension-basics.md) | Add, Wrap, Attach and Replace with examples | Moves into `guides/` once core is built |
| [plugins/](plugins/) | Work files: what each milestone's plugins must do | A section is deleted once its plugin is built; a file once it is empty |
| [guides/](guides/_index.md) | How to build plugins, for external authors | Written from settled, built code |
| [usage/](usage/_index.md) | How to install, configure and use Liminal | Written from shipped features |
| [reference/](reference/) | Pinned copies of dependency docs | Regenerated with `mise run docs` |
