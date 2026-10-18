# cache-hints

Marks where each request's cached prefix ends, for providers that cache by mark.

Status: built

## Requires

- `RequestSteps`

## Requirements

- Marks the first system message and the last message, at most two distinct marks
- Tools get no mark; Anthropic caches tools before system, so the first system mark covers them
- Marks are added per request and never saved
- Providers that cache on their own ignore marks
