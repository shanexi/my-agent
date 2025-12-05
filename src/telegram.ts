/**
 * Telegram API utilities
 */

const TELEGRAM_API_BASE = "https://api.telegram.org";

export interface TelegramMessage {
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

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

/**
 * Send a message to Telegram chat
 */
export async function sendMessage(
  chatId: number,
  text: string,
  token?: string
): Promise<void> {
  const botToken = token || process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram API error: ${error}`);
  }
}

/**
 * Send a chat action (e.g., "typing") to show bot is processing
 */
export async function sendChatAction(
  chatId: number,
  action: "typing" | "upload_photo" | "record_video" | "upload_document" = "typing",
  token?: string
): Promise<void> {
  const botToken = token || process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendChatAction`;

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      action: action,
    }),
  });
}
