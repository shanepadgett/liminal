/** The `/connect` states and the `/model` rows for providers that list nothing draw their text. */

import { expect, test } from "bun:test";

import { testRender } from "@opentui/solid";

import { PALETTES, resolveRoles } from "@liminal/sdk/tui";

import { CONNECT_STATES } from "../src/chat/connectStates.tsx";
import { ModelPicker } from "../src/chat/ModelPicker.tsx";

const [palette] = PALETTES;

const frameOf = async (draw: () => ReturnType<(typeof CONNECT_STATES)[number]["view"]>) => {
  const setup = await testRender(draw, { width: 90, height: 30 });
  await setup.renderOnce();
  const frame = setup.captureCharFrame();
  setup.renderer.destroy();

  return frame;
};

const expected: Record<string, string> = {
  Providers: "signed in",
  Ways: "from OPENAI_API_KEY",
  Methods: "Device code",
  "API key, empty": "API key",
  "API key, typed": "••••••••••••••",
  Browser: "Waiting for the browser",
  "Device code": "QXJT-7KPD",
  Failed: "access_denied",
  "Sign out": "Sign out of OpenRouter",
};

test("each connect state draws its text", async () => {
  const frames = await Promise.all(
    CONNECT_STATES.map((state) => frameOf(() => state.view(palette))),
  );

  for (const [index, state] of CONNECT_STATES.entries()) {
    expect(frames[index]).toContain(expected[state.name] ?? state.name);
  }
});

test("a provider that lists nothing shows a sign-in row or the catalog failure", async () => {
  const color = resolveRoles(palette);
  const frame = await frameOf(() => <ModelPicker color={color} selected="" hasUnlisted />);

  expect(frame).toContain("Sign in with /connect");
  expect(frame).toContain("models.dev is unreachable");
});
