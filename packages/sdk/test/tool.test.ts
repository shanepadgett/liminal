/** The JSON Schema a tool's params send to the model. */

import { expect, test } from "bun:test";

import { Schema } from "effect";

import { jsonSchemaOf } from "../src/core/tool.ts";

test("a tool with no params sends an object schema, as providers require", () => {
  expect(jsonSchemaOf(Schema.Struct({}))).toEqual({ type: "object", properties: {} });
});

test("a tool with params sends its fields", () => {
  expect(jsonSchemaOf(Schema.Struct({ id: Schema.String }))).toMatchObject({
    type: "object",
    properties: { id: { type: "string" } },
  });
});
