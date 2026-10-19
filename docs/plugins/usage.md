# usage

What a session's model calls used and cost, as the sidebar's Context and Cost sections.

Status: built

## Requires

- `SessionLog`, `Models`

## Requirements

- Counts each reply's finish usage against the model of the turn it ran in
- `usage/session` streams the session's usage once it has a reply, then again after each burst of new entries
- Context shows the latest call's request and reply tokens with their share of the model's window, the window, and the share of the request read from the cache
- Cost adds up every call at the catalog's per-million prices; models without a price are left out and counted as unpriced
- Before the first reply both sections show `No model call yet`; a model without a price shows `No price for this model`
- Context registers at sidebar order 0, Cost at 10

## References

- Tau `src/ai/ModelProfile.ts` (`callCost`), `src/tui/internal/SessionPanel.tsx`
