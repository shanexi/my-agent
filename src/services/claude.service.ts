/**
 * Claude Service
 * Handles Claude AI API interactions via AWS Bedrock
 */
import { injectable, inject } from 'inversify';
import { Effect, Console } from 'effect';
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import type {
  Message,
  ContentBlock,
  MessageParam,
} from '@anthropic-ai/sdk/resources/messages.js';
import { ConfigService, ConfigServiceImpl } from './config.service.js';
import { McpService, McpServiceImpl, type McpTool } from './mcp.service.js';
import { ConversationService, ConversationServiceImpl } from './conversation.service.js';
import { ClaudeApiError, InterruptedError } from '../errors/index.js';
import type { ProcessedMessage } from '../types/telegram.types.js';

export const ClaudeService = Symbol.for('ClaudeService');

// System prompt removed for MVP/POC - let Claude use tools naturally
// Tool descriptions provide sufficient guidance
// const SYSTEM_PROMPT = `...`;

@injectable()
export class ClaudeServiceImpl {
  private anthropic: AnthropicBedrock | null = null;

  constructor(
    @inject(ConfigService) private config: ConfigServiceImpl,
    @inject(McpService) private mcp: McpServiceImpl,
    @inject(ConversationService) private conversation: ConversationServiceImpl
  ) {}

  private getClient = Effect.fn('ClaudeService.getClient')(function* (
    this: ClaudeServiceImpl
  ) {
    if (!this.anthropic) {
      const { awsRegion, awsAccessKey, awsSecretKey } =
        yield* this.config.getAllAwsConfig();

      this.anthropic = new AnthropicBedrock({
        awsRegion,
        awsAccessKey,
        awsSecretKey,
      });
    }
    return this.anthropic;
  });

  private callApi = Effect.fn('ClaudeService.callApi')(function* (
    this: ClaudeServiceImpl,
    client: AnthropicBedrock,
    modelName: string,
    messages: MessageParam[],
    tools: McpTool[]
  ) {
    yield* Effect.annotateCurrentSpan('messageCount', messages.length);
    yield* Effect.annotateCurrentSpan('toolCount', tools.length);

    const result: Message = yield* Effect.tryPromise({
      try: (signal) =>
        client.messages.create(
          {
            model: modelName,
            max_tokens: 8192,
            messages,
            tools,
          },
          {
            signal,
          }
        ),
      catch: (e) => {
        return new ClaudeApiError({
          message: `Claude API error: ${e}`,
          stack: e instanceof Error ? e.stack : undefined,
        });
      },
    });

    yield* Effect.annotateCurrentSpan('stopReason', result.stop_reason);
    yield* Effect.annotateCurrentSpan(
      'inputTokens',
      result.usage?.input_tokens || 0
    );
    yield* Effect.annotateCurrentSpan(
      'outputTokens',
      result.usage?.output_tokens || 0
    );

    return result;
  });


  private handleToolUse = Effect.fn('ClaudeService.handleToolUse')(function* (
    this: ClaudeServiceImpl,
    toolUseBlock: ContentBlock
  ) {
    if (toolUseBlock.type !== 'tool_use') {
      return yield* Effect.fail(
        new ClaudeApiError({
          message: 'Invalid tool use block type',
        })
      );
    }

    yield* Effect.annotateCurrentSpan('toolName', toolUseBlock.name);
    yield* Effect.annotateCurrentSpan('toolUseId', toolUseBlock.id);
    yield* Effect.annotateCurrentSpan(
      'toolInput',
      JSON.stringify(toolUseBlock.input)
    );

    // Log tool call details
    yield* Console.log(
      `🔧 Tool call: ${toolUseBlock.name} | Input: ${JSON.stringify(toolUseBlock.input).substring(0, 200)}...`
    );

    const toolResult = yield* this.mcp.executeTool(
      toolUseBlock.name,
      toolUseBlock.input as Record<string, unknown>
    );

    const toolResultStr = JSON.stringify(toolResult);
    yield* Effect.annotateCurrentSpan('toolResultSize', toolResultStr.length);
    yield* Effect.annotateCurrentSpan('toolResult', toolResultStr);

    // Log tool result
    yield* Console.log(
      `✅ Tool result: ${toolResultStr.substring(0, 200)}...`
    );

    return { toolUseBlock, toolResult };
  });

  createMessage = Effect.fn('ClaudeService.createMessage')(function* (
    this: ClaudeServiceImpl,
    message: string
  ) {
    yield* Effect.annotateCurrentSpan('messageLength', message.length);

    // 1. Get conversation history
    const history = yield* this.conversation.getHistory();
    yield* Console.log(
      `📚 Retrieved history: ${history.length} messages in conversation`
    );

    // 2. Create and save user message
    const userMessage: MessageParam = { role: 'user', content: message };
    yield* this.conversation.addMessage(userMessage);

    const client = yield* this.getClient();
    const modelName = yield* this.config.getAnthropicModel();
    const tools = yield* this.mcp.getTools();

    yield* Effect.annotateCurrentSpan('model', modelName);
    yield* Effect.annotateCurrentSpan('toolCount', tools.length);
    yield* Effect.annotateCurrentSpan('conversationLength', history.length + 1);

    // 3. Initial API call with full history
    const fullHistory = [...history, userMessage];
    let result = yield* this.callApi(client, modelName, fullHistory, tools);
    yield* Console.log(
      `📥 Initial response | stop_reason: ${result.stop_reason} | content blocks: ${result.content.length}`
    );

    // 4. Handle tool use loop (max 10 iterations to prevent infinite loops)
    const MAX_TOOL_ITERATIONS = 10;
    let toolUseIteration = 0;
    while (
      result.stop_reason === 'tool_use' &&
      toolUseIteration < MAX_TOOL_ITERATIONS
    ) {
      toolUseIteration++;
      yield* Effect.annotateCurrentSpan('toolUseIteration', toolUseIteration);

      yield* Console.log(
        `🔄 Tool use loop iteration ${toolUseIteration}/${MAX_TOOL_ITERATIONS}`
      );

      const toolUseBlock = result.content.find(
        (b: ContentBlock) => b.type === 'tool_use'
      );
      if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
        yield* Console.log('⚠️  No tool_use block found, breaking loop');
        break;
      }

      // Save assistant message (with tool_use)
      const assistantMessage: MessageParam = {
        role: 'assistant',
        content: result.content,
      };
      yield* this.conversation.addMessage(assistantMessage);

      // Execute tool and get result
      const { toolResult } = yield* this.handleToolUse(toolUseBlock);

      // Save tool_result message
      const toolResultMessage: MessageParam = {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseBlock.id,
            content: JSON.stringify(toolResult),
          },
        ],
      };
      yield* this.conversation.addMessage(toolResultMessage);

      // Get updated history and continue API call
      const updatedHistory = yield* this.conversation.getHistory();
      yield* Console.log(
        `📚 Updated history: ${updatedHistory.length} messages (after tool call)`
      );

      result = yield* this.callApi(client, modelName, updatedHistory, tools);

      yield* Console.log(
        `📥 Tool result response | stop_reason: ${result.stop_reason} | content blocks: ${result.content.length}`
      );
    }

    if (toolUseIteration >= MAX_TOOL_ITERATIONS) {
      yield* Console.log(
        `⚠️  Reached max tool iterations (${MAX_TOOL_ITERATIONS}), stopping loop`
      );
    }

    yield* Effect.annotateCurrentSpan('totalIterations', toolUseIteration);
    yield* Effect.annotateCurrentSpan('finalStopReason', result.stop_reason);

    // 5. Save final assistant response
    const finalAssistantMessage: MessageParam = {
      role: 'assistant',
      content: result.content,
    };
    yield* this.conversation.addMessage(finalAssistantMessage);

    // 6. Extract text response
    const textContent = result.content.find(
      (b: ContentBlock) => b.type === 'text'
    );
    const text =
      textContent && 'text' in textContent ? textContent.text : '无法生成响应';

    yield* Effect.annotateCurrentSpan('responseLength', text.length);

    // Calculate total tokens
    const totalInputTokens = result.usage?.input_tokens || 0;
    const totalOutputTokens = result.usage?.output_tokens || 0;
    yield* Effect.annotateCurrentSpan('totalInputTokens', totalInputTokens);
    yield* Effect.annotateCurrentSpan('totalOutputTokens', totalOutputTokens);

    const finalHistoryLength = (yield* this.conversation.getHistory()).length;
    yield* Console.log(
      `✅ Conversation complete | Total messages: ${finalHistoryLength}`
    );

    return {
      text,
      modelName,
      usage: result.usage
        ? {
            input_tokens: result.usage.input_tokens,
            output_tokens: result.usage.output_tokens,
          }
        : undefined,
    } as ProcessedMessage;
  });
}
