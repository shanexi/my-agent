/**
 * Custom error types using Effect's Data.TaggedError
 */
import { Data } from 'effect';

export class ConfigError extends Data.TaggedError('ConfigError')<{
  message: string;
  stack?: string;
}> {}

export class TelegramApiError extends Data.TaggedError('TelegramApiError')<{
  message: string;
  statusCode?: number;
  responseBody?: string;
  stack?: string;
}> {}

export class ClaudeApiError extends Data.TaggedError('ClaudeApiError')<{
  message: string;
  stack?: string;
}> {}

export class MessageProcessingError extends Data.TaggedError(
  'MessageProcessingError'
)<{
  message: string;
  chatId: number;
  stack?: string;
}> {}

export class McpToolError extends Data.TaggedError('McpToolError')<{
  message: string;
  toolName: string;
  toolInput?: Record<string, any>;
  stack?: string;
}> {}

export class SandboxError extends Data.TaggedError('SandboxError')<{
  message: string;
  operation: string;
  stack?: string;
}> {}

export class InterruptedError extends Data.TaggedError('InterruptedError')<{
  message: string;
}> {}
