# Claude Agent SDK vs Anthropic SDK 对比指南

> 本文档对比了 `@anthropic-ai/sdk` (标准 API SDK) 和 `@anthropic-ai/claude-agent-sdk` (Agent SDK) 的区别，以及迁移建议。

**版本信息:**
- 旧项目 (Claude Code 0.2.8): 使用 `@anthropic-ai/sdk`
- 当前项目: 使用 `@anthropic-ai/claude-agent-sdk` v0.1.59

---

## 📚 目录

- [核心区别概述](#核心区别概述)
- [API 对比](#api-对比)
- [迁移指南](#迁移指南)
- [实际使用示例](#实际使用示例)
- [常见问题](#常见问题)

---

## 核心区别概述

### @anthropic-ai/sdk (标准 SDK)

**定位**: 直接调用 Claude API 的底层客户端

**特点**:
- ✅ 完全控制 API 调用细节
- ✅ 支持流式和非流式响应
- ✅ 手动管理工具调用和对话历史
- ✅ 直接访问 prompt caching、thinking tokens 等特性
- ❌ 需要自己实现工具系统
- ❌ 需要手动处理错误重试
- ❌ 需要自己管理对话状态

**适用场景**:
- 需要完全控制 API 调用的低级集成
- 构建自定义对话管理系统
- 实现特殊的流式处理逻辑

### @anthropic-ai/claude-agent-sdk (Agent SDK)

**定位**: 基于 Claude Code 的高级 Agent 框架

**特点**:
- ✅ 开箱即用的工具系统 (Bash, Read, Edit, Grep, Glob, WebFetch 等)
- ✅ 自动管理对话历史和会话状态
- ✅ 内置权限系统和安全沙箱
- ✅ 支持 MCP (Model Context Protocol) 服务器
- ✅ 钩子系统 (Hooks) 用于自定义行为
- ✅ 支持自定义子 Agent
- ❌ 较少的底层控制
- ❌ 依赖 Claude Code 运行时

**适用场景**:
- 构建具有文件操作、代码执行能力的 Agent
- 需要快速搭建 Agent 系统
- 希望利用 Claude Code 的现有工具生态

---

## API 对比

### 1. 客户端初始化

#### ❌ 不再可用 (标准 SDK)

```typescript
// @anthropic-ai/sdk
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 3,
  timeout: 60000,
})
```

#### ✅ 新方式 (Agent SDK)

```typescript
// @anthropic-ai/claude-agent-sdk
import { unstable_v2_prompt } from '@anthropic-ai/claude-agent-sdk'

// 简单一次性调用 (当前项目使用)
const result = await unstable_v2_prompt("你好", {
  model: "claude-sonnet-4-20250514"
})

// 或使用完整的 query API
import { query } from '@anthropic-ai/claude-agent-sdk'

const q = query({
  prompt: "你好",
  options: {
    model: "claude-sonnet-4-20250514",
    maxTurns: 10,
    maxBudgetUsd: 1.0,
  }
})

for await (const message of q) {
  console.log(message)
}
```

---

### 2. 发送消息

#### ❌ 不再可用 (标准 SDK)

```typescript
// 非流式
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }]
})

// 流式 (带 prompt caching)
const stream = client.beta.messages.stream({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  messages: [{ role: 'user', content: 'Hello!' }],
  system: [{
    type: 'text',
    text: 'System prompt',
    cache_control: { type: 'ephemeral' }
  }]
})

for await (const part of stream) {
  if (part.type === 'content_block_delta') {
    process.stdout.write(part.delta.text)
  }
}

const final = await stream.finalMessage()
```

#### ✅ 新方式 (Agent SDK)

```typescript
// 一次性调用
const result = await unstable_v2_prompt("Hello!", {
  model: "claude-sonnet-4-20250514"
})

if (result.subtype === 'success') {
  console.log(result.result)  // 最终文本响应
  console.log(result.usage)   // Token 使用统计
  console.log(result.total_cost_usd)  // 总成本
}

// 流式处理 (通过 query API)
const q = query({
  prompt: "Hello!",
  options: {
    model: "claude-sonnet-4-20250514",
    includePartialMessages: true  // 启用流式事件
  }
})

for await (const message of q) {
  if (message.type === 'stream_event') {
    // 处理流式事件
    console.log(message.event)
  } else if (message.type === 'result') {
    // 最终结果
    console.log(message.result)
  }
}
```

---

### 3. 工具使用 (Tool Use)

#### ❌ 旧方式 (标准 SDK - 需要手动实现)

```typescript
// 定义工具
const tools = [{
  name: 'get_weather',
  description: 'Get weather for a location',
  input_schema: {
    type: 'object',
    properties: {
      location: { type: 'string' }
    },
    required: ['location']
  }
}]

// 第一次调用
const response1 = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'What is the weather in SF?' }],
  tools
})

// 检查工具调用
const toolUse = response1.content.find(_ => _.type === 'tool_use')
if (toolUse) {
  // 手动执行工具
  const weatherData = await getWeather(toolUse.input.location)

  // 返回结果给 Claude
  const response2 = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      { role: 'user', content: 'What is the weather in SF?' },
      { role: 'assistant', content: response1.content },
      {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(weatherData)
        }]
      }
    ],
    tools
  })
}
```

#### ✅ 新方式 (Agent SDK - 自动处理工具调用)

```typescript
// Agent SDK 内置了许多工具，自动处理调用循环
const result = await unstable_v2_prompt(
  "列出当前目录的文件，并读取 README.md",
  {
    model: "claude-sonnet-4-20250514"
  }
)
// Agent 会自动使用 Bash/Glob 和 Read 工具，无需手动处理

// 如果需要自定义工具，使用 MCP 服务器
import { createSdkMcpServer, tool, query } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

const myServer = createSdkMcpServer({
  name: 'my-tools',
  tools: [
    tool(
      'get_weather',
      'Get weather for a location',
      { location: z.string() },
      async (args) => ({
        content: [{
          type: 'text',
          text: JSON.stringify({ temp: 72, condition: 'sunny' })
        }]
      })
    )
  ]
})

const q = query({
  prompt: "What's the weather in SF?",
  options: {
    model: "claude-sonnet-4-20250514",
    mcpServers: { 'my-tools': myServer }
  }
})
```

---

### 4. 错误处理

#### ❌ 旧方式 (标准 SDK)

```typescript
import { APIError, APIConnectionError } from '@anthropic-ai/sdk'

try {
  const response = await client.messages.create({...})
} catch (error) {
  if (error instanceof APIConnectionError) {
    console.error('Network error:', error.message)
    // 手动重试逻辑
  } else if (error instanceof APIError) {
    console.error('API error:', error.status, error.message)

    if (error.status === 429) {
      const retryAfter = error.headers?.['retry-after']
      await sleep(retryAfter * 1000)
      // 重试
    } else if (error.status === 500) {
      // 服务器错误，重试
    }
  }
}
```

#### ✅ 新方式 (Agent SDK - 自动重试)

```typescript
// Agent SDK 自动处理重试和错误恢复
const result = await unstable_v2_prompt("Hello", {
  model: "claude-sonnet-4-20250514"
})

// 检查结果类型
if (result.subtype === 'success') {
  console.log(result.result)
} else {
  // 错误类型: 'error_during_execution', 'error_max_turns', 'error_max_budget_usd'
  console.error(result.errors)
}

// 可选：使用 AbortController 控制超时
const controller = new AbortController()
setTimeout(() => controller.abort(), 30000)

const q = query({
  prompt: "Long task",
  options: {
    model: "claude-sonnet-4-20250514",
    abortController: controller
  }
})
```

---

### 5. 对话管理

#### ❌ 旧方式 (标准 SDK - 手动管理)

```typescript
// 需要手动维护对话历史
const conversationHistory: Array<{role: string, content: any}> = []

// 第一轮
conversationHistory.push({ role: 'user', content: 'Hello' })
const response1 = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: conversationHistory
})
conversationHistory.push({ role: 'assistant', content: response1.content })

// 第二轮
conversationHistory.push({ role: 'user', content: 'Tell me more' })
const response2 = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: conversationHistory
})
```

#### ✅ 新方式 (Agent SDK - 自动管理)

```typescript
// 方式 1: 使用 continue 选项继续最近的会话
const result1 = await unstable_v2_prompt("Hello", {
  model: "claude-sonnet-4-20250514"
})

const result2 = await unstable_v2_prompt("Tell me more", {
  model: "claude-sonnet-4-20250514",
  // continue: true  // 注意: unstable_v2_prompt 不支持 continue
})

// 方式 2: 使用 Session API 进行多轮对话
import { unstable_v2_createSession } from '@anthropic-ai/claude-agent-sdk'

const session = unstable_v2_createSession({
  model: "claude-sonnet-4-20250514"
})

await session.send("Hello")
for await (const message of session.receive()) {
  if (message.type === 'result') {
    console.log(message.result)
    break
  }
}

await session.send("Tell me more")
for await (const message of session.receive()) {
  if (message.type === 'result') {
    console.log(message.result)
    break
  }
}

session.close()

// 方式 3: 使用 query API 的 resume 选项
const q1 = query({
  prompt: "Hello",
  options: { model: "claude-sonnet-4-20250514" }
})

let sessionId: string | undefined
for await (const message of q1) {
  if (message.type === 'result') {
    sessionId = message.session_id
  }
}

// 恢复会话
const q2 = query({
  prompt: "Tell me more",
  options: {
    model: "claude-sonnet-4-20250514",
    resume: sessionId
  }
})
```

---

### 6. 类型定义对比

#### ❌ 不再直接可用 (标准 SDK 类型)

```typescript
// 这些类型来自 @anthropic-ai/sdk，在 Agent SDK 中不直接暴露
import type {
  MessageParam,           // 消息参数
  Message as APIMessage,  // API 返回的消息
  ContentBlock,           // 内容块
  ContentBlockParam,      // 内容块参数
  TextBlock,              // 文本块
  TextBlockParam,         // 文本块参数
  ImageBlockParam,        // 图片块参数
  ToolUseBlock,           // 工具使用块
  ToolUseBlockParam,      // 工具使用块参数
  ToolResultBlockParam,   // 工具结果块参数
} from '@anthropic-ai/sdk/resources/index.mjs'

import type { BetaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { BetaMessageStream } from '@anthropic-ai/sdk/lib/BetaMessageStream.mjs'
```

#### ✅ 新类型 (Agent SDK)

```typescript
// Agent SDK 提供的类型
import type {
  // 结果类型
  SDKResultMessage,        // 查询结果
  SDKAssistantMessage,     // Assistant 消息
  SDKUserMessage,          // 用户消息
  SDKMessage,              // 所有消息的联合类型

  // 配置类型
  Options,                 // query() 选项
  SDKSessionOptions,       // Session 选项

  // 使用统计
  NonNullableUsage,        // Token 使用统计
  ModelUsage,              // 模型使用详情

  // 工具相关
  AgentDefinition,         // 自定义 Agent 定义
  McpServerConfig,         // MCP 服务器配置

  // 权限相关
  PermissionMode,          // 权限模式
  CanUseTool,              // 工具使用权限回调

  // 钩子相关
  HookEvent,               // 钩子事件
  HookCallback,            // 钩子回调
} from '@anthropic-ai/claude-agent-sdk'

// 底层 API 类型仍然可以从 @anthropic-ai/sdk 导入 (Agent SDK 依赖它)
import type {
  MessageParam as APIUserMessage
} from '@anthropic-ai/sdk/resources'

import type {
  BetaMessage as APIAssistantMessage,
  BetaUsage as Usage
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
```

---

## 迁移指南

### 场景 1: 简单的一次性查询

**旧代码:**
```typescript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }]
})

console.log(response.content[0].text)
```

**新代码:**
```typescript
import { unstable_v2_prompt } from '@anthropic-ai/claude-agent-sdk'

const result = await unstable_v2_prompt('Hello!', {
  model: 'claude-sonnet-4-20250514'
})

if (result.subtype === 'success') {
  console.log(result.result)
}
```

### 场景 2: 流式响应

**旧代码:**
```typescript
const stream = client.beta.messages.stream({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Write a story' }]
})

for await (const part of stream) {
  if (part.type === 'content_block_delta' && part.delta.type === 'text_delta') {
    process.stdout.write(part.delta.text)
  }
}

const final = await stream.finalMessage()
```

**新代码:**
```typescript
import { query } from '@anthropic-ai/claude-agent-sdk'

const q = query({
  prompt: 'Write a story',
  options: {
    model: 'claude-sonnet-4-20250514',
    includePartialMessages: true
  }
})

for await (const message of q) {
  if (message.type === 'stream_event') {
    const event = message.event
    if (event.type === 'content_block_delta' && event.delta.type === 'text') {
      process.stdout.write(event.delta.text)
    }
  } else if (message.type === 'result') {
    console.log('\n\nFinal result:', message.result)
  }
}
```

### 场景 3: 自定义工具

**旧代码:**
```typescript
const tools = [{
  name: 'calculator',
  description: 'Perform calculations',
  input_schema: {
    type: 'object',
    properties: {
      operation: { type: 'string' },
      a: { type: 'number' },
      b: { type: 'number' }
    }
  }
}]

let messages = [{ role: 'user', content: 'Calculate 42 + 58' }]

while (true) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages,
    tools
  })

  messages.push({ role: 'assistant', content: response.content })

  if (response.stop_reason === 'end_turn') break

  const toolUse = response.content.find(_ => _.type === 'tool_use')
  if (toolUse) {
    const result = calculate(toolUse.input)
    messages.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: String(result)
      }]
    })
  }
}
```

**新代码:**
```typescript
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

const calculatorServer = createSdkMcpServer({
  name: 'calculator',
  tools: [
    tool(
      'calculate',
      'Perform calculations',
      {
        operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
        a: z.number(),
        b: z.number()
      },
      async (args) => {
        let result: number
        switch (args.operation) {
          case 'add': result = args.a + args.b; break
          case 'subtract': result = args.a - args.b; break
          case 'multiply': result = args.a * args.b; break
          case 'divide': result = args.a / args.b; break
        }
        return {
          content: [{ type: 'text', text: String(result) }]
        }
      }
    )
  ]
})

const q = query({
  prompt: 'Calculate 42 + 58',
  options: {
    model: 'claude-sonnet-4-20250514',
    mcpServers: { calculator: calculatorServer }
  }
})

for await (const message of q) {
  if (message.type === 'result' && message.subtype === 'success') {
    console.log(message.result)
  }
}
```

### 场景 4: AWS Bedrock 集成

**旧代码:**
```typescript
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'

const client = new AnthropicBedrock({
  awsAccessKey: process.env.AWS_ACCESS_KEY_ID,
  awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  awsRegion: process.env.AWS_REGION,
})

const response = await client.messages.create({
  model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }]
})
```

**新代码:**
```typescript
// Agent SDK 通过环境变量自动支持 Bedrock
// 设置以下环境变量:
// CLAUDE_CODE_USE_BEDROCK=1
// AWS_REGION=us-west-2
// AWS_ACCESS_KEY_ID=xxx
// AWS_SECRET_ACCESS_KEY=xxx

import { unstable_v2_prompt } from '@anthropic-ai/claude-agent-sdk'

const result = await unstable_v2_prompt('Hello', {
  model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
})
```

---

## 实际使用示例

### 当前项目中的使用 (Telegram Bot)

```typescript
// src/server.ts
import { unstable_v2_prompt } from "@anthropic-ai/claude-agent-sdk";

const processMessage = (message: string) =>
  Effect.gen(function* () {
    const modelName = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

    const result = yield* Effect.tryPromise({
      try: () => unstable_v2_prompt(message, { model: modelName }),
      catch: (error: unknown) => {
        console.error("Claude Agent error:", error);
        return new Error("抱歉，处理您的消息时出现了错误。请稍后再试。");
      },
    });

    if (result.subtype === "success") {
      return {
        text: result.result,
        usage: result.usage ? {
          input_tokens: result.usage.input_tokens,
          output_tokens: result.usage.output_tokens,
        } : undefined,
      };
    } else {
      const errors = "errors" in result ? result.errors.join("; ") : "Unknown error";
      return {
        text: `处理消息时出现错误: ${errors}`,
        usage: undefined,
      };
    }
  });
```

### 使用内置工具

```typescript
// Agent SDK 自动提供这些工具，无需配置
const result = await unstable_v2_prompt(
  "读取 package.json 文件，并告诉我项目名称和版本",
  { model: "claude-sonnet-4-20250514" }
)
// Agent 会自动使用 Read 工具读取文件

const result2 = await unstable_v2_prompt(
  "列出所有 .ts 文件",
  { model: "claude-sonnet-4-20250514" }
)
// Agent 会自动使用 Glob 或 Bash 工具
```

### 高级配置

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk'

const q = query({
  prompt: "帮我重构这个项目",
  options: {
    model: "claude-sonnet-4-20250514",

    // 限制最大轮次
    maxTurns: 20,

    // 限制最大预算
    maxBudgetUsd: 2.0,

    // 限制思考 token 数量
    maxThinkingTokens: 5000,

    // 设置权限模式
    permissionMode: 'acceptEdits',  // 自动接受文件编辑

    // 设置工作目录
    cwd: '/path/to/project',

    // 额外允许访问的目录
    additionalDirectories: ['/path/to/docs'],

    // 只允许特定工具
    allowedTools: ['Read', 'Glob', 'Grep'],

    // 或禁用特定工具
    disallowedTools: ['Bash', 'Write'],

    // 自定义系统提示
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: '请使用中文回复。'
    },

    // 添加钩子
    hooks: {
      PreToolUse: [{
        hooks: [async (input, toolUseID, { signal }) => {
          console.log(`即将使用工具: ${input.tool_name}`)
          return { continue: true }
        }]
      }]
    }
  }
})

for await (const message of q) {
  if (message.type === 'assistant') {
    console.log('Assistant:', message.message)
  } else if (message.type === 'result') {
    console.log('Final result:', message)
  }
}
```

---

## 常见问题

### Q1: 我可以同时使用两个 SDK 吗?

**A:** 技术上可以，但不推荐。Agent SDK 已经内部依赖了标准 SDK，如果需要底层控制，可以考虑:
- 对于需要 Agent 能力的任务，使用 `@anthropic-ai/claude-agent-sdk`
- 对于简单的 API 调用，仍可直接使用 `@anthropic-ai/sdk`

### Q2: Agent SDK 支持 Prompt Caching 吗?

**A:** 是的，Agent SDK 会自动处理 Prompt Caching。你不需要手动设置 `cache_control`，系统会智能地缓存系统提示和长对话历史。

### Q3: 如何查看底层的 API 调用?

**A:** Agent SDK 抽象了底层细节，但你可以:

- 查看 `SDKResultMessage` 中的 `usage` 和 `modelUsage` 字段了解 token 使用
- 使用 `stderr` 选项捕获调试输出
- 使用钩子系统监控工具调用

```typescript
const q = query({
  prompt: "Hello",
  options: {
    stderr: (data) => console.error('DEBUG:', data),
    hooks: {
      PreToolUse: [{
        hooks: [async (input) => {
          console.log('Tool call:', input.tool_name, input.tool_input)
          return { continue: true }
        }]
      }]
    }
  }
})
```

### Q4: Agent SDK 的性能如何?

**A:** Agent SDK 会启动一个 Node.js 进程运行 Claude Code，这会有一些开销。对于:
- **低频调用** (如聊天机器人): 性能完全可接受
- **高频简单调用** (如分类、提取): 考虑使用标准 SDK
- **需要工具调用的复杂任务**: Agent SDK 是最佳选择

### Q5: 如何控制成本?

**A:** Agent SDK 提供多种成本控制选项:

```typescript
const q = query({
  prompt: "任务",
  options: {
    // 限制最大预算
    maxBudgetUsd: 1.0,

    // 限制最大轮次
    maxTurns: 10,

    // 限制思考 token
    maxThinkingTokens: 5000,

    // 使用更便宜的模型
    model: 'claude-haiku-4-20250514',

    // 限制工具使用
    allowedTools: ['Read'],  // 避免昂贵的 WebSearch 等
  }
})
```

### Q6: 如何处理长时间运行的任务?

**A:** 使用 `AbortController`:

```typescript
const controller = new AbortController()

// 设置超时
const timeout = setTimeout(() => {
  console.log('任务超时，中止...')
  controller.abort()
}, 5 * 60 * 1000)  // 5 分钟

const q = query({
  prompt: "长时间任务",
  options: {
    model: "claude-sonnet-4-20250514",
    abortController: controller
  }
})

try {
  for await (const message of q) {
    // 处理消息
  }
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('任务被中止')
  }
} finally {
  clearTimeout(timeout)
}
```

### Q7: Agent SDK 支持哪些工具?

**A:** 内置工具包括:
- **文件操作**: Read, Write, Edit, Glob, NotebookEdit
- **代码执行**: Bash, BashOutput, KillShell
- **搜索**: Grep, WebSearch
- **网络**: WebFetch
- **MCP**: McpInput, ListMcpResources, ReadMcpResource
- **交互**: AskUserQuestion, TodoWrite
- **高级**: Task (启动子 Agent), ExitPlanMode

可以通过 `allowedTools` 和 `disallowedTools` 选项控制。

---

## 总结

### 选择标准 SDK 的场景:
- 需要完全控制 API 调用
- 简单的文本生成任务
- 已有自定义工具系统
- 对性能有极致要求

### 选择 Agent SDK 的场景:
- 需要文件操作、代码执行能力
- 构建自主 Agent 系统
- 希望快速开发，减少样板代码
- 需要利用 Claude Code 的生态 (MCP 服务器、插件等)

### 当前项目建议:
- ✅ 继续使用 `@anthropic-ai/claude-agent-sdk`
- ✅ 使用 `unstable_v2_prompt` 进行简单的一次性对话
- ✅ 如需多轮对话，迁移到 `unstable_v2_createSession` API
- ✅ 通过环境变量配置 AWS Bedrock

---

**文档更新时间**: 2025-12-10
**Agent SDK 版本**: 0.1.59
**标准 SDK 版本**: 最新 (用于对比)
