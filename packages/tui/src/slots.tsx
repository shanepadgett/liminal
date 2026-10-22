/**
 * Named places on screen that plugins fill. A slot's mode says how fills share it: `append` draws
 * every fill in order, `replace` and `single_winner` draw the last one.
 */
import type { SlotMode, SlotRegistry } from "@opentui/core";
import { type JSX, Slot } from "@opentui/solid";
import { Context, Effect, type Scope } from "effect";
import { createContext, splitProps, untrack, useContext } from "solid-js";

// oxlint-disable-next-line liminal/no-loose-dictionaries -- the registry holds every slot; each slot's handle types its props.
type SlotProps = Record<string, object>;

type Registry = SlotRegistry<JSX.Element, SlotProps>;

export interface SlotHandle<Props extends object> {
  readonly name: string;
  readonly mode: SlotMode;
  /** Types only: the props the slot gives each fill. */
  readonly "~props"?: Props;
}

export const defineSlot = <Props extends object>(
  name: string,
  mode: SlotMode,
): SlotHandle<Props> => ({ name, mode });

/** The whole screen; the last fill wins. */
export const screen = defineSlot<object>("screen", "single_winner");

export class Slots extends Context.Service<
  Slots,
  {
    /**
     * Draws `component` in `slot` until the caller's scope closes; lower `order` draws first. The
     * component must return one element that stays: the slot draws it again, from fresh state,
     * whenever the element it returned changes.
     */
    readonly fill: <Props extends object>(
      slot: SlotHandle<Props>,
      component: (props: Props) => JSX.Element,
      order?: number,
    ) => Effect.Effect<void, never, Scope.Scope>;
    /** What `SlotView` draws from. */
    readonly registry: Registry;
  }
>()("tui/Slots") {}

export const makeSlots = (registry: Registry): Slots["Service"] => {
  let fills = 0;

  const fill = <Props extends object>(
    slot: SlotHandle<Props>,
    component: (props: Props) => JSX.Element,
    order = 0,
  ) => {
    fills += 1;
    const id = `${slot.name}#${fills}`;

    const register = Effect.sync(() =>
      registry.register({
        id,
        order,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SlotView draws `slot` with the props its handle names.
        slots: { [slot.name]: (_context, props) => untrack(() => component(props as Props)) },
      }),
    );

    return Effect.asVoid(Effect.acquireRelease(register, (unregister) => Effect.sync(unregister)));
  };

  return { fill, registry };
};

const RegistryContext = createContext<Registry>();

export const RegistryProvider = RegistryContext.Provider;

/** Draws `slot`'s fills with the given props, or `children` while nothing fills it. */
export function SlotView<Props extends object>(
  props: { readonly slot: SlotHandle<Props>; readonly children?: JSX.Element } & Props,
) {
  const registry = useContext(RegistryContext);
  if (registry === undefined) throw new Error("A SlotView ran outside the TUI's root.");
  const [local, rest] = splitProps(props, ["slot", "children"]);

  return (
    <Slot registry={registry} name={local.slot.name} mode={local.slot.mode} {...rest}>
      {local.children}
    </Slot>
  );
}
