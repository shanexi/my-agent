/**
 * 测试 inversify + effect 集成
 */
import "reflect-metadata";
import { describe, it, expect, beforeEach } from "vitest";
import { Container } from "inversify";
import { Effect } from "effect";
import {
  ConfigService,
  ConfigServiceImpl,
  GreetingService,
  GreetingServiceImpl,
  GreetingError,
} from "./greeting.service.js";

describe("Inversify + Effect Integration", () => {
  let container: Container;

  beforeEach(() => {
    // 每次测试前创建新的容器
    container = new Container();
    container.bind(ConfigService).to(ConfigServiceImpl).inSingletonScope();
    container.bind(GreetingService).to(GreetingServiceImpl).inSingletonScope();
  });

  describe("ConfigServiceImpl", () => {
    it("should return default greeting prefix", async () => {
      const config = container.get<ConfigServiceImpl>(ConfigService);

      const program = config.getGreetingPrefix();
      const result = await Effect.runPromise(program);

      expect(result).toBe("Hello");
    });

    it("should return custom greeting prefix from env", async () => {
      // 设置环境变量
      process.env.GREETING_PREFIX = "Hi";

      const config = container.get<ConfigServiceImpl>(ConfigService);
      const program = config.getGreetingPrefix();
      const result = await Effect.runPromise(program);

      expect(result).toBe("Hi");

      // 清理
      delete process.env.GREETING_PREFIX;
    });
  });

  describe("GreetingServiceImpl", () => {
    it("should greet a person", async () => {
      const greeting = container.get<GreetingServiceImpl>(GreetingService);

      const program = greeting.greet("Alice");
      const result = await Effect.runPromise(program);

      expect(result).toBe("Hello, Alice!");
    });

    it("should fail when name is empty", async () => {
      const greeting = container.get<GreetingServiceImpl>(GreetingService);

      const program = greeting.greet("");

      await expect(Effect.runPromise(program)).rejects.toThrow(
        "Name cannot be empty"
      );
    });

    it("should greet multiple people", async () => {
      const greeting = container.get<GreetingServiceImpl>(GreetingService);

      const program = greeting.greetMultiple(["Alice", "Bob", "Charlie"]);
      const result = await Effect.runPromise(program);

      expect(result).toEqual([
        "Hello, Alice!",
        "Hello, Bob!",
        "Hello, Charlie!",
      ]);
    });

    it("should use custom prefix when env is set", async () => {
      process.env.GREETING_PREFIX = "Hola";

      // 需要重新创建容器，因为 ConfigService 是 singleton
      const newContainer = new Container();
      newContainer.bind(ConfigService).to(ConfigServiceImpl).inSingletonScope();
      newContainer
        .bind(GreetingService)
        .to(GreetingServiceImpl)
        .inSingletonScope();

      const greeting = newContainer.get<GreetingServiceImpl>(GreetingService);
      const program = greeting.greet("Alice");
      const result = await Effect.runPromise(program);

      expect(result).toBe("Hola, Alice!");

      delete process.env.GREETING_PREFIX;
    });
  });

  describe("Error Handling", () => {
    it("should handle GreetingError correctly", async () => {
      const greeting = container.get<GreetingServiceImpl>(GreetingService);

      const program = greeting
        .greet("")
        .pipe(
          Effect.catchTag("GreetingError", (error) =>
            Effect.succeed(`Error: ${error.message}`)
          )
        );

      const result = await Effect.runPromise(program);
      expect(result).toBe("Error: Name cannot be empty");
    });

    it("should fail fast on first error in greetMultiple", async () => {
      const greeting = container.get<GreetingServiceImpl>(GreetingService);

      const program = greeting.greetMultiple(["Alice", "", "Charlie"]);

      await expect(Effect.runPromise(program)).rejects.toThrow(
        "Name cannot be empty"
      );
    });
  });

  describe("Dependency Injection", () => {
    it("should inject ConfigService into GreetingService", async () => {
      const greeting = container.get<GreetingServiceImpl>(GreetingService);

      // 验证 GreetingService 实例已创建
      expect(greeting).toBeInstanceOf(GreetingServiceImpl);

      // 验证依赖注入工作正常（通过运行一个方法）
      const program = greeting.greet("Test");
      await expect(Effect.runPromise(program)).resolves.toBe("Hello, Test!");
    });

    it("should use singleton scope", () => {
      const greeting1 = container.get<GreetingServiceImpl>(GreetingService);
      const greeting2 = container.get<GreetingServiceImpl>(GreetingService);

      // 应该是同一个实例
      expect(greeting1).toBe(greeting2);
    });
  });
});
