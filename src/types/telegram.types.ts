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

export interface TelegramCallbackQuery {
  id: string;
  from: {
    id: number;
    first_name: string;
    username?: string;
  };
  message: TelegramMessage;
  data: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
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
