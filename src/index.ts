import { Effect, Console } from "effect";
import { unstable_v2_prompt } from "@anthropic-ai/claude-agent-sdk";

// Create a simple hello world agent program
const program = Effect.gen(function* () {
  yield* Console.log("Starting Claude Agent Hello World example...");
  yield* Console.log("Using AWS Bedrock:", process.env.CLAUDE_CODE_USE_BEDROCK);
  yield* Console.log("Model:", process.env.ANTHROPIC_MODEL);
  yield* Console.log("\nSending message to Claude Code agent...");

  // Send a simple hello world message using the SDK
  const result = yield* Effect.promise(() =>
    unstable_v2_prompt("Hello! Can you respond with a friendly greeting?", {
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
    })
  );

  yield* Console.log("\n=== Claude's Response ===");
  yield* Console.log(JSON.stringify(result, null, 2));
  yield* Console.log("========================\n");

  yield* Console.log("Hello World conversation completed successfully!");

  return result;
});

// Run the program
Effect.runPromise(program)
  .then(() => {
    console.log("\n✓ Program finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n✗ Error:", error);
    process.exit(1);
  });
