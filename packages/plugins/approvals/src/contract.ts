/**
 * Approvals: which tool calls run without asking. Reads and changes inside the allowed folders run;
 * other calls go to a classifier, then a reviewer model, then the user.
 */
import { Schema } from "effect";

import { Attribute, Registry } from "@shanepadgett/liminal-core";
import { defineQuestion } from "@shanepadgett/liminal-questions/contract";
import { defineEvent } from "@shanepadgett/liminal-session/contract";

/**
 * Set on an input when no one is there to ask, as in print mode: with `yolo` every call runs
 * unchecked, without it every call that would ask the user is denied.
 */
export const Unattended = Attribute.make(
  "approvals/unattended",
  Schema.Struct({ yolo: Schema.Boolean }),
);

/** A folder and everything under it; `write` allows reads too. */
export const AllowedFolder = Schema.Struct({
  path: Schema.String,
  access: Schema.Literals(["read", "write"]),
});

export type AllowedFolder = typeof AllowedFolder.Type;

/**
 * The folders calls may reach beside the session's grants; approvals adds the workspace and the
 * system temp folder for changing. Read when each call is checked.
 */
export class AllowedFolders extends Registry.Service<AllowedFolders, AllowedFolder>()(
  "approvals/AllowedFolders",
) {}

/** A folder the user allowed for the rest of the session through `request_access`. */
export const Granted = defineEvent("approvals/granted", AllowedFolder);

/** One real-world effect of a call, as the reviewer names it. */
export const Change = Schema.Struct({
  kind: Schema.Literals(["creates", "changes", "deletes", "sends", "installs", "starts"]),
  target: Schema.String.annotate({
    description: "A path, host or named thing, short: build/, ~/.zshrc, github.com.",
  }),
});

export type Change = typeof Change.Type;

/** The reviewer's answer; with `ask`, what the user is shown in place of the call. */
export const Verdict = Schema.Struct({
  decision: Schema.Literals(["allow", "ask"]).annotate({
    description: "allow runs the call; ask sends it to the user.",
  }),
  summary: Schema.String.annotate({
    description:
      "Empty for allow. One sentence in plain words, starting with a verb: the main effect and what it touches.",
  }),
  effects: Schema.Array(Change)
    .check(Schema.isMaxLength(5))
    .annotate({ description: "Empty for allow. At most 5, most important first." }),
  risk: Schema.String.annotate({
    description:
      "Empty for allow. Why the user must decide: what could be lost, and whether it can be undone.",
  }),
});

export type Verdict = typeof Verdict.Type;

/** Where the most consequential change of a call lands, with the classifier's probability. */
export const Impacts = Schema.Struct({
  none: Schema.Finite,
  workspace: Schema.Finite,
  user_home: Schema.Finite,
  system: Schema.Finite,
  remote: Schema.Finite,
  exposure: Schema.Finite,
  unknown: Schema.Finite,
});

/** How one call was judged; logged for every call approvals judges. */
export const Decided = defineEvent(
  "approvals/decided",
  Schema.Struct({
    callId: Schema.String,
    allowed: Schema.Boolean,
    by: Schema.Literals(["classifier", "reviewer", "user", "unattended"]),
    scores: Schema.optionalKey(
      Schema.Struct({ hidden: Schema.Finite, impact: Impacts, asked: Schema.Finite }),
    ),
    review: Schema.optionalKey(
      Schema.Struct({
        /** The files the reviewer opened. */
        read: Schema.Array(Schema.String),
        verdict: Schema.optionalKey(Verdict),
        failed: Schema.optionalKey(Schema.String),
      }),
    ),
    /** The user's note. */
    note: Schema.optionalKey(Schema.String),
  }),
);

/** The user's answer to either ask, with a note for the model. */
export const Answer = Schema.Struct({
  decision: Schema.Literals(["approve", "reject"]),
  note: Schema.optionalKey(Schema.String),
});

export type Answer = typeof Answer.Type;

/** What the reviewer found, or why it could not tell. */
export const Review = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("verdict"), verdict: Verdict }),
  Schema.Struct({ kind: Schema.Literal("failed"), message: Schema.String }),
]);

export type Review = typeof Review.Type;

/** A call the reviewer could not allow. */
export const callQuestion = defineQuestion(
  "approvals/call",
  Schema.toCodecJson(Schema.Struct({ tool: Schema.String, review: Review })),
  Schema.toCodecJson(Answer),
);

/** A folder the model asked for that the reviewer could not allow; `reason` is the agent's. */
export const accessQuestion = defineQuestion(
  "approvals/access",
  Schema.toCodecJson(
    Schema.Struct({
      path: Schema.String,
      write: Schema.Boolean,
      reason: Schema.String,
      failed: Schema.optionalKey(Schema.String),
    }),
  ),
  Schema.toCodecJson(Answer),
);

/** The tool the model asks for a folder with. */
export const requestAccessName = "request_access";
