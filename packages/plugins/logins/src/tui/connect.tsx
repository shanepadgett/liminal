/**
 * `/connect`: the providers, then a provider's ways to sign in, then how to finish one when there
 * is a choice, then the login. Each screen is a dialog on the stack, so esc goes back one. Ctrl+d
 * on a signed-in row asks before signing it out.
 */

import { Effect, Predicate, Stream } from "effect";
import type { RpcClient, RpcClientError, RpcGroup } from "effect/rpc";
import { type Accessor, createSignal } from "solid-js";

import {
  type Bridge,
  ConfirmDialog,
  type DialogProps,
  type Hint,
  type TuiDialogsService,
} from "@liminal/sdk/tui";

import type { LoginFailed, LoginsRpcs, LoginWay, MethodInfo, SignIn } from "../contract.ts";
import { type Choice, ChoiceDialog } from "./ChoiceDialog.tsx";
import { LoginDialog } from "./LoginDialog.tsx";
import { Failed, type Shown } from "./steps.ts";

export type LoginsClient = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof LoginsRpcs>,
  RpcClientError.RpcClientError
>;

const PROVIDERS: readonly Hint[] = [
  ["enter", "choose"],
  ["ctrl+d", "sign out"],
  ["esc", "close"],
];

const WAYS: readonly Hint[] = [
  ["enter", "sign in"],
  ["ctrl+d", "sign out"],
  ["esc", "back"],
];

const METHODS: readonly Hint[] = [
  ["enter", "sign in"],
  ["esc", "back"],
];

/** One vendor and its login methods, in the order the list gives them. */
interface VendorMethods {
  readonly name: string;
  readonly methods: ReadonlyArray<MethodInfo>;
}

const vendorsOf = (methods: ReadonlyArray<MethodInfo>): ReadonlyArray<VendorMethods> => {
  const byVendor = new Map<string, VendorMethods>();

  for (const method of methods) {
    const { id, name } = method.vendor;
    const found = byVendor.get(id);
    byVendor.set(id, { name, methods: [...(found?.methods ?? []), method] });
  }

  return [...byVendor.values()].toSorted((left, right) => left.name.localeCompare(right.name));
};

const stateText = (state: SignIn) => {
  if (Predicate.isTagged(state, "Saved")) return "saved";
  if (Predicate.isTagged(state, "FromEnv")) return `from ${state.variable}`;

  return "";
};

const isSaved = (method: MethodInfo) => Predicate.isTagged(method.state, "Saved");

const isSignedIn = (vendor: VendorMethods) =>
  vendor.methods.some((method) => !Predicate.isTagged(method.state, "SignedOut"));

/** What every `/connect` screen works with. */
interface Connect {
  readonly bridge: Bridge;
  readonly dialogs: TuiDialogsService;
  readonly client: LoginsClient;
  readonly methods: Accessor<ReadonlyArray<MethodInfo>>;
  /** Lists the methods again, with their sign-in state. */
  readonly load: Effect.Effect<void, LoginFailed | RpcClientError.RpcClientError>;
}

const start = (connect: Connect, method: MethodInfo, way: LoginWay | undefined) =>
  connect.client["logins/start"](
    way === undefined ? { method: method.id } : { method: method.id, way: way.id },
  ).pipe(
    Stream.map((step): Shown => step),
    Stream.catch((error) => Stream.make(Failed.make({ message: error.message }))),
  );

/** Opens the login; when it is saved, closes `depth` dialogs, the login's included. */
const logIn = (connect: Connect, method: MethodInfo, way: LoginWay | undefined, depth: number) => {
  const { bridge, dialogs, client } = connect;

  dialogs.show((props: DialogProps) => (
    <LoginDialog
      title={method.vendor.name}
      bridge={bridge}
      steps={start(connect, method, way)}
      answer={(text) => {
        bridge.run(client["logins/answer"]({ method: method.id, text }));
      }}
      close={props.close}
      onDone={() => {
        for (let closed = 0; closed < depth; closed++) dialogs.close();
        bridge.run(connect.load);
      }}
    />
  ));
};

/** Asks how to finish the method when it has a choice, else opens its login. */
const chooseWay = (connect: Connect, method: MethodInfo) => {
  if (method.ways.length < 2) {
    logIn(connect, method, method.ways[0], 1);

    return;
  }

  connect.dialogs.show((props: DialogProps) => (
    <ChoiceDialog
      title={method.title}
      hints={METHODS}
      choices={method.ways.map((way) => ({ title: way.title, note: "" }))}
      close={props.close}
      onChoose={(index) => {
        logIn(connect, method, method.ways[index], 2);
      }}
      onSignOut={() => {}}
    />
  ));
};

/** Asks, then signs a saved method out; a key from the environment cannot be signed out here. */
const signOut = (connect: Connect, method: MethodInfo) => {
  if (!isSaved(method)) return;
  const { bridge, client } = connect;

  connect.dialogs.show((props: DialogProps) => (
    <ConfirmDialog
      title={method.vendor.name}
      question={`Sign out of ${method.vendor.name} (${method.title})?`}
      action="sign out"
      close={props.close}
      onConfirm={() => {
        bridge.run(
          client["logins/logout"]({ method: method.id }).pipe(Effect.andThen(connect.load)),
        );
      }}
    />
  ));
};

/** Runs `run` on the row's item, if there is one. */
const onRow =
  <A,>(items: () => ReadonlyArray<A>, run: (item: A) => void) =>
  (index: number) => {
    const item = items()[index];
    if (item !== undefined) run(item);
  };

const showWays = (connect: Connect, vendor: VendorMethods) => {
  const current = () =>
    vendorsOf(connect.methods()).find((each) => each.name === vendor.name)?.methods ?? [];

  const choices = (): ReadonlyArray<Choice> =>
    current().map((method) => ({ title: method.title, note: stateText(method.state) }));

  connect.dialogs.show((props: DialogProps) => (
    <ChoiceDialog
      title={vendor.name}
      hints={WAYS}
      choices={choices()}
      close={props.close}
      onChoose={onRow(current, (method) => {
        chooseWay(connect, method);
      })}
      onSignOut={onRow(current, (method) => {
        signOut(connect, method);
      })}
    />
  ));
};

/** A vendor with one method goes straight to it. */
const chooseVendor = (connect: Connect, vendor: VendorMethods) => {
  const [only, ...rest] = vendor.methods;

  if (only !== undefined && rest.length === 0) chooseWay(connect, only);
  else showWays(connect, vendor);
};

/** Signs out the vendor's one saved method; with several, lists them to pick from. */
const signOutVendor = (connect: Connect, vendor: VendorMethods) => {
  const [only, ...rest] = vendor.methods.filter(isSaved);
  if (only === undefined) return;

  if (rest.length === 0) signOut(connect, only);
  else showWays(connect, vendor);
};

const showProviders = (connect: Connect) => {
  const vendors = () => vendorsOf(connect.methods());

  connect.dialogs.show((props: DialogProps) => (
    <ChoiceDialog
      title="Connect a provider"
      hints={PROVIDERS}
      choices={vendors().map((vendor) => ({
        title: vendor.name,
        note: isSignedIn(vendor) ? "signed in" : "",
      }))}
      close={props.close}
      onChoose={onRow(vendors, (vendor) => {
        chooseVendor(connect, vendor);
      })}
      onSignOut={onRow(vendors, (vendor) => {
        signOutVendor(connect, vendor);
      })}
    />
  ));
};

/** Opens `/connect` once the methods are listed; `client` reaches the logins server. */
export const makeConnect = (bridge: Bridge, dialogs: TuiDialogsService, client: LoginsClient) => {
  const [methods, setMethods] = createSignal<ReadonlyArray<MethodInfo>>([]);

  const load = client["logins/list"]().pipe(
    Effect.flatMap((all) => Effect.sync(() => setMethods(all))),
    Effect.asVoid,
  );

  const connect: Connect = { bridge, dialogs, client, methods, load };

  return () => {
    bridge.run(
      load.pipe(
        Effect.andThen(
          Effect.sync(() => {
            showProviders(connect);
          }),
        ),
      ),
    );
  };
};
