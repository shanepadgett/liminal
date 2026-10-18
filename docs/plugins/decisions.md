# decisions

Asks a decision model, such as Jev or Luna Decisions, choice, score and yes or no questions about a JSON state, with probabilities.

Status: built

## Provides

- `DecisionModels` registry that provider plugins add to
- `Decisions` service: `classify(state, questions, prefer)` returns `Answered` (model id and answers) or `Skipped` (`unavailable`, `timeout` or `error`, with a message); it never fails

## Requires

- Nothing

## Requirements

### Questions

- A question is `Choice` (criteria map each choice to its meaning), `Score` (criteria are level labels, lowest first) or `Bool` (criteria give the meanings of true and false), each with instructions
- An answer is `Choice` (choice, probability per choice, confidence), `Score` (score and confidence) or `Bool` (probability of true)
- Questions, answers and `DecisionFailed` live in `@liminal/sdk`; the System One and OpenAI Decisions wires live in `@liminal/sdk/ai/decisions`

### Models

- Provider plugins register the decision models their login serves, through `uses: [DecisionModels]`, only when `decisions` is loaded
- `model-openrouter` registers `openrouter/jev` (System One, `~typesafe/jev-latest`) and `openrouter/luna` (Decisions, `openai/gpt-6-luna-decisions`)
- `model-openai` registers `openai/luna` (Decisions, `gpt-6-luna`) on the API key
- Each model reports whether it has a usable key; one call is one POST, never retried

### Classify

- Jev is tried before Luna; within a family, models go by id
- `prefer` is `auto`, `jev` or `luna`; `jev` or `luna` keeps that family only
- The first model with a usable key is asked; none is `Skipped(unavailable)`
- State and questions over 48,000 bytes of JSON are `Skipped(unavailable)`
- A call over 3 seconds is `Skipped(timeout)`; a failed call is `Skipped(error)`
- Every question needs an answer of its kind; probabilities, scores and confidences lie in 0 to 1; a choice is one of the criteria; choice probabilities sum to 1 within 0.02; otherwise `Skipped(error)`

## References

- Tau `extensions/decisions/classifier.ts` and `routing.ts`
- pi-ai `dist/api/openai-decisions.js`, `system-one-shared.js`, `typesafe-system-one.js`
