/** The model the chat screen has selected, for side jobs that run beside it, such as `/commit`. */
import { Context } from "effect";
import type { Accessor } from "solid-js";

import type { ModelChoice } from "@shanepadgett/liminal-model/contract";

export class ModelSelection extends Context.Service<
  ModelSelection,
  {
    /**
     * The pick waiting on screen, else the model its session runs, or a new session would on the
     * landing screen; undefined while no provider is connected or the model is not known yet.
     */
    readonly selected: Accessor<ModelChoice | undefined>;
  }
>()("model-choice/ModelSelection") {}
