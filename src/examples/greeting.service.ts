/**
 * 简单的示例服务，用于测试 inversify + effect 集成
 */
import { injectable, inject } from "inversify";
import { Effect, Data } from "effect";

// 自定义错误
export class GreetingError extends Data.TaggedError("GreetingError")<{
  message: string;
  stack?: string;
}> {}

// ConfigService Symbol
export const ConfigService = Symbol.for("ConfigService");

// 简单的配置服务
@injectable()
export class ConfigServiceImpl {
  getGreetingPrefix = Effect.fn("ConfigService.getGreetingPrefix")(function* () {
    return process.env.GREETING_PREFIX || "Hello";
  });
}

// GreetingService Symbol
export const GreetingService = Symbol.for("GreetingService");

// 问候服务
@injectable()
export class GreetingServiceImpl {
  constructor(@inject(ConfigService) private config: ConfigServiceImpl) {}

  greet = Effect.fn("GreetingService.greet")(function* (
    this: GreetingServiceImpl,
    name: string
  ) {
    yield* Effect.annotateCurrentSpan("name", name);

    // 验证输入
    if (!name || name.trim() === "") {
      yield* Effect.fail(
        new GreetingError({ message: "Name cannot be empty" })
      );
    }

    // 获取前缀
    const prefix = yield* this.config.getGreetingPrefix();

    // 返回问候语
    return `${prefix}, ${name}!`;
  });

  greetMultiple = Effect.fn("GreetingService.greetMultiple")(function* (
    this: GreetingServiceImpl,
    names: string[]
  ) {
    yield* Effect.annotateCurrentSpan("count", names.length);

    const greetings: string[] = [];

    for (const name of names) {
      const greeting = yield* this.greet(name);
      greetings.push(greeting);
    }

    return greetings;
  });
}
