/** A dimmed layer over the whole screen: a dialog near its top, or a drawer on its right. */

import { RGBA } from "@opentui/core";
import type { JSX } from "@opentui/solid";

import { useColor } from "../colors.ts";

/** How much of the screen's darkest color covers what sits behind a dialog or a drawer. */
const SCRIM_OPACITY = 0.6;

/** The screen's darkest color, see-through, so what lies under it dims. */
const useScrim = () => {
  const color = useColor();

  return () => {
    const base = RGBA.fromHex(color("surface.base"));

    return RGBA.fromValues(base.r, base.g, base.b, SCRIM_OPACITY);
  };
};

export function Overlay(props: {
  readonly kind: "dialog" | "drawer";
  readonly children: JSX.Element;
}) {
  const scrim = useScrim();
  const isDialog = () => props.kind === "dialog";

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      backgroundColor={scrim()}
      alignItems={isDialog() ? "center" : "flex-end"}
      paddingTop={isDialog() ? 3 : 0}
      zIndex={10}
    >
      {props.children}
    </box>
  );
}
