/**
 * A web page as plain text for a model: the words and line breaks, each link's address after its
 * words, and no scripts, styles or markup. Bun's HTMLRewriter walks the page in document order.
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
const blocks = new Set([
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
  "li",
  "table",
  "tr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "pre",
  "blockquote",
  "dt",
  "dd",
  "figure",
]);

const entities: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const maxCodePoint = 0x10_ffff;

const codePointOf = (name: string) =>
  name.startsWith("#x") || name.startsWith("#X")
    ? Number.parseInt(name.slice(2), 16)
    : Number.parseInt(name.slice(1), 10);

const decoded = (text: string) =>
  text.replaceAll(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (!name.startsWith("#")) return entities[name.toLowerCase()] ?? whole;

    const point = codePointOf(name);

    return point <= maxCodePoint ? String.fromCodePoint(point) : whole;
  });

const tidied = (text: string) =>
  text
    .split("\n")
    .map((line) => line.replaceAll(/[ \t\f\r]+/g, " ").trim())
    .join("\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();

/** What the walk keeps: the text so far, and the hidden elements it is inside. */
interface Walk {
  readonly out: Array<string>;
  readonly hiddenOpen: Array<string>;
}

const onElement = (walk: Walk) => (element: HTMLRewriterTypes.Element) => {
  const tag = element.tagName;

  if (tag === "br" || tag === "hr") {
    walk.out.push("\n");

    return;
  }

  if (hidden.has(tag)) {
    walk.hiddenOpen.push(tag);

    element.onEndTag(() => {
      walk.hiddenOpen.pop();
    });

    return;
  }

  if (blocks.has(tag)) {
    walk.out.push("\n");

    element.onEndTag(() => {
      walk.out.push("\n");
    });

    return;
  }

  const href = tag === "a" ? element.getAttribute("href") : null;

  if (href !== null && /^https?:/.test(href)) {
    element.onEndTag(() => {
      if (walk.hiddenOpen.length === 0) walk.out.push(` (${href})`);
    });
  }
};

/** The page's text. */
export const htmlText = (html: string) => {
  const walk: Walk = { out: [], hiddenOpen: [] };

  new HTMLRewriter()
    .on("*", { element: onElement(walk) })
    .onDocument({
      text: (chunk) => {
        if (walk.hiddenOpen.length === 0) walk.out.push(chunk.text);
      },
    })
    .transform(html);

  return tidied(decoded(walk.out.join("")));
};
