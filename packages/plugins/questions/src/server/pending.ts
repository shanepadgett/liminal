/**
 * Whether a form waits on the user, read from the session's entries: the newest form, answers,
 * cancel or user message decides. And the before-call hook that ends a turn whose latest calls put
 * a form to the user.
 */

import { Effect, Option, Predicate, Schema, Stream } from "effect";

import { BeforeCall, type Turn } from "@liminal/agent-loop/contract";
import { draft, type Entry, type SessionId, type Synced } from "@liminal/sdk";
import {
  ReasoningEntry,
  type SessionLog,
  TextEntry,
  ToolCallEntry,
  ToolResultEntry,
  UserEntry,
} from "@liminal/session-log/contract";

import {
  AnswersEntry,
  Asked,
  askQuestionTool,
  CancelledEntry,
  Form,
  FormEntry,
  NoForm,
  type Pending,
} from "../contract.ts";

const decodeForm = Schema.decodeUnknownOption(Form);

const decodeResult = Schema.decodeUnknownOption(ToolResultEntry.data);

const noForm: Pending = NoForm.make({});

/** Kinds after which no form waits. */
const closing = new Set([UserEntry.kind, AnswersEntry.kind, CancelledEntry.kind]);

/** What waits after `entry`, given what waited before it. */
const stepPending = (pending: Pending, entry: Entry): Pending => {
  if (closing.has(entry.kind)) return noForm;
  if (entry.kind !== FormEntry.kind) return pending;

  return Option.match(decodeForm(entry.data), {
    onNone: () => noForm,
    onSome: (form) => Asked.make({ seq: entry.seq, form }),
  });
};

/** What waits on the user after `entries`. */
export const pendingOf = (entries: ReadonlyArray<Entry>): Pending => {
  let pending: Pending = noForm;
  for (const entry of entries) pending = stepPending(pending, entry);

  return pending;
};

interface Following {
  readonly pending: Pending;
  readonly synced: boolean;
}

/** What waits once the saved entries are read, then each change. */
export const watchPending = (log: SessionLog["Service"], session: SessionId) =>
  log.subscribe(session, {}).pipe(
    Stream.mapAccum(
      (): Following => ({ pending: noForm, synced: false }),
      (state, event: Entry | Synced): readonly [Following, ReadonlyArray<Pending>] => {
        if (Predicate.isTagged(event, "Synced")) {
          return [{ ...state, synced: true }, [state.pending]];
        }

        const pending = stepPending(state.pending, event);
        if (pending === state.pending) return [state, []];

        return [{ pending, synced: state.synced }, state.synced ? [pending] : []];
      },
    ),
  );

/** Kinds after the latest call that mean its turn moved on past it. */
const movedOn = new Set([
  UserEntry.kind,
  TextEntry.kind,
  ReasoningEntry.kind,
  FormEntry.kind,
  AnswersEntry.kind,
  CancelledEntry.kind,
]);

/** The form a done `ask_question` call put up, from its result's details. */
const askedForm = (entry: Entry): Option.Option<Form> =>
  entry.kind === ToolResultEntry.kind
    ? Option.flatMap(decodeResult(entry.data), (result) =>
        result.name === askQuestionTool && result.status === "done"
          ? decodeForm(result.details)
          : Option.none(),
      )
    : Option.none();

/** The form among the results of the session's latest calls, unless the turn moved on past them. */
const latestForm = Effect.fn("questions.latestForm")(function* (
  log: SessionLog["Service"],
  session: SessionId,
) {
  const calls = yield* log.lastOfKinds([ToolCallEntry]);
  const call = calls.find((entry) => entry.sessionId === session);
  if (call === undefined) return Option.none<Form>();

  const after = yield* log.read(session, { after: call.seq });
  if (after.some((entry) => movedOn.has(entry.kind))) return Option.none<Form>();

  return Option.fromUndefinedOr(after.flatMap((entry) => Option.toArray(askedForm(entry))).at(-1));
});

/** Ends the turn with the form entry when the latest calls put a form to the user. */
export const makeAwaitForm =
  (log: SessionLog["Service"]) =>
  (turn: Turn): Effect.Effect<BeforeCall> =>
    latestForm(log, turn.sessionId).pipe(
      Effect.map(
        Option.match({
          onNone: () => BeforeCall.Proceed({ input: [] }),
          onSome: (form) =>
            BeforeCall.Await({ input: [draft(FormEntry, { data: form, text: form.title })] }),
        }),
      ),
      Effect.catch((error) =>
        Effect.as(
          Effect.logWarning(`questions could not read the session: ${error.message}`),
          BeforeCall.Proceed({ input: [] }),
        ),
      ),
    );
