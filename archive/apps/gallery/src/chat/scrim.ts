/** The dark wash laid over the chat under a drawer or a dialog, so what sits on top reads first. */

import { RGBA } from "@opentui/core";

/** How dark the wash is, from 0 to 255. */
const SCRIM_ALPHA = 150;

export const SCRIM = RGBA.fromInts(0, 0, 0, SCRIM_ALPHA);
