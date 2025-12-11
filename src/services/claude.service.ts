/**
 * Claude Service
 * Handles Claude AI API interactions via AWS Bedrock
 */
import { injectable, inject } from 'inversify';
import { Effect } from 'effect';
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import type { Message, ContentBlock } from '@anthropic-ai/sdk/resources/messages.js';
import { ConfigService, ConfigServiceImpl } from './config.service.js';
import { McpService, McpServiceImpl } from './mcp.service.js';
import { ClaudeApiError } from '../errors/index.js';
import type { ProcessedMessage } from '../types/telegram.types.js';

export const ClaudeService = Symbol.for('ClaudeService');

@injectable()
export class ClaudeServiceImpl {
  private anthropic: AnthropicBedrock | null = null;

  constructor(
    @inject(ConfigService) private config: ConfigServiceImpl,
    @inject(McpService) private mcp: McpServiceImpl
  ) {}

  private getClient = Effect.fn('ClaudeService.getClient')(function* (
    this: ClaudeServiceImpl
  ) {
    if (!this.anthropic) {
      const awsRegion = yield* this.config.getAwsRegion();
      const awsAccessKey = yield* this.config.getAwsAccessKey();
      const awsSecretKey = yield* this.config.getAwsSecretKey();

      this.anthropic = new AnthropicBedrock({
        awsRegion,
        awsAccessKey,
        awsSecretKey,
      });
    }
    return this.anthropic;
  });

  private initialApiCall = Effect.fn('ClaudeService.initialApiCall')(
    function* (
      this: ClaudeServiceImpl,
      client: AnthropicBedrock,
      modelName: string,
      message: string,
      tools: any[]
    ) {
      yield* Effect.annotateCurrentSpan('callType', 'initial');
      yield* Effect.annotateCurrentSpan('messageLength', message.length);
      yield* Effect.annotateCurrentSpan('toolCount', tools.length);

      const result: Message = yield* Effect.tryPromise({
        try: () =>
          client.messages.create({
            model: modelName,
            max_tokens: 8192,
            messages: [{ role: 'user', content: message }],
            tools: tools,
          }),
        catch: (e) =>
          new ClaudeApiError({
            message: `Claude API error: ${e}`,
            stack: e instanceof Error ? e.stack : undefined,
          }),
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
    }
  );

  private toolResultApiCall = Effect.fn('ClaudeService.toolResultApiCall')(
    function* (
      this: ClaudeServiceImpl,
      client: AnthropicBedrock,
      modelName: string,
      message: string,
      tools: any[],
      previousContent: ContentBlock[],
      toolUseId: string,
      toolResult: any
    ) {
      yield* Effect.annotateCurrentSpan('callType', 'toolResult');
      yield* Effect.annotateCurrentSpan('toolUseId', toolUseId);

      const result: Message = yield* Effect.tryPromise({
        try: () =>
          client.messages.create({
            model: modelName,
            max_tokens: 8192,
            messages: [
              { role: 'user', content: message },
              { role: 'assistant', content: previousContent },
              {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: toolUseId,
                    content: JSON.stringify(toolResult),
                  },
                ],
              },
            ],
            tools: tools,
          }),
        catch: (e) =>
          new ClaudeApiError({
            message: `Claude API error: ${e}`,
            stack: e instanceof Error ? e.stack : undefined,
          }),
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
    }
  );

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

    const toolResult = yield* this.mcp.executeTool(
      toolUseBlock.name,
      toolUseBlock.input as Record<string, any>
    );

    yield* Effect.annotateCurrentSpan(
      'toolResultSize',
      JSON.stringify(toolResult).length
    );

    return { toolUseBlock, toolResult };
  });

  createMessage = Effect.fn('ClaudeService.createMessage')(function* (
    this: ClaudeServiceImpl,
    message: string
  ) {
    yield* Effect.annotateCurrentSpan('messageLength', message.length);

    const client = yield* this.getClient();
    const modelName = yield* this.config.getAnthropicModel();
    const tools = yield* this.mcp.getTools();

    yield* Effect.annotateCurrentSpan('model', modelName);
    yield* Effect.annotateCurrentSpan('toolCount', tools.length);

    // Initial API call
    let result = yield* this.initialApiCall(client, modelName, message, tools);

    // Handle tool use loop
    let toolUseIteration = 0;
    while (result.stop_reason === 'tool_use') {
      toolUseIteration++;
      yield* Effect.annotateCurrentSpan('toolUseIteration', toolUseIteration);

      const toolUseBlock = result.content.find(
        (b: ContentBlock) => b.type === 'tool_use'
      );
      if (!toolUseBlock || toolUseBlock.type !== 'tool_use') break;

      // Execute tool and get result
      const { toolResult } = yield* this.handleToolUse(toolUseBlock);

      // Call API with tool result
      result = yield* this.toolResultApiCall(
        client,
        modelName,
        message,
        tools,
        result.content,
        toolUseBlock.id,
        toolResult
      );
    }

    yield* Effect.annotateCurrentSpan('totalIterations', toolUseIteration);
    yield* Effect.annotateCurrentSpan('finalStopReason', result.stop_reason);

    // Extract text response
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
