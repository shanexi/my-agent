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
}
