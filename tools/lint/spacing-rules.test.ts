import { testRule } from "./rule-tester.ts";
import { paddingLines } from "./spacing-rules.ts";

const file = "packages/kernel/src/example.ts";

testRule("padding-lines", paddingLines, {
  valid: [
    { filename: file, code: "const a = 1;\nconst b = 2;" },
    { filename: file, code: "function f() {\n  return 1;\n}" },
    { filename: file, code: "function f() {\n  const a = 1;\n\n  return a;\n}" },
    { filename: file, code: "const a = 1;\n\nif (a) {\n  run();\n}\n\nconst b = 2;" },
    { filename: file, code: "if (a) return;\nconst b = 2;" },
    { filename: file, code: 'import {\n  a,\n  b,\n} from "x";\nimport c from "y";' },
    { filename: file, code: "const a = 1;\n\n// why\nif (a) {\n  run();\n}" },
    {
      filename: file,
      code: "function f(a: string): void;\nfunction f(a: number): void;\nfunction f(a: unknown) {\n  run(a);\n}",
    },
  ],
  invalid: [
    {
      filename: file,
      code: "function f() {\n  const a = 1;\n  return a;\n}",
      output: "function f() {\n  const a = 1;\n\n  return a;\n}",
      errors: 1,
    },
    {
      filename: file,
      code: "const a = 1;\nif (a) {\n  run();\n}\nconst b = 2;",
      output: "const a = 1;\n\nif (a) {\n  run();\n}\n\nconst b = 2;",
      errors: 2,
    },
    {
      filename: file,
      code: "const a = 1;\n// why\nif (a) {\n  run();\n}",
      output: "const a = 1;\n\n// why\nif (a) {\n  run();\n}",
      errors: 1,
    },
    {
      filename: file,
      code: "class A {\n  a = 1;\n  run() {\n    go();\n  }\n}",
      output: "class A {\n  a = 1;\n\n  run() {\n    go();\n  }\n}",
      errors: 1,
    },
    {
      filename: file,
      code: "switch (a) {\n  case 1:\n    go();\n    return;\n}",
      output: "switch (a) {\n  case 1:\n    go();\n\n    return;\n}",
      errors: 1,
    },
  ],
});
