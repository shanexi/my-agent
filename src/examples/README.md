# InversifyJS + Effect 集成示例

这个示例演示了如何结合使用 InversifyJS 和 Effect 来构建类型安全、可测试的服务。

## 关键发现

### 1. this 绑定问题

在 Effect generator 中，`this` 不会自动绑定。有三种解决方案：

#### 方案 A: Effect.fn (推荐)

使用 `Effect.fn` 直接作为类属性，自动处理 `this` 绑定和 tracing：

```typescript
greet = Effect.fn("GreetingService.greet")(
  function* (this: GreetingServiceImpl, name: string) {
    yield* Effect.annotateCurrentSpan("name", name);
    const prefix = yield* this.config.getGreetingPrefix();
    return `${prefix}, ${name}!`;
  }
);
```

- `Effect.fn` 内部用 `body.apply(this, args)` 调用 generator
- 需要显式声明 `this: ClassName` 让 TypeScript 知道类型
- 自动创建 traced span，附带更好的 stack trace

#### 方案 B: 箭头函数 + 解构

```typescript
greet = (name: string) => {
  const { config } = this;  // 解构捕获依赖
  return Effect.gen(function* () {
    const prefix = yield* config.getGreetingPrefix();
    return `${prefix}, ${name}!`;
  }).pipe(Effect.withSpan("GreetingService.greet"));
};
```

#### 方案 C: self = this

```typescript
greet(name: string) {
  const self = this;
  return Effect.gen(function* () {
    const prefix = yield* self.config.getGreetingPrefix();
    return `${prefix}, ${name}!`;
  });
}
```

**不要使用 `.bind(this)`：**
```typescript
// ❌ 不推荐
return Effect.gen(function* () {
  // ...
}.bind(this))
```

### 2. 装饰器配置

必须在 `tsconfig.json` 中启用：

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

### 3. reflect-metadata 导入

必须在测试文件和入口文件顶部导入：

```typescript
import "reflect-metadata";
```

### 3.1 ESM 模块导入

使用 Node16 module resolution + ESM 时，导入需要 `.js` 扩展名：

```typescript
// ✅ 正确
import { MyService } from "./my.service.js";

// ❌ 错误 - 会报 "Cannot find module"
import { MyService } from "./my.service";
```

### 4. Tracing

#### Effect.fn (推荐)

`Effect.fn` 自动创建 span，用 `Effect.annotateCurrentSpan` 添加 attributes：

```typescript
myMethod = Effect.fn("ServiceName.methodName")(
  function* (this: MyService, arg: string) {
    yield* Effect.annotateCurrentSpan("arg", arg);
    // ...
  }
);
```

#### Effect.withSpan

手动添加 span（与 Effect.gen 配合使用）：

```typescript
return Effect.gen(function* () {
  // ...
}).pipe(
  Effect.withSpan("ServiceName.methodName", {
    attributes: { key: value }
  })
);
```

### 5. 自定义错误

使用 `Data.TaggedError` 定义错误：

```typescript
export class GreetingError extends Data.TaggedError('GreetingError')<{
  message: string;
  stack?: string;
}> {}

// 使用
yield* Effect.fail(new GreetingError({ message: 'error message' }));

// 捕获特定错误
.pipe(
  Effect.catchTag('GreetingError', (error) => {
    // 处理错误
  })
)
```

### 6. Service 注册

使用直接导出的 Symbol：

```typescript
// ✅ 推荐
export const ConfigService = Symbol.for('ConfigService');
export const GreetingService = Symbol.for('GreetingService');

// 注册
container.bind(ConfigService).to(ConfigServiceImpl).inSingletonScope();
container.bind(GreetingService).to(GreetingServiceImpl).inSingletonScope();
```

## 运行测试

```bash
# 运行所有测试
npm test

# Watch 模式
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

## 测试覆盖

当前示例包含 10 个测试，覆盖：

- ✅ 基础功能（问候、多人问候）
- ✅ 配置管理（默认值、环境变量）
- ✅ 错误处理（空输入、tagged errors）
- ✅ 依赖注入（singleton scope、构造函数注入）

## 下一步

这个示例验证了 InversifyJS + Effect 的可行性。可以将相同的模式应用到实际项目中：

1. 创建实际的 services（TelegramService, ClaudeService 等）
2. 保持相同的错误处理模式
3. 使用相同的测试方法
4. 添加 span 追踪用于可观测性
