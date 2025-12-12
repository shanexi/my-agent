/**
 * MCP Service
 * Handles Model Context Protocol tools
 */
import { injectable, inject } from 'inversify';
import { Effect } from 'effect';
import { McpToolError } from '../errors/index.js';
import { SandboxService, SandboxServiceImpl } from './sandbox.service.js';

export const McpService = Symbol.for('McpService');

export interface McpTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

@injectable()
export class McpServiceImpl {
  constructor(@inject(SandboxService) private sandbox: SandboxServiceImpl) {}
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
      {
        name: 'sandbox_resume',
        description:
          'Resume an existing CodeSandbox and set it as the active sandbox for this chat. Use sandbox ID "mqfvqg" for testing.',
        input_schema: {
          type: 'object',
          properties: {
            sandbox_id: {
              type: 'string',
              description: 'The sandbox ID to resume (e.g., "mqfvqg")',
            },
          },
          required: ['sandbox_id'],
        },
      },
      {
        name: 'sandbox_write_file',
        description:
          'Write or update a file in the active sandbox. You must call sandbox_resume first before using this tool.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path relative to sandbox root (e.g., "src/App.jsx")',
            },
            content: {
              type: 'string',
              description: 'Complete file content to write',
            },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'sandbox_get_url',
        description:
          'Get the preview URL for the active sandbox. You must call sandbox_resume first before using this tool.',
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
    toolInput: Record<string, unknown>
  ) {
    yield* Effect.annotateCurrentSpan('toolName', toolName);

    if (toolName === 'get_current_time') {
      const now = new Date().toISOString();
      return { time: now };
    }

    if (toolName === 'sandbox_resume') {
      return yield* this.sandbox.resumeSandbox(toolInput.sandbox_id as string);
    }

    if (toolName === 'sandbox_write_file') {
      return yield* this.sandbox.writeFile(toolInput.path as string, toolInput.content as string);
    }

    if (toolName === 'sandbox_get_url') {
      return yield* this.sandbox.getUrl();
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
