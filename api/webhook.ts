/**
 * Telegram Webhook Handler for Vercel Serverless
 *
 * This endpoint receives updates from Telegram and processes them asynchronously.
 * Using approach #1: Immediate response + async processing
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { TelegramUpdate } from "../src/telegram";
import { sendMessage, sendChatAction } from "../src/telegram";
import { processMessage } from "../src/agent";

/**
 * Main webhook handler
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only accept POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const update: TelegramUpdate = req.body;

    // Validate update has a message
    if (!update.message || !update.message.text) {
      return res.status(200).json({ ok: true });
    }

    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text;

    console.log(`Received message from ${chatId}: ${text}`);

    // Immediately return 200 OK to Telegram
    res.status(200).json({ ok: true });

    // Process message asynchronously (won't block the response)
    processMessageAsync(chatId, text).catch((error) => {
      console.error("Error processing message:", error);
    });
  } catch (error) {
    console.error("Webhook error:", error);
    // Still return 200 to avoid Telegram retries
    return res.status(200).json({ ok: true });
  }
}

/**
 * Process the message asynchronously after responding to webhook
 */
async function processMessageAsync(
  chatId: number,
  text: string
): Promise<void> {
  try {
    // Step 1: Send typing indicator
    await sendChatAction(chatId, "typing");

    // Step 2: Process message with Claude Agent
    console.log("Processing with Claude Agent...");
    const response = await processMessage(text);

    // Step 3: Send response back to user
    console.log(`Sending response to ${chatId}: ${response.text.substring(0, 50)}...`);
    await sendMessage(chatId, response.text);

    // Log metrics
    console.log(
      `Message processed in ${response.durationMs}ms, cost: $${response.costUSD}`
    );
  } catch (error) {
    console.error("Error in async processing:", error);

    // Try to send error message to user
    try {
      await sendMessage(
        chatId,
        "抱歉，处理您的消息时出现了错误。请稍后再试。"
      );
    } catch (sendError) {
      console.error("Failed to send error message:", sendError);
    }
  }
}
