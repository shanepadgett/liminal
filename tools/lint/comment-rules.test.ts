import {
  disableNeedsReason,
  maxCommentWords,
  noCommentedCode,
  noDividerComments,
  noEmDash,
  noJargon,
  noNarrationComments,
  noPlaceholderComments,
  preferJsDoc,
} from "./comment-rules.ts";
import { testRule } from "./rule-tester.ts";

const file = "packages/kernel/src/example.ts";

testRule("no-narration-comments", noNarrationComments, {
  valid: [{ filename: file, code: "// Retries stop after the session closes.\nrun();" }],
  invalid: [
    { filename: file, code: "// This function handles the request\nrun();", errors: 1 },
    { filename: file, code: "// Step 1: validate input\nrun();", errors: 1 },
    { filename: file, code: "// Now we parse the body\nrun();", errors: 1 },
  ],
});

testRule("no-placeholder-comments", noPlaceholderComments, {
  valid: [{ filename: file, code: "// Keys are sorted so snapshots are stable.\nrun();" }],
  invalid: [
    { filename: file, code: "// ... rest of the code\nrun();", errors: 1 },
    { filename: file, code: "// quick hack, good enough for now\nrun();", errors: 1 },
    {
      filename: file,
      code: "/* Replace with your actual implementation here */\nrun();",
      errors: 1,
    },
  ],
});

testRule("no-divider-comments", noDividerComments, {
  valid: [{ filename: file, code: "// a - b\nrun();" }],
  invalid: [
    { filename: file, code: "// ==========\nrun();", errors: 1 },
    { filename: file, code: "// --- Helpers ---\nrun();", errors: 1 },
  ],
});

testRule("no-commented-code", noCommentedCode, {
  valid: [
    { filename: file, code: "// Return early when the cache is warm.\nrun();" },
    { filename: file, code: "/**\n * @example\n * run();\n */\nexport const run = () => 1;" },
  ],
  invalid: [
    { filename: file, code: "// const value = load();\nrun();", errors: 1 },
    { filename: file, code: "// run(1, 2);\nrun();", errors: 1 },
    { filename: file, code: "// if (ready) {\nrun();", errors: 1 },
  ],
});

testRule("no-jargon", noJargon, {
  valid: [{ filename: file, code: "// Uses the `robust` flag from the config.\nrun();" }],
  invalid: [
    {
      filename: file,
      code: "/** Seamlessly leverages the cache. */\nexport const a = 1;",
      errors: 1,
    },
  ],
});

testRule("no-em-dash", noEmDash, {
  valid: [{ filename: file, code: "const a = 'one - two';" }],
  invalid: [
    { filename: file, code: "const a = 'one \u2014 two';", errors: 1 },
    { filename: file, code: "// one \u2014 two \u2014 three\nrun();", errors: 2 },
  ],
});

const words = (count: number) => Array.from({ length: count }, () => "word").join(" ");

testRule("max-comment-words", maxCommentWords, {
  valid: [
    { filename: file, code: `// ${words(30)}\n// ${words(20)}\nrun();` },
    { filename: file, code: `/** ${words(80)} */\nexport const a = 1;` },
  ],
  invalid: [{ filename: file, code: `// ${words(30)}\n// ${words(21)}\nrun();`, errors: 1 }],
});

testRule("prefer-jsdoc", preferJsDoc, {
  valid: [
    { filename: file, code: "/** Docs. */\nexport const a = 1;" },
    { filename: file, code: "// Not attached.\n\nexport const a = 1;" },
  ],
  invalid: [
    {
      filename: file,
      code: "// Docs.\nexport const a = 1;",
      output: "/** Docs. */\nexport const a = 1;",
      errors: 1,
    },
    {
      filename: file,
      code: "// One.\n// Two.\nexport const a = 1;",
      output: "/**\n * One.\n * Two.\n */\nexport const a = 1;",
      errors: 1,
    },
  ],
});

testRule("disable-needs-reason", disableNeedsReason, {
  valid: [
    {
      filename: file,
      code: "// oxlint-disable-next-line no-console -- the CLI prints\nconsole.log(1);",
    },
  ],
  invalid: [
    { filename: file, code: "// oxlint-disable-next-line no-console\nconsole.log(1);", errors: 1 },
  ],
});
