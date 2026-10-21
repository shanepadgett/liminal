/** Tool search: the name and params of `tool_search`, and what a finished search keeps for display. */

import { Schema } from "effect";

export const toolSearchTool = "tool_search";

/** A query starting with this loads the tools it names, comma separated. */
export const selectPrefix = "select:";

export const SearchParams = Schema.Struct({
  query: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(500)).annotate({
    description: `Keywords for the tools you need, or \`${selectPrefix}a,b\` to load tools by name`,
  }),
  limit: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 })).annotate({
      description: "Most tools to load; 5 when left out",
    }),
  ),
});

export type SearchParams = typeof SearchParams.Type;

/** A finished search's details: the tools it loaded, by name. */
export const SearchDetails = Schema.Struct({ loaded: Schema.Array(Schema.String) });
