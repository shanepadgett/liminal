/** The palette's options: the reachable commands marked `palette`. */

import type { ListedCommand, SelectOption } from "@liminal/sdk/tui";

/** Each palette command as an option, its keymap name the value, uncategorized ones untitled. */
export const paletteOptions = (listed: ReadonlyArray<ListedCommand>) =>
  listed.flatMap(({ command, keys }): ReadonlyArray<SelectOption<string>> =>
    command.palette === true
      ? [{ title: command.title, value: command.name, category: command.category ?? "", keys }]
      : [],
  );
