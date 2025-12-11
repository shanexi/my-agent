/**
 * Telegram API type definitions
 */

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

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface ProcessedMessage {
  text: string;
  usage?: TokenUsage;
  modelName: string;
}
