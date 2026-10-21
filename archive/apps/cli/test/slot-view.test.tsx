import { expect, test } from "bun:test";

import { createTestRenderer } from "@opentui/core/testing";
import { render } from "@opentui/solid";
import { createSignal } from "solid-js";

import { Slot } from "@liminal/sdk";
import { type SlotEntry, type SlotSource, SlotSourceContext, SlotView } from "@liminal/sdk/tui";

const Line = Slot.chain<{ readonly count: number }, true>("test/line", { scope: "root" });

test("a chain slot keeps its component mounted while the owner's props change", async () => {
  const setup = await createTestRenderer({ width: 20, height: 2 });
  const [count, setCount] = createSignal(0);
  let mounts = 0;

  const entry: SlotEntry = {
    id: 1,
    component: (props: { readonly count: number }) => {
      mounts += 1;

      return <text>{`count ${props.count}`}</text>;
    },
    meta: undefined,
    select: () => true,
  };

  const source: SlotSource = { winner: () => {}, listed: () => [], chained: () => [entry] };

  await render(
    () => (
      <SlotSourceContext.Provider value={source}>
        <SlotView of={Line} props={{ count: count() }} />
      </SlotSourceContext.Provider>
    ),
    setup.renderer,
  );

  setCount(1);
  setCount(2);
  await setup.renderOnce();
  const frame = setup.captureCharFrame();
  setup.renderer.destroy();

  expect(frame).toContain("count 2");
  expect(mounts).toBe(1);
});
