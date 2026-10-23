/**
 * A picked tag becomes a virtual extmark in the draft, so the cursor steps over it and one
 * backspace removes it. It shows in the syntax style's inline code.
 */
import type { ExtmarkOptions, SyntaxStyle, TextareaRenderable } from "@opentui/core";

import { type DraftToken, replaceToken } from "@shanepadgett/liminal-chat/tui";

import { tagText } from "../contract.ts";

const TAG_STYLE = "markup.raw.inline";

/** Puts `tag` in place of `token` as one unit, then a space. */
export const writeTag = (
  draft: TextareaRenderable,
  token: DraftToken,
  tag: string,
  style: SyntaxStyle,
) => {
  const text = tagText(tag);
  replaceToken(draft, token, `${text} `);

  const mark: ExtmarkOptions = {
    start: token.start,
    end: token.start + draft.editBuffer.measureText(text),
    virtual: true,
  };

  const styleId = style.getStyleId(TAG_STYLE);
  if (styleId !== null) mark.styleId = styleId;
  draft.extmarks.create(mark);
};
