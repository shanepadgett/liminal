/**
 * `request_access`: the model asks to reach a folder outside the allowed ones. It is judged like a
 * call that runs things, and an allowed folder stays allowed for the rest of the session.
 */
import { Effect, Option, Schema } from "effect";

import { Attribute } from "@shanepadgett/liminal-core";
import { Questions } from "@shanepadgett/liminal-questions/contract";
import {
  defineTool,
  noAccess,
  ToolFailed,
  type ToolContext,
} from "@shanepadgett/liminal-tools/contract";

import { accessQuestion, requestAccessName, type Review, Unattended } from "./contract.ts";
import { judge, type Judge } from "./judge.ts";
import { stateOf } from "./state.ts";

const description = `Ask the user to let you read or change files outside the workspace and the allowed folders. Calls that reach outside them fail until a request is allowed; an allowed folder stays allowed for the rest of the session.

Ask for the highest folder you need, so one request covers every file in it. Changing allows reading too.`;

const Input = Schema.Struct({
  path: Schema.String.annotate({
    description: "The folder to reach, absolute or starting with ~.",
  }),
  write: Schema.Boolean.annotate({
    description: "true to change files there; false to only read them.",
  }),
  reason: Schema.String.annotate({ description: "One sentence for the user on why you need it." }),
});

type Input = typeof Input.Type;

const allowedText = (path: string, write: boolean) =>
  `Allowed: you may ${write ? "read and change" : "read"} files in ${path} for the rest of this session.`;

const failedOf = (found: Review) =>
  found.kind === "failed" ? Option.some(found.message) : Option.none();

export const makeRequestAccess = (deps: Judge, questions: Questions["Service"]) => {
  const { folders, workspace, log } = deps;

  const run = Effect.fn("Approvals.requestAccess")(function* (input: Input, context: ToolContext) {
    const { session, callId, attributes, model } = context;
    const path = yield* folders.resolve(workspace, input.path);
    const access = input.write ? "write" : "read";
    const folder = { path, access } as const;

    const outside = yield* folders.outside(session, workspace, access, [path]);
    if (outside.length === 0) return allowedText(path, input.write);

    const unattended = yield* Attribute.get(attributes, Unattended);

    if (Option.exists(unattended, ({ yolo }) => yolo)) {
      yield* folders.grant(session, folder);

      return allowedText(path, input.write);
    }

    const events = yield* log.read(session);
    const call = { id: callId, tool: requestAccessName, params: { path, write: input.write } };
    const state = stateOf(events, call, { workspace, folders: yield* folders.list(session) });

    const reviewed = { session, callId, attributes, model, events, state };

    const judgement = yield* judge(deps, reviewed, (found) =>
      accessQuestion
        .ask(
          { session, callId },
          Option.match(failedOf(found), {
            onNone: () => ({ path, write: input.write, reason: input.reason }),
            onSome: (failed) => ({ path, write: input.write, reason: input.reason, failed }),
          }),
        )
        .pipe(Effect.provideService(Questions, questions)),
    );

    if (!judgement.allowed) return yield* new ToolFailed({ message: judgement.reason });

    yield* folders.grant(session, folder);

    return allowedText(path, input.write);
  });

  return defineTool({
    name: requestAccessName,
    description,
    input: Input,
    access: () => noAccess,
    run: (input, context) =>
      run(input, context).pipe(
        Effect.map((text) => ({ content: [{ type: "text" as const, text }] })),
        Effect.mapError((error) =>
          error instanceof ToolFailed ? error : new ToolFailed({ message: error.message }),
        ),
      ),
  });
};
