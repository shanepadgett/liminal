/**
 * Accounts' `tui` entry. `/connect` picks a vendor, then one of its logins and the way through it,
 * and follows the sign-in in a dialog; a list of one is taken without asking, as `liminal connect`
 * does. In both pickers `ctrl+d` disconnects what is connected, after asking. `/disconnect` picks a
 * connected login and, after asking, logs out of it.
 */
import { Effect, Layer } from "effect";
import { type Accessor, createSignal } from "solid-js";

import { Host } from "@shanepadgett/liminal-client";
import { definePlugin } from "@shanepadgett/liminal-core";
import {
  Dialogs,
  type EntryRun,
  kit,
  Keymap,
  makeEntryRun,
  openPicker,
  type PickerSpec,
  Pickers,
  registerCommands,
  useColor,
} from "@shanepadgett/liminal-tui";

import { AccountsRpc, type LoginMethodInfo } from "../contract.ts";
import { SignIn, type SignInTarget } from "./SignIn.tsx";

type MethodInfo = typeof LoginMethodInfo.Type;

const client = Effect.flatMap(Host, (host) => host.client(AccountsRpc));

const methods = Effect.scoped(Effect.flatMap(client, (accounts) => accounts["accounts/methods"]()));

const logout = (provider: string) =>
  Effect.scoped(Effect.flatMap(client, (accounts) => accounts["accounts/logout"]({ provider })));

/** The logins as last read, and reading them again; pickers follow them as logins disconnect. */
interface Logins {
  readonly all: Accessor<ReadonlyArray<MethodInfo>>;
  readonly reload: Effect.Effect<void, Effect.Error<typeof methods>, Host>;
}

const readLogins = Effect.map(methods, (first): Logins => {
  const [all, setAll] = createSignal(first);

  return {
    all,
    reload: Effect.map(methods, (list) => {
      setAll(list);
    }),
  };
});

/** What a failed logout said, over the picker. */
function Told(props: { readonly message: string }) {
  const color = useColor();

  return (
    <kit.Dialog title="Disconnect" hints={[]}>
      <text fg={color("text.base")}>{props.message}</text>
    </kit.Dialog>
  );
}

const tell = (message: string) =>
  Effect.map(Dialogs, (dialogs) => {
    dialogs.open(() => <Told message={message} />);
  });

/**
 * Logs out of each of `providers`, then reads the logins again. A failed logout still removes the
 * login, so its message shows and the rest go on.
 */
const disconnect = (logins: Logins, providers: ReadonlyArray<string>) =>
  Effect.andThen(
    Effect.forEach(
      providers,
      (provider) =>
        logout(provider).pipe(Effect.catchTag("LogoutFailed", (error) => tell(error.message))),
      { discard: true },
    ),
    logins.reload,
  );

/** The providers of `vendor`'s connected logins. */
const connectedProviders = (all: ReadonlyArray<MethodInfo>, vendor: string) => [
  ...new Set(
    all.flatMap((method) =>
      method.vendor === vendor && method.connected ? [method.provider] : [],
    ),
  ),
];

/** Asks before `ctrl+d` disconnects what the row names. */
const DISCONNECT: kit.PickerConfirm = {
  question: (row) => `Disconnect ${row.section ?? row.title}?`,
};

/** `ctrl+d` on a row `isConnected` says is connected: logs out of its providers. */
const disconnectAction = (
  isConnected: (row: kit.PickerRow) => boolean,
  providersOf: (row: kit.PickerRow) => ReadonlyArray<string>,
  logins: Logins,
  run: EntryRun,
): kit.PickerAction => ({
  key: "ctrl+d",
  label: "disconnect",
  keepsOpen: true,
  when: isConnected,
  confirm: DISCONNECT,
  run: (row) => {
    run(disconnect(logins, providersOf(row)));
  },
});

/** Opens a picker of `spec`'s rows; with only one row, picks it without asking. */
const pickOne = (spec: PickerSpec) =>
  Effect.gen(function* () {
    const [only, ...rest] = spec.rows();

    if (only !== undefined && rest.length === 0) {
      spec.onSelect(only);

      return;
    }

    yield* openPicker(spec);
  });

/**
 * Each way through `vendor`'s logins, under its login, as rows; the sign-in each starts; and the
 * login each belongs to. Every way through a login saves the same credential, so its section is
 * what shows it connected.
 */
const waysOf = (all: ReadonlyArray<MethodInfo>, vendor: string) => {
  const targets = new Map<string, SignInTarget>();
  const owners = new Map<string, string>();

  const rows = all.flatMap((method) =>
    method.vendor === vendor
      ? method.ways.map((way): kit.PickerRow => {
          const id = `${method.id}:${way.id}`;
          targets.set(id, { vendor, method: method.id, way: way.id });
          owners.set(id, method.id);

          return { id, title: way.title, section: method.title };
        })
      : [],
  );

  return { rows, targets, owners };
};

const openSignIn = (target: SignInTarget) =>
  Effect.map(Dialogs, (dialogs) => {
    dialogs.open((close) => <SignIn target={target} close={close} />);
  });

const openLogins = (logins: Logins, vendor: string, run: EntryRun) => {
  const { rows, targets, owners } = waysOf(logins.all(), vendor);

  const ownerOf = (row: kit.PickerRow) =>
    logins.all().find((method) => method.id === owners.get(row.id));

  const providerOf = (row: kit.PickerRow) => {
    const owner = ownerOf(row);

    return owner === undefined ? [] : [owner.provider];
  };

  const isConnected = (section: string) =>
    logins
      .all()
      .some((method) => method.vendor === vendor && method.title === section && method.connected);

  return pickOne({
    name: "accounts/logins",
    title: `Connect ${vendor}`,
    placeholder: "Search logins",
    empty: "No logins",
    rows: () => rows,
    sectionDetail: (section) => (isConnected(section) ? "connected" : undefined),
    actions: [disconnectAction((row) => ownerOf(row)?.connected === true, providerOf, logins, run)],
    onSelect: (row) => {
      const target = targets.get(row.id);
      if (target !== undefined) run(openSignIn(target));
    },
  });
};

/** A vendor as a row, marked when any of its logins is connected. */
const vendorRow = (all: ReadonlyArray<MethodInfo>, vendor: string): kit.PickerRow =>
  connectedProviders(all, vendor).length > 0
    ? { id: vendor, title: vendor, detail: "connected" }
    : { id: vendor, title: vendor };

const openConnect = (run: EntryRun) =>
  Effect.gen(function* () {
    const logins = yield* readLogins;
    const vendors = [...new Set(logins.all().map((method) => method.vendor))];
    const providersOf = (row: kit.PickerRow) => connectedProviders(logins.all(), row.id);

    yield* pickOne({
      name: "accounts/vendors",
      title: "Connect",
      placeholder: "Search providers",
      empty: "No providers to connect",
      rows: () => vendors.map((vendor) => vendorRow(logins.all(), vendor)),
      actions: [disconnectAction((row) => providersOf(row).length > 0, providersOf, logins, run)],
      onSelect: (row) => {
        run(openLogins(logins, row.id, run));
      },
    });
  });

/** A picker of the connected logins, under their vendors; a pick asks, then logs out of it. */
const openDisconnect = (run: EntryRun) =>
  Effect.gen(function* () {
    const logins = yield* readLogins;
    const connected = () => logins.all().filter((method) => method.connected);

    yield* openPicker({
      name: "accounts/connected",
      title: "Disconnect",
      placeholder: "Search logins",
      empty: "No provider is connected",
      rows: () =>
        connected().map((method) => ({
          id: method.id,
          title: method.title,
          section: method.vendor,
        })),
      actions: [],
      confirmSelect: { question: (row) => `Disconnect ${row.title}?` },
      onSelect: (row) => {
        const login = connected().find((method) => method.id === row.id);
        if (login !== undefined) run(disconnect(logins, [login.provider]));
      },
    });
  });

const make = Effect.gen(function* () {
  const run = yield* makeEntryRun("Connect failed.");
  const runDisconnect = yield* makeEntryRun("Disconnect failed.");

  yield* registerCommands([
    {
      name: "accounts.connect",
      title: "Connect a provider",
      category: "Model",
      slash: { name: "connect" },
      run: () => {
        run(openConnect(run));
      },
    },
    {
      name: "accounts.disconnect",
      title: "Disconnect a provider",
      category: "Model",
      slash: { name: "disconnect" },
      run: () => {
        runDisconnect(openDisconnect(runDisconnect));
      },
    },
  ]);
});

export default definePlugin({
  name: "accounts-tui",
  provides: [],
  requires: [Host, Keymap, Dialogs, Pickers],
  layer: Layer.effectDiscard(make),
});
