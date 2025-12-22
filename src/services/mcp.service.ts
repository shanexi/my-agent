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
          'Resume an existing CodeSandbox and set it as the active sandbox for this chat. Use sandbox ID "fwslpp" for testing.',
        input_schema: {
          type: 'object',
          properties: {
            sandbox_id: {
              type: 'string',
              description: 'The sandbox ID to resume (e.g., "fwslpp")',
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
      {
        name: 'sandbox_get_dev_server_logs',
        description:
          'Get the last N lines of dev-server output to check for compilation errors. The dev-server should already be running. Use this after writing files to check if there are any errors.',
        input_schema: {
          type: 'object',
          properties: {
            lines: {
              type: 'number',
              description: 'Number of lines to retrieve (default: 100)',
            },
          },
          required: [],
        },
      },
      {
        name: 'sandbox_read_file',
        description:
          'Read a file from the active sandbox. You must call sandbox_resume first before using this tool.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path relative to sandbox root (e.g., "src/App.jsx")',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'sandbox_grep',
        description:
          'Search for a pattern in files within the active sandbox. Returns matching lines with file paths and line numbers.',
        input_schema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'The pattern to search for',
            },
            path: {
              type: 'string',
              description: 'Directory to search in (default: ".")',
            },
            case_insensitive: {
              type: 'boolean',
              description: 'Case insensitive search (default: false)',
            },
            max_results: {
              type: 'number',
              description: 'Maximum number of results (default: 50)',
            },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'sandbox_list_files',
        description:
          'List files in a directory within the active sandbox.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Directory path (default: ".")',
            },
            recursive: {
              type: 'boolean',
              description: 'List files recursively (default: false)',
            },
          },
          required: [],
        },
      },
      {
        name: 'sandbox_run_command',
        description:
          'Run a shell command in the active sandbox. Use this for npm install, build, or any other shell commands.',
        input_schema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The command to run (e.g., "npm install", "ls -la")',
            },
            cwd: {
              type: 'string',
              description: 'Working directory for the command',
            },
          },
          required: ['command'],
        },
      },
      {
        name: 'sandbox_edit_file',
        description:
          'Edit a file by replacing specific content. Reads the file, finds old_content, and replaces it with new_content.',
        input_schema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path relative to sandbox root',
            },
            old_content: {
              type: 'string',
              description: 'The exact content to find and replace',
            },
            new_content: {
              type: 'string',
              description: 'The new content to replace with',
            },
          },
          required: ['path', 'old_content', 'new_content'],
        },
      },
      {
        name: 'sandbox_glob',
        description:
          'Find files matching a glob pattern in the active sandbox.',
        input_schema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Glob pattern (e.g., "*.tsx", "*.js")',
            },
            path: {
              type: 'string',
              description: 'Directory to search in (default: ".")',
            },
          },
          required: ['pattern'],
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

    if (toolName === 'sandbox_get_dev_server_logs') {
      return yield* this.sandbox.getDevServerLogs(
        (toolInput.lines as number) || 100
      );
    }

    if (toolName === 'sandbox_read_file') {
      return yield* this.sandbox.readFile(toolInput.path as string);
    }

    if (toolName === 'sandbox_grep') {
      return yield* this.sandbox.grep(
        toolInput.pattern as string,
        (toolInput.path as string) || '.',
        {
          caseInsensitive: toolInput.case_insensitive as boolean,
          maxResults: toolInput.max_results as number,
        }
      );
    }

    if (toolName === 'sandbox_list_files') {
      return yield* this.sandbox.listFiles(
        (toolInput.path as string) || '.',
        { recursive: toolInput.recursive as boolean }
      );
    }

    if (toolName === 'sandbox_run_command') {
      return yield* this.sandbox.runCommand(
        toolInput.command as string,
        { cwd: toolInput.cwd as string }
      );
    }

    if (toolName === 'sandbox_edit_file') {
      return yield* this.sandbox.editFile(
        toolInput.path as string,
        toolInput.old_content as string,
        toolInput.new_content as string
      );
    }

    if (toolName === 'sandbox_glob') {
      return yield* this.sandbox.glob(
        toolInput.pattern as string,
        (toolInput.path as string) || '.'
      );
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
