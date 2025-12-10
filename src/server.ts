/**
 * Hono Web Server for Telegram Bot
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { unstable_v2_prompt } from "@anthropic-ai/claude-agent-sdk";
import { Effect, Console, Schedule } from "effect";

const app = new Hono();

const TELEGRAM_API_BASE = "https://api.telegram.org";

interface TelegramMessage {
  message_id: number;
  from?: {
    id: number;
    first_name: string;
    username?: string;
  };
  chat: {
    id: number;
    type: string;
  };
  text?: string;
  date: number;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

/**
 * Send a message to Telegram chat with timeout and retry logic
 */
const sendMessage = (chatId: number, text: string) =>
  Effect.gen(function* () {
    // Get bot token
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      yield* Effect.fail(new Error("TELEGRAM_BOT_TOKEN is not configured"));
    }

    const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;

    // Send request with timeout and retry
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: text,
          }),
        }),
      catch: (error: unknown) => new Error(`Fetch failed: ${error}`),
    }).pipe(
      Effect.timeout("10 seconds"),
      Effect.retry(
        Schedule.exponential("1 second").pipe(
          Schedule.compose(Schedule.recurs(2)) // 3 total attempts (1 initial + 2 retries)
        )
      ),
      Effect.tapError((error: unknown) =>
        Console.error(`Failed to send message: ${error}`)
      )
    );

    // Check response status
    if (!response.ok) {
      const errorText = yield* Effect.tryPromise(() => response.text());
      yield* Effect.fail(new Error(`Telegram API error: ${errorText}`));
    }
  });

/**
 * Send a chat action (e.g., "typing") to show bot is processing
 */
const sendChatAction = (chatId: number, action: "typing" = "typing") =>
  Effect.gen(function* () {
    // Get bot token
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return; // Silently fail for non-critical action
    }

    const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendChatAction`;

    // Send request with timeout
    yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: chatId,
            action: action,
          }),
        }),
      catch: (error: unknown) => new Error(`Failed to send chat action: ${error}`),
    }).pipe(
      Effect.timeout("5 seconds"),
      Effect.catchAll((error: unknown) =>
        // Silently fail for non-critical action
        Console.error(`Chat action error: ${error}`).pipe(Effect.as(undefined))
      )
    );
  });

/**
 * Process a message using Claude Agent
 */
const processMessage = (message: string) =>
  Effect.gen(function* () {
    const modelName =
      process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

    const result = yield* Effect.tryPromise({
      try: () => unstable_v2_prompt(message, { model: modelName }),
      catch: (error: unknown) => {
        console.error("Claude Agent error:", error);
        return new Error("抱歉，处理您的消息时出现了错误。请稍后再试。");
      },
    });

    // Handle both success and error responses
    if (result.subtype === "success") {
      return result.result;
    } else {
      const errors =
        "errors" in result ? result.errors.join("; ") : "Unknown error";
      return `处理消息时出现错误: ${errors}`;
    }
  });

/**
 * Process message and send response
 */
const processAndRespond = (chatId: number, text: string) =>
  Effect.gen(function* () {
    // Step 1: Send typing indicator
    yield* sendChatAction(chatId, "typing");

    // Step 2: Process message with Claude Agent
    yield* Console.log("Processing with Claude Agent...");
    const response = yield* processMessage(text);

    // Step 3: Send response back to user
    yield* Console.log(`Sending response to ${chatId}: ${response.substring(0, 50)}...`);
    yield* sendMessage(chatId, response);

    yield* Console.log("Message processed successfully");
  }).pipe(
    Effect.catchAll((error: unknown) =>
      Effect.gen(function* () {
        yield* Console.error("Error in processing:", error);

        // Try to send error message to user
        yield* sendMessage(chatId, "抱歉，处理您的消息时出现了错误。请稍后再试。").pipe(
          Effect.catchAll((sendError: unknown) =>
            Console.error("Failed to send error message:", sendError)
          )
        );
      })
    )
  );

// Health check endpoint
app.get("/", (c) => {
  return c.json({
    status: "ok",
    message: "Telegram bot server is running",
  });
});

// Telegram webhook endpoint
app.post("/webhook", async (c) => {
  try {
    const update: TelegramUpdate = await c.req.json();

    // Validate update has a message
    if (!update.message || !update.message.text) {
      return c.json({ ok: true });
    }

    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text!; // Already validated above

    console.log(`Received message from ${chatId}: ${text}`);

    // Process message (wait for completion)
    await Effect.runPromise(processAndRespond(chatId, text));

    return c.json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return c.json({ ok: true });
  }
});

const port = parseInt(process.env.PORT || "3000");

console.log(`Starting server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server is running on http://localhost:${port}`);
