/**
 * A web page as light Markdown for a model: headings, list items, fenced code, inline code and
 * links, and no scripts, styles or other markup. Bun's HTMLRewriter walks the page in document
 * order.
 */

/** Elements whose content is not read. */
const hidden = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "head",
  "iframe",
  "canvas",
]);

/** Elements that start and end on their own lines. */
const blocks = [
  "p",
  "div",
  "section",
  "article",
  "main",
  "header",
  "footer",
  "nav",
  "aside",
  "ul",
  "ol",
  "table",
  "tr",
  "blockquote",
  "dt",
  "dd",
  "figure",
];

type Mark = readonly [start: string, end: string];

const headings = [1, 2, 3, 4, 5, 6].map((level): readonly [string, Mark] => [
  `h${level}`,
  [`\n\n${"#".repeat(level)} `, "\n\n"],
]);

/** What each element adds before and after its content. */
const marks = new Map<string, Mark>([
  ...blocks.map((tag): readonly [string, Mark] => [tag, ["\n", "\n"]]),
  ...headings,
  ["li", ["\n- ", ""]],
  ["br", ["\n", ""]],
  ["hr", ["\n\n---\n\n", ""]],
  ["td", [" ", " "]],
  ["th", [" ", " "]],
]);

const fence = "```";

const entities = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
]);

const maxCodePoint = 0x10_ffff;

const codePointOf = (name: string) =>
  name.startsWith("#x") || name.startsWith("#X")
    ? Number.parseInt(name.slice(2), 16)
    : Number.parseInt(name.slice(1), 10);

const decoded = (text: string) =>
  text.replaceAll(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (whole, name: string) => {
    if (!name.startsWith("#")) return entities.get(name.toLowerCase()) ?? whole;

    const point = codePointOf(name);

    return point <= maxCodePoint ? String.fromCodePoint(point) : whole;
  });

/** Lines outside code fences with spaces collapsed and trimmed, and at most one blank line. */
const tidied = (text: string) => {
  const kept: Array<string> = [];
  let inFence = false;

  for (const raw of text.split("\n")) {
    const isFence = raw.trim() === fence;
    const line = inFence && !isFence ? raw : raw.replaceAll(/[ \t\f\r]+/gu, " ").trim();
    if (isFence) inFence = !inFence;

    const blankAgain = line === "" && !inFence && (kept.at(-1) ?? "") === "";
    if (!blankAgain) kept.push(line);
  }

  return kept.join("\n").trim();
};

/** What the walk keeps: the text so far, and the hidden and `pre` elements it is inside. */
interface Walk {
  readonly base: string;
  readonly out: Array<string>;
  readonly hiddenOpen: Array<string>;
  readonly preOpen: Array<string>;
}

/** `href` as an absolute http(s) address, or nothing. */
const linkOf = (href: string | null, base: string) => {
  const url = href === null ? null : URL.parse(href, base);
  const isWeb = url !== null && (url.protocol === "http:" || url.protocol === "https:");

  return isWeb ? url.href : undefined;
};

/** Whether `element` closes later; void and self-closing elements do not. */
const hasEnd = (element: HTMLRewriterTypes.Element) =>
  !element.selfClosing && element.canHaveContent;

/** What `element` adds around its content, given where the walk is. */
const markOf = (walk: Walk, element: HTMLRewriterTypes.Element): Mark | undefined => {
  const tag = element.tagName;
  if (walk.preOpen.length > 0) return marks.has(tag) ? ["\n", "\n"] : undefined;
  if (tag === "code") return ["`", "`"];

  return marks.get(tag);
};

/** A link with words as `[words](url)`; one without words, such as an icon, leaves no mark. */
const link = (walk: Walk, element: HTMLRewriterTypes.Element) => {
  const url = linkOf(element.getAttribute("href"), walk.base);
  if (url === undefined || !hasEnd(element)) return;

  const at = walk.out.length;
  walk.out.push("[");

  element.onEndTag(() => {
    const words = walk.out
      .slice(at + 1)
      .join("")
      .trim();

    if (words === "") walk.out.splice(at, 1);
    else walk.out.push(`](${url})`);
  });
};

/**
 * Pushes `start`, and `end` when the element closes. `inside`, when given, holds the element while
 * it is open. An element takes one end tag handler, so this is its only one.
 */
const around = (
  walk: Walk,
  element: HTMLRewriterTypes.Element,
  [start, end]: Mark,
  inside?: Array<string>,
) => {
  walk.out.push(start);

  if (!hasEnd(element)) {
    walk.out.push(end);

    return;
  }

  inside?.push(element.tagName);

  element.onEndTag(() => {
    inside?.pop();
    walk.out.push(end);
  });
};

/** Tracks `element` in `open` until it closes. */
const track = (open: Array<string>, element: HTMLRewriterTypes.Element) => {
  if (!hasEnd(element)) return;

  open.push(element.tagName);

  element.onEndTag(() => {
    open.pop();
  });
};

const onElement = (walk: Walk) => (element: HTMLRewriterTypes.Element) => {
  const tag = element.tagName;

  if (hidden.has(tag)) {
    track(walk.hiddenOpen, element);

    return;
  }

  if (walk.hiddenOpen.length > 0) return;

  if (tag === "pre") {
    around(walk, element, [`\n${fence}\n`, `\n${fence}\n`], walk.preOpen);

    return;
  }

  if (tag === "a" && walk.preOpen.length === 0) {
    link(walk, element);

    return;
  }

  const mark = markOf(walk, element);
  if (mark !== undefined) around(walk, element, mark);
};

const onText = (walk: Walk) => (chunk: HTMLRewriterTypes.Text) => {
  if (walk.hiddenOpen.length > 0) return;

  walk.out.push(walk.preOpen.length > 0 ? chunk.text : chunk.text.replaceAll(/\s+/gu, " "));
};

/** The page's text as Markdown; relative links resolve against `base`, the page's address. */
export const markdownOf = (html: string, base: string) => {
  const walk: Walk = { base, out: [], hiddenOpen: [], preOpen: [] };

  new HTMLRewriter()
    .on("*", { element: onElement(walk) })
    .onDocument({ text: onText(walk) })
    .transform(html);

  return tidied(decoded(walk.out.join("")));
};
