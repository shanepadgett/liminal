/** The sessions browser keeps its view and filter open while archive commands save. */

import { DateTime, Effect, Stream } from "effect";
import type { RpcClient, RpcClientError } from "effect/rpc";
import { createSignal, onCleanup } from "solid-js";

import type { SessionId } from "@liminal/sdk";
import {
  type Bridge,
  type DialogProps,
  formatRelativeDate,
  SelectDialog,
  type SelectOption,
  type TuiToastsService,
} from "@liminal/sdk/tui";
import type { SessionLogRpcs, SessionSummary } from "@liminal/session-log/contract";

interface SessionsDialogProps extends DialogProps {
  readonly initial: ReadonlyArray<SessionSummary>;
  readonly now: DateTime.Utc;
  readonly log: RpcClient.FromGroup<typeof SessionLogRpcs, RpcClientError.RpcClientError>;
  readonly bridge: Bridge;
  readonly toasts: TuiToastsService;
  readonly onSelect: (session: SessionId) => void;
}

const createSessionRefresh = (props: SessionsDialogProps) => {
  const [sessions, setSessions] = createSignal(props.initial);
  const [now, setNow] = createSignal(props.now);
  let isMounted = true;
  let latestRequest = 0;

  onCleanup(() => {
    isMounted = false;
  });

  const report = (title: string) => (error: Error) =>
    Effect.sync(() => {
      if (isMounted) props.toasts.show({ kind: "error", title, message: error.message });
    });

  const refresh = Effect.gen(function* () {
    const request = ++latestRequest;
    const listed = yield* props.log["session-log/list"]();
    const reference = yield* DateTime.now;

    if (isMounted && request === latestRequest) {
      setSessions(listed);
      setNow(reference);
    }
  });

  return {
    sessions,
    now,
    refresh,
    report,
    invalidate: () => {
      latestRequest++;
    },
    isMounted: () => isMounted,
  };
};

const createBrowser = (props: SessionsDialogProps) => {
  const [view, setView] = createSignal<"active" | "archived">("active");
  const [isSaving, setSaving] = createSignal(false);
  const updates = createSessionRefresh(props);

  const refreshSafely = updates.refresh.pipe(
    Effect.catch(updates.report("Could not refresh sessions")),
  );

  // watch ties the timer and its in-flight read to this dialog's lifetime.
  props.bridge.watch(
    Stream.tick("1 minute").pipe(
      Stream.mapEffect(() => (isSaving() ? Effect.void : refreshSafely)),
    ),
    null,
  );

  const changeArchive = (session: SessionId) => {
    if (isSaving()) return;
    const action = view() === "active" ? "archive" : "restore";
    setSaving(true);
    updates.invalidate();

    props.bridge.run(
      props.log["session-log/set-archive"]({ session, action }).pipe(
        Effect.andThen(updates.refresh),
        Effect.catch(updates.report(`Could not ${action} session`)),
        Effect.ensuring(
          Effect.sync(() => {
            if (updates.isMounted()) setSaving(false);
          }),
        ),
      ),
    );
  };

  const switchView = () => {
    setView((previous) => (previous === "active" ? "archived" : "active"));
    if (!isSaving()) props.bridge.run(refreshSafely);
  };

  return { view, sessions: updates.sessions, now: updates.now, changeArchive, switchView };
};

const optionsOf = (
  browser: ReturnType<typeof createBrowser>,
): ReadonlyArray<SelectOption<SessionId>> =>
  browser
    .sessions()
    .flatMap((session) =>
      session.archived === (browser.view() === "archived")
        ? [
            {
              title: session.title === "" ? "Untitled session" : session.title,
              value: session.id,
              trailing: formatRelativeDate(session.activityAt, browser.now()),
            },
          ]
        : [],
    );

export function SessionsDialog(props: SessionsDialogProps) {
  const browser = createBrowser(props);
  const isArchived = () => browser.view() === "archived";

  return (
    <SelectDialog
      title={`Sessions · ${isArchived() ? "Archived" : "Active"}`}
      width={90}
      options={optionsOf(browser)}
      screen={browser.view()}
      close={props.close}
      onSelect={props.onSelect}
      emptyMessage={isArchived() ? "No archived sessions" : "No active sessions"}
      dialogActions={[
        { key: "tab", label: isArchived() ? "active" : "archived", run: browser.switchView },
      ]}
      actions={[
        {
          key: "ctrl+a",
          label: isArchived() ? "restore" : "archive",
          keepsOpen: true,
          run: browser.changeArchive,
        },
      ]}
    />
  );
}
