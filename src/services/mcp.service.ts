/**
 * MCP Service
 * Handles Model Context Protocol tools
 */
import { injectable } from 'inversify';
import { Effect } from 'effect';
import { McpToolError } from '../errors/index.js';

export const McpService = Symbol.for('McpService');

export interface McpTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  };
}

@injectable()
export class McpServiceImpl {
  getTools = Effect.fn('McpService.getTools')(function* (
    this: McpServiceImpl
  ) {
    const tools: McpTool[] = [
      {
        name: 'get_current_time',
        description: 'Get the current date and time in ISO 8601 format',
        input_schema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ];
    return tools;
  });

  executeTool = Effect.fn('McpService.executeTool')(function* (
    this: McpServiceImpl,
    toolName: string,
    toolInput: Record<string, any>
  ) {
    yield* Effect.annotateCurrentSpan('toolName', toolName);

    if (toolName === 'get_current_time') {
      const now = new Date().toISOString();
      return { time: now };
    }

    return yield* Effect.fail(
      new McpToolError({
        message: `Unknown tool: ${toolName}`,
        toolName,
        toolInput,
      })
    );
  });
}
