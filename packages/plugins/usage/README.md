# @shanepadgett/liminal-usage

What each session's turn steps used and cost.

## Contract

`./contract` exports `SessionUsage` and `UsageRpc`:

- `usage/session`: the session's usage now, then again after each step starts or ends. `context` is the latest finished step's input tokens, `contextWindow` its model's window, `cacheHit` the share of that input read from the cache, `cost` the US dollars of every finished step whose model has a price (missing when steps finished and none has), and `unpriced` the steps whose model has none. Before the first step finishes, all are zero and the window is missing.

A step's model comes from its `loop/step-start`, its tokens from a finished `loop/step-end`, and its prices from `Models.details`, so a provider that is signed out still prices its old steps. Fresh input is the input total less cache reads and writes; a model without cache prices charges them at its input price. A plan-billed provider is priced at its catalog's API rates. Model calls outside the turn loop, such as approval reviews, are not counted.

Requires `SessionLog` and `Models`.

## TUI

The `tui` entry always fills `chat`'s sidebar with the Usage section, all zero until the session's first step finishes: the share of the context window as its note, turning to the warning color past 80%, then the tokens, the share from the cache and the cost. It requires `Slots` and calls `usage/session`.
