/** A fixed sample conversation that exercises every kind of message and tool state. */

import type { RoleColor } from "../tokens/roles.ts";
import { AssistantMessage, Prose, UserMessage } from "./Message.tsx";
import { ToolCall } from "./ToolCall.tsx";

export function Conversation(props: { readonly color: RoleColor }) {
  return (
    <box flexDirection="column" gap={1} paddingX={2} paddingY={1}>
      <UserMessage color={props.color} isFocused={false}>
        explain how the plugin host boots
      </UserMessage>
      <AssistantMessage>
        <Prose color={props.color}>
          The host reads every manifest first, without loading plugin code. It resolves the
          dependency graph from what each plugin provides and requires, then activates plugins in
          graph order, running independent ones at the same time.
        </Prose>
        <box flexDirection="column">
          <ToolCall color={props.color} status="success" name="Read" param="kernel/src/host.ts" />
          <ToolCall
            color={props.color}
            status="success"
            name="Grep"
            param="definePlugin in plugins/ and sdk/src/ (12 matches across 9 files)"
          />
          <ToolCall
            color={props.color}
            status="error"
            name="Bash"
            param="bun test kernel"
            output={{
              lines: ["bun test v1.3.0", "41 pass", "1 fail: activates in graph order"],
              hidden: 14,
            }}
            error="exit code 1"
          />
        </box>
        <Prose color={props.color}>
          One test fails: two plugins with no dependency between them activate in a fixed order, but
          the test expects them to start together.
        </Prose>
      </AssistantMessage>
      <UserMessage color={props.color} isFocused>
        fix the test so it checks they start concurrently
      </UserMessage>
      <AssistantMessage>
        <ToolCall
          color={props.color}
          status="pending"
          name="Edit"
          param="kernel/test/host.test.ts"
        />
      </AssistantMessage>
    </box>
  );
}
