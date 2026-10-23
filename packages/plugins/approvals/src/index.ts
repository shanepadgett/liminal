/**
 * Approvals wraps every tool call. Reads and changes run when their paths are inside the allowed
 * folders and fail otherwise; calls that run things go to the classifier, the reviewer, then the
 * user. `--yolo` runs everything unchecked.
 */
import { tmpdir } from "node:os";

import { Effect, FileSystem, Layer, Option, Path } from "effect";

import { Attribute, definePlugin, Registry } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";
import { Models, type ToolResult } from "@shanepadgett/liminal-model/contract";
import { Questions } from "@shanepadgett/liminal-questions/contract";
import { SessionLog } from "@shanepadgett/liminal-session/contract";
import {
  runAccess,
  ToolCall,
  type ToolCallRequest,
  Tools,
} from "@shanepadgett/liminal-tools/contract";

import { makeRequestAccess } from "./access.ts";
import { type AllowedFolder, AllowedFolders, callQuestion, Unattended } from "./contract.ts";
import { makeFolders } from "./folders.ts";
import { judge, type Judge, logDecided } from "./judge.ts";
import { stateOf } from "./state.ts";

const failed = (request: ToolCallRequest, text: string): ToolResult => ({
  type: "tool-result",
  callId: request.call.id,
  name: request.call.name,
  content: [{ type: "text", text }],
  isFailure: true,
});

const outsideText = (paths: ReadonlyArray<string>) =>
  `Outside the allowed folders: ${paths.join(", ")}. Ask for access with request_access.`;

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const { workspace } = yield* Directories;
    const tools = yield* Tools;
    const questions = yield* Questions;
    const registry = yield* AllowedFolders;

    yield* registry.add({ path: workspace, access: "write" });
    yield* registry.add({ path: tmpdir(), access: "write" });

    const folders = yield* makeFolders;

    const deps: Judge = {
      models: yield* Models,
      tools,
      folders,
      workspace,
      log: yield* SessionLog,
    };

    /** Runs the classifier, reviewer and user on a call that runs things. */
    const judgeRun = Effect.fn("Approvals.judgeRun")(function* (request: ToolCallRequest) {
      const { session, call, attributes } = request;
      const events = yield* deps.log.read(session);
      const where = { workspace, folders: yield* folders.list(session) };
      const state = stateOf(events, { id: call.id, tool: call.name, params: call.params }, where);

      return yield* judge(deps, { session, callId: call.id, attributes, events, state }, (review) =>
        callQuestion
          .ask({ session, callId: call.id }, { tool: call.name, review })
          .pipe(Effect.provideService(Questions, questions)),
      );
    });

    const guard = Effect.fn("Approvals.guard")(function* (
      request: ToolCallRequest,
      next: (request: ToolCallRequest) => Effect.Effect<ToolResult>,
    ) {
      const { session, call } = request;
      const tool = (yield* tools.list).findLast(({ name }) => name === call.name);
      if (tool === undefined) return yield* next(request);

      const access = tool.access?.(call.params) ?? runAccess;
      const unattended = yield* Attribute.get(request.attributes, Unattended);

      if (Option.exists(unattended, ({ yolo }) => yolo)) {
        if (access.kind === "run") {
          yield* logDecided(deps, session, { callId: call.id, allowed: true, by: "unattended" });
        }

        return yield* next(request);
      }

      if (access.kind !== "run") {
        const outside = yield* folders.outside(session, workspace, access.kind, access.paths);

        return outside.length === 0 ? yield* next(request) : failed(request, outsideText(outside));
      }

      const judgement = yield* judgeRun(request);

      return judgement.allowed ? yield* next(request) : failed(request, judgement.reason);
    });

    yield* (yield* ToolCall).wrap((request, next) =>
      guard(request, next).pipe(
        Effect.catch((error) =>
          Effect.succeed(
            failed(request, `Approval failed, so the call did not run: ${error.message}`),
          ),
        ),
      ),
    );

    yield* tools.add(makeRequestAccess(deps, questions));
  }),
);

export default definePlugin({
  name: "approvals",
  provides: [AllowedFolders],
  requires: [
    ToolCall,
    Tools,
    Models,
    Questions,
    SessionLog,
    Directories,
    FileSystem.FileSystem,
    Path.Path,
  ],
  layer: layer.pipe(
    Layer.provideMerge(Layer.effect(AllowedFolders, Registry.make<AllowedFolder>())),
  ),
  entries: { tui: () => import("./tui/index.tsx") },
});
