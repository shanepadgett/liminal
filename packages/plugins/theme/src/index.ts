/** Liminal's colors. It provides no services yet; frontends use its contract's types. */
import { Layer } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";

export default definePlugin({ name: "theme", provides: [], requires: [], layer: Layer.empty });
