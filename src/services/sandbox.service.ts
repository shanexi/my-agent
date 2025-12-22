/**
 * CodeSandbox Service
 * Manages CodeSandbox operations via the official SDK
 */
import { injectable, inject } from 'inversify';
import { Effect, Console } from 'effect';
import { CodeSandbox, Sandbox, SandboxClient } from '@codesandbox/sdk';
import { ConfigService, ConfigServiceImpl } from './config.service.js';
import { SandboxError } from '../errors/index.js';

export const SandboxService = Symbol.for('SandboxService');

@injectable()
export class SandboxServiceImpl {
  private sdk: CodeSandbox | null = null;
  private activeClient: SandboxClient | null = null;

  constructor(@inject(ConfigService) private config: ConfigServiceImpl) {}

  private getClient = Effect.fn('SandboxService.getClient')(function* (
    this: SandboxServiceImpl
  ) {
    if (!this.sdk) {
      const apiKey = yield* this.config.getCodeSandboxApiKey();
      this.sdk = new CodeSandbox(apiKey);
      yield* Console.log('✅ CodeSandbox SDK initialized');
    }
    return this.sdk;
  });

  /**
   * Resume an existing sandbox and set it as active
   */
  resumeSandbox = Effect.fn('SandboxService.resumeSandbox')(function* (
    this: SandboxServiceImpl,
    sandboxId: string
  ) {
    yield* Effect.annotateCurrentSpan('sandboxId', sandboxId);

    // If sandbox is already active, skip resume and return URL
    if (this.activeClient) {
      yield* Console.log('⚠️  Sandbox already active, skipping resume');
      yield* Effect.annotateCurrentSpan('skipped', true);
      return yield* this.getUrl();
    }

    const client = yield* this.getClient();

    // Resume the sandbox
    const sandbox: Sandbox = yield* Effect.tryPromise({
      try: () => client.sandboxes.resume(sandboxId),
      catch: (e) =>
        new SandboxError({
          message: `Failed to resume sandbox: ${e}`,
          operation: 'resume',
        }),
    });

    yield* Console.log(`✅ Sandbox resumed: ${sandbox.id}`);

    // Connect to the sandbox
    const sandboxClient: SandboxClient = yield* Effect.tryPromise({
      try: () => sandbox.connect(),
      catch: (e) =>
        new SandboxError({
          message: `Failed to connect to sandbox: ${e}`,
          operation: 'connect',
        }),
    });

    yield* Console.log(`✅ Client connected: ${sandboxClient.id}`);

    // Store the active client
    this.activeClient = sandboxClient;

    // Wait for port 5173 to be available (Vite dev server)
    try {
      yield* Console.log('⏳ Waiting for port 5173...');
      const port = yield* Effect.tryPromise({
        try: () => sandboxClient.ports.waitForPort(5173, { timeoutMs: 60000 }),
        catch: (e) =>
          new SandboxError({
            message: `Failed to wait for port 5173: ${e}`,
            operation: 'waitForPort',
          }),
      });

      yield* Console.log(`✅ Port 5173 is open: ${port.host}`);

      // Return the preview URL
      return {
        sandbox_id: sandbox.id,
        preview_url: `https://${port.host}`,
      };
    } catch (error) {
      // If port wait fails, return editor URL as fallback
      yield* Console.log('⚠️ Port 5173 not available, returning editor URL');
      return {
        sandbox_id: sandbox.id,
        preview_url: sandboxClient.editorUrl,
      };
    }
  });

  /**
   * Write or update a file in the active sandbox
   */
  writeFile = Effect.fn('SandboxService.writeFile')(function* (
    this: SandboxServiceImpl,
    path: string,
    content: string
  ) {
    yield* Effect.annotateCurrentSpan('path', path);
    yield* Effect.annotateCurrentSpan('contentLength', content.length);

    if (!this.activeClient) {
      return yield* Effect.fail(
        new SandboxError({
          message: 'No active sandbox. Please resume a sandbox first.',
          operation: 'writeFile',
        })
      );
    }

    yield* Effect.tryPromise({
      try: () => this.activeClient!.fs.writeTextFile(path, content),
      catch: (e) =>
        new SandboxError({
          message: `Failed to write file: ${e}`,
          operation: 'writeFile',
        }),
    });

    yield* Console.log(`✅ File written: ${path}`);

    return { success: true, path };
  });

  /**
   * Get the preview URL for the active sandbox
   */
  getUrl = Effect.fn('SandboxService.getUrl')(function* (
    this: SandboxServiceImpl
  ) {
    if (!this.activeClient) {
      return yield* Effect.fail(
        new SandboxError({
          message: 'No active sandbox. Please resume a sandbox first.',
          operation: 'getUrl',
        })
      );
    }

    // Try to get the port URL, fallback to editor URL
    try {
      const ports = yield* Effect.tryPromise({
        try: () => this.activeClient!.ports.getAll(),
        catch: () => [],
      });

      const port5173 = ports.find((p) => p.port === 5173);
      if (port5173) {
        return {
          preview_url: `https://${port5173.host}`,
        };
      }
    } catch (error) {
      // Ignore error, use editor URL
    }

    // Fallback to editor URL
    return {
      preview_url: this.activeClient.editorUrl,
    };
  });

  /**
   * Get dev-server logs
   */
  getDevServerLogs = Effect.fn('SandboxService.getDevServerLogs')(function* (
    this: SandboxServiceImpl,
    lines: number = 100
  ) {
    const taskId = 'dev-server';
    yield* Effect.annotateCurrentSpan('taskId', taskId);
    yield* Effect.annotateCurrentSpan('lines', lines);

    if (!this.activeClient) {
      return yield* Effect.fail(
        new SandboxError({
          message: 'No active sandbox. Please resume a sandbox first.',
          operation: 'getDevServerLogs',
        })
      );
    }

    const task = yield* Effect.tryPromise({
      try: () => this.activeClient!.tasks.get(taskId),
      catch: (e) =>
        new SandboxError({
          message: `Failed to get task: ${e}`,
          operation: 'getDevServerLogs',
        }),
    });

    if (!task) {
      return yield* Effect.fail(
        new SandboxError({
          message: `Task not found: ${taskId}. Make sure .codesandbox/tasks.json has a "dev-server" task.`,
          operation: 'getDevServerLogs',
        })
      );
    }

    // Open the task shell to get output
    const fullOutput = yield* Effect.tryPromise({
      try: () => (task as { open: () => Promise<string> }).open(),
      catch: (e) =>
        new SandboxError({
          message: `Failed to get task output: ${e}`,
          operation: 'getDevServerLogs',
        }),
    });

    // Get last N lines
    const logLines = fullOutput.split('\n');
    const lastNLines = logLines.slice(-lines).join('\n');

    yield* Console.log(`✅ Got ${lines} lines of dev-server logs`);

    return { logs: lastNLines };
  });

  /**
   * Read a file from the active sandbox
   */
  readFile = Effect.fn('SandboxService.readFile')(function* (
    this: SandboxServiceImpl,
    path: string
  ) {
    yield* Effect.annotateCurrentSpan('path', path);

    if (!this.activeClient) {
      return yield* Effect.fail(
        new SandboxError({
          message: 'No active sandbox. Please resume a sandbox first.',
          operation: 'readFile',
        })
      );
    }

    const content = yield* Effect.tryPromise({
      try: () => this.activeClient!.fs.readTextFile(path),
      catch: (e) =>
        new SandboxError({
          message: `Failed to read file: ${e}`,
          operation: 'readFile',
        }),
    });

    yield* Console.log(`✅ File read: ${path}`);

    return { path, content };
  });

  /**
   * Search for a pattern in files within the active sandbox
   */
  grep = Effect.fn('SandboxService.grep')(function* (
    this: SandboxServiceImpl,
    pattern: string,
    path: string = '.',
    options: { caseInsensitive?: boolean; maxResults?: number } = {}
  ) {
    yield* Effect.annotateCurrentSpan('pattern', pattern);
    yield* Effect.annotateCurrentSpan('path', path);

    if (!this.activeClient) {
      return yield* Effect.fail(
        new SandboxError({
          message: 'No active sandbox. Please resume a sandbox first.',
          operation: 'grep',
        })
      );
    }

    const flags = options.caseInsensitive ? '-rni' : '-rn';
    const maxResults = options.maxResults ?? 50;
    const command = `grep ${flags} "${pattern.replace(/"/g, '\\"')}" ${path} | head -n ${maxResults}`;

    const output = yield* Effect.tryPromise({
      try: () => this.activeClient!.commands.run(command),
      catch: (e) =>
        new SandboxError({
          message: `Failed to grep: ${e}`,
          operation: 'grep',
        }),
    });

    yield* Console.log(`✅ Grep completed for pattern: ${pattern}`);

    return { pattern, path, matches: output };
  });

  /**
   * List files in a directory
   */
  listFiles = Effect.fn('SandboxService.listFiles')(function* (
    this: SandboxServiceImpl,
    path: string = '.',
    options: { recursive?: boolean } = {}
  ) {
    yield* Effect.annotateCurrentSpan('path', path);
    yield* Effect.annotateCurrentSpan('recursive', options.recursive ?? false);

    if (!this.activeClient) {
      return yield* Effect.fail(
        new SandboxError({
          message: 'No active sandbox. Please resume a sandbox first.',
          operation: 'listFiles',
        })
      );
    }

    const entries = yield* Effect.tryPromise({
      try: () => this.activeClient!.fs.readdir(path),
      catch: (e) =>
        new SandboxError({
          message: `Failed to list files: ${e}`,
          operation: 'listFiles',
        }),
    });

    const ignoreDirs = new Set([
      'node_modules',
      '.git',
      'dist',
      'build',
      '.next',
      '.cache',
      'coverage',
      '.turbo',
      '.nuxt',
      '.output',
    ]);

    if (options.recursive) {
      const allEntries: Array<{ name: string; type: string; path: string }> = [];

      const processEntries = async (
        basePath: string,
        items: Array<{ name: string; type: string }>
      ) => {
        for (const item of items) {
          if (ignoreDirs.has(item.name)) continue;

          const fullPath = basePath === '.' ? item.name : `${basePath}/${item.name}`;
          allEntries.push({ name: item.name, type: item.type, path: fullPath });

          if (item.type === 'directory') {
            const subEntries = await this.activeClient!.fs.readdir(fullPath);
            await processEntries(fullPath, subEntries);
          }
        }
      };

      yield* Effect.tryPromise({
        try: () => processEntries(path, entries),
        catch: (e) =>
          new SandboxError({
            message: `Failed to list files recursively: ${e}`,
            operation: 'listFiles',
          }),
      });

      yield* Console.log(`✅ Listed ${allEntries.length} files recursively in: ${path}`);
      return { path, entries: allEntries };
    }

    yield* Console.log(`✅ Listed ${entries.length} files in: ${path}`);
    return {
      path,
      entries: entries.map((e) => ({ name: e.name, type: e.type, path: `${path}/${e.name}` })),
    };
  });

  /**
   * Run a command in the sandbox (bash)
   */
  runCommand = Effect.fn('SandboxService.runCommand')(function* (
    this: SandboxServiceImpl,
    command: string,
    options: { cwd?: string; timeout?: number } = {}
  ) {
    yield* Effect.annotateCurrentSpan('command', command);
    if (options.cwd) yield* Effect.annotateCurrentSpan('cwd', options.cwd);

    if (!this.activeClient) {
      return yield* Effect.fail(
        new SandboxError({
          message: 'No active sandbox. Please resume a sandbox first.',
          operation: 'runCommand',
        })
      );
    }

    const output = yield* Effect.tryPromise({
      try: () => this.activeClient!.commands.run(command, { cwd: options.cwd }),
      catch: (e) =>
        new SandboxError({
          message: `Failed to run command: ${e}`,
          operation: 'runCommand',
        }),
    });

    yield* Console.log(`✅ Command executed: ${command}`);

    return { command, output };
  });

  /**
   * Edit a file by replacing old content with new content
   */
  editFile = Effect.fn('SandboxService.editFile')(function* (
    this: SandboxServiceImpl,
    path: string,
    oldContent: string,
    newContent: string
  ) {
    yield* Effect.annotateCurrentSpan('path', path);

    if (!this.activeClient) {
      return yield* Effect.fail(
        new SandboxError({
          message: 'No active sandbox. Please resume a sandbox first.',
          operation: 'editFile',
        })
      );
    }

    const fileContent = yield* Effect.tryPromise({
      try: () => this.activeClient!.fs.readTextFile(path),
      catch: (e) =>
        new SandboxError({
          message: `Failed to read file for editing: ${e}`,
          operation: 'editFile',
        }),
    });

    if (!fileContent.includes(oldContent)) {
      return yield* Effect.fail(
        new SandboxError({
          message: `old_content not found in file: ${path}`,
          operation: 'editFile',
        })
      );
    }

    const updatedContent = fileContent.replace(oldContent, newContent);

    yield* Effect.tryPromise({
      try: () => this.activeClient!.fs.writeTextFile(path, updatedContent),
      catch: (e) =>
        new SandboxError({
          message: `Failed to write edited file: ${e}`,
          operation: 'editFile',
        }),
    });

    yield* Console.log(`✅ File edited: ${path}`);

    return { success: true, path };
  });

  /**
   * Find files matching a glob pattern
   */
  glob = Effect.fn('SandboxService.glob')(function* (
    this: SandboxServiceImpl,
    pattern: string,
    path: string = '.'
  ) {
    yield* Effect.annotateCurrentSpan('pattern', pattern);
    yield* Effect.annotateCurrentSpan('path', path);

    if (!this.activeClient) {
      return yield* Effect.fail(
        new SandboxError({
          message: 'No active sandbox. Please resume a sandbox first.',
          operation: 'glob',
        })
      );
    }

    const command = `find ${path} -type f -name "${pattern.replace(/"/g, '\\"')}" 2>/dev/null | head -n 100`;

    const output = yield* Effect.tryPromise({
      try: () => this.activeClient!.commands.run(command),
      catch: (e) =>
        new SandboxError({
          message: `Failed to glob: ${e}`,
          operation: 'glob',
        }),
    });

    const files = output.trim().split('\n').filter(Boolean);

    yield* Console.log(`✅ Glob found ${files.length} files matching: ${pattern}`);

    return { pattern, path, files };
  });
}
