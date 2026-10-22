/** A thin line across the width, with an optional label set into it. */

import { useColor } from "../colors.ts";

export function Rule(props: { readonly label?: string }) {
  const color = useColor();

  return (
    <box
      height={1}
      border={["top"]}
      borderColor={color("border.subtle")}
      titleColor={color("text.faint")}
      {...(props.label === undefined ? {} : { title: ` ${props.label} ` })}
    />
  );
}
