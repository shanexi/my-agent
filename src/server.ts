/**
 * Hono Web Server for Telegram Bot
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import { Effect, Console, Schedule } from "effect";

const app = new Hono();

const TELEGRAM_API_BASE = "https://api.telegram.org";

/**
 * Initialize Anthropic Bedrock client
 */
const anthropic = new AnthropicBedrock({
  awsRegion: process.env.AWS_REGION || "us-west-2",
  awsAccessKey: process.env.AWS_ACCESS_KEY_ID,
  awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
});

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

interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

interface ProcessedMessage {
  text: string;
  usage?: TokenUsage;
  modelName: string;
}

/**
 * Model pricing configuration (AWS Bedrock pricing per 1M tokens)
 */
interface ModelPricing {
  input: number;
  output: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude Sonnet 4.5
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },

  // Claude Opus 4
  "us.anthropic.claude-opus-4-20250514-v1:0": { input: 15.0, output: 75.0 },
  "claude-opus-4-20250514": { input: 15.0, output: 75.0 },

  // Claude Haiku 4
  "us.anthropic.claude-haiku-4-20250514-v1:0": { input: 0.8, output: 4.0 },
  "claude-haiku-4-20250514": { input: 0.8, output: 4.0 },
};

/**
 * Get pricing for a model (defaults to Sonnet 4.5 pricing)
 */
const getModelPricing = (modelName: string): ModelPricing => {
  return MODEL_PRICING[modelName] || { input: 3.0, output: 15.0 };
};

/**
 * Calculate cost based on token usage and model
 */
const calculateCost = (usage: TokenUsage, modelName: string): number => {
  const pricing = getModelPricing(modelName);
  const inputCost = (usage.input_tokens / 1_000_000) * pricing.input;
  const outputCost = (usage.output_tokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
};

/**
 * Get a short display name for the model
 */
const getModelDisplayName = (modelName: string): string => {
  if (modelName.includes("sonnet")) return "Sonnet 4.5";
  if (modelName.includes("opus")) return "Opus 4";
  if (modelName.includes("haiku")) return "Haiku 4";
  return modelName;
};

/**
 * Format cost information for display (simple version)
 */
const formatCostInfo = (usage: TokenUsage, modelName: string): string => {
  const cost = calculateCost(usage, modelName);
  const pricing = getModelPricing(modelName);
  const displayName = getModelDisplayName(modelName);

  return `\n\n━━━━━━━━━━━━━━━━
🤖 ${displayName}
💰 Cost: $${cost.toFixed(6)}
📊 Tokens: ${usage.input_tokens.toLocaleString()} → ${usage.output_tokens.toLocaleString()}
💵 Rate: $${pricing.input}/M in, $${pricing.output}/M out`;
};

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
 * Process a message using Claude via Bedrock
 */
const processMessage = (message: string) =>
  Effect.gen(function* () {
    const modelName =
      process.env.ANTHROPIC_MODEL ||
      "us.anthropic.claude-sonnet-4-5-20250929-v1:0";

    const result = yield* Effect.tryPromise({
      try: () =>
        anthropic.messages.create({
          model: modelName,
          max_tokens: 8192,
          messages: [{ role: "user", content: message }],
        }),
      catch: (error: unknown) => {
        console.error("Claude API error:", error);
        return new Error("抱歉，处理您的消息时出现了错误。请稍后再试。");
      },
    });

    // Extract text from response content
    const textContent = result.content.find((block) => block.type === "text");
    const responseText = textContent && "text" in textContent ? textContent.text : "无法生成响应";

    const processedMessage: ProcessedMessage = {
      text: responseText,
      modelName: modelName,
      usage: result.usage
        ? {
            input_tokens: result.usage.input_tokens,
            output_tokens: result.usage.output_tokens,
          }
        : undefined,
    };

    return processedMessage;
  });

/**
 * Process message and send response
 */
const processAndRespond = (chatId: number, text: string) =>
  Effect.gen(function* () {
    // Step 1: Send typing indicator
    yield* sendChatAction(chatId, "typing");

    // Step 2: Process message with Claude via Bedrock
    yield* Console.log("Processing with Claude via Bedrock...");
    const response = yield* processMessage(text);

    // Step 3: Append cost info to response text
    const responseText = response.usage
      ? response.text + formatCostInfo(response.usage, response.modelName)
      : response.text;

    // Step 4: Send response back to user
    yield* Console.log(`Sending response to ${chatId}: ${response.text.substring(0, 50)}...`);
    yield* sendMessage(chatId, responseText);

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
