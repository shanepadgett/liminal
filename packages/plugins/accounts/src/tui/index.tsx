/**
 * Accounts' `tui` entry: `/connect` picks a vendor, then one of its logins and the way through it,
 * and follows the sign-in in a dialog. A list of one is taken without asking, as `liminal connect`
 * does.
 */
import { Effect, Layer } from "effect";

import { Host } from "@shanepadgett/liminal-client";
import { definePlugin } from "@shanepadgett/liminal-core";
import {
  Dialogs,
  type EntryRun,
  type kit,
  Keymap,
  makeEntryRun,
  openPicker,
  type PickerSpec,
  Pickers,
  registerCommands,
} from "@shanepadgett/liminal-tui";

import { AccountsRpc, type LoginMethodInfo } from "../contract.ts";
import { SignIn, type SignInTarget } from "./SignIn.tsx";

type MethodInfo = typeof LoginMethodInfo.Type;

const methods = Effect.scoped(
  Effect.flatMap(Host, (host) =>
    Effect.flatMap(host.client(AccountsRpc), (accounts) => accounts["accounts/methods"]()),
  ),
);

/** Opens a picker of `rows`; with only one row, picks it without asking. */
const pickOne = (spec: Omit<PickerSpec, "rows" | "actions">, rows: ReadonlyArray<kit.PickerRow>) =>
  Effect.gen(function* () {
    const [only] = rows;

    if (rows.length === 1 && only !== undefined) {
      spec.onSelect(only);

      return;
    }

    yield* openPicker({ ...spec, rows: () => rows, actions: [] });
  });

/** Each way through `vendor`'s logins, under its login, as rows and the sign-ins they start. */
const loginsOf = (all: ReadonlyArray<MethodInfo>, vendor: string) => {
  const targets = new Map<string, SignInTarget>();

  const rows = all.flatMap((method) =>
    method.vendor === vendor
      ? method.ways.map((way): kit.PickerRow => {
          const id = `${method.id}:${way.id}`;
          targets.set(id, { vendor, method: method.id, way: way.id });

          return { id, title: way.title, section: method.title };
        })
      : [],
  );

  return { rows, targets };
};

const openSignIn = (target: SignInTarget) =>
  Effect.map(Dialogs, (dialogs) => {
    dialogs.open((close) => <SignIn target={target} close={close} />);
  });

const openLogins = (all: ReadonlyArray<MethodInfo>, vendor: string, run: EntryRun) => {
  const { rows, targets } = loginsOf(all, vendor);

  return pickOne(
    {
      name: "accounts/logins",
      title: `Connect ${vendor}`,
      placeholder: "Search logins",
      empty: "No logins",
      onSelect: (row) => {
        const target = targets.get(row.id);
        if (target !== undefined) run(openSignIn(target));
      },
    },
    rows,
  );
};

/** A vendor as a row, marked when any of its logins is connected. */
const vendorRow = (all: ReadonlyArray<MethodInfo>, vendor: string): kit.PickerRow =>
  all.some((method) => method.vendor === vendor && method.connected)
    ? { id: vendor, title: vendor, detail: "connected" }
    : { id: vendor, title: vendor };

const openConnect = (run: EntryRun) =>
  Effect.gen(function* () {
    const all = yield* methods;
    const vendors = [...new Set(all.map((method) => method.vendor))];

    yield* pickOne(
      {
        name: "accounts/vendors",
        title: "Connect",
        placeholder: "Search providers",
        empty: "No providers to connect",
        onSelect: (row) => {
          run(openLogins(all, row.id, run));
        },
      },
      vendors.map((vendor) => vendorRow(all, vendor)),
    );
  });

const make = Effect.gen(function* () {
  const run = yield* makeEntryRun("Connect failed.");

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
  ]);
});

export default definePlugin({
  name: "accounts-tui",
  provides: [],
  requires: [Host, Keymap, Dialogs, Pickers],
  layer: Layer.effectDiscard(make),
});
