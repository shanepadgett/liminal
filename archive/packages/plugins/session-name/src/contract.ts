/** The tool the model calls to name its session. */

import { Schema } from "effect";

import { SessionName } from "@liminal/session-log/contract";

export const nameTool = "name_session";

export const NameParams = Schema.Struct({
  name: SessionName.annotate({
    description:
      "One plain sentence of about 10 words saying what the session is about, with no quotes or trailing period",
  }),
});
