/**
 * Runs a command and prints nothing when it passes. When it fails, prints its output and exits with
 * its code. Usage: bun tools/quiet.ts <command> [args...]
 */
import process from "node:process";

import { runCommand } from "./run.ts";

const command = process.argv.slice(2);

if (command.length === 0) {
  console.error("usage: bun tools/quiet.ts <command> [args...]");
  process.exit(2);
}

const { stdout, stderr, code } = await runCommand(command, process.cwd());

if (code !== 0) {
  const output = [stdout, stderr].map((text) => text.trim()).filter((text) => text.length > 0);
  console.error(output.join("\n") || `${command.join(" ")} exited with ${code}`);
  process.exit(code);
}
