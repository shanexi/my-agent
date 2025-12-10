# @anthropic-ai/sdk 使用清单

本文档整理了 Claude Code 0.2.8 项目中所有使用 `@anthropic-ai/sdk` 的位置和方式。

## 📦 一、核心类（Classes）

### 1. **Anthropic**
- **位置**: `src/services/claude.ts:165, 275`
- **功能**: 主客户端类，用于创建与 Anthropic API 的连接
- **创建方式**:
  ```typescript
  new Anthropic({
    apiKey: string,
    dangerouslyAllowBrowser: true,
    maxRetries: number,
    defaultHeaders: {...},
    timeout: number
  })
  ```
- **主要用途**:
  - `verifyApiKey()` - 验证 API 密钥
  - `getAnthropicClient()` - 获取全局客户端实例

### 2. **AnthropicBedrock**
- **位置**: `src/services/claude.ts:253`
- **功能**: AWS Bedrock 平台的客户端
- **来源**: `@anthropic-ai/bedrock-sdk`

### 3. **AnthropicVertex**
- **位置**: `src/services/claude.ts:262`
- **功能**: Google Vertex AI 平台的客户端
- **来源**: `@anthropic-ai/vertex-sdk`

---

## 🔧 二、核心方法（Methods）

### 1. **anthropic.messages.create()**
- **位置**: `src/services/claude.ts:179`
- **功能**: 创建非流式消息请求
- **参数**:
  ```typescript
  {
    model: string,
    max_tokens: number,
    messages: MessageParam[],
    temperature: number,
    metadata: {...}
  }
  ```
- **用于**: API 密钥验证

### 2. **anthropic.beta.messages.stream()**
- **位置**: `src/services/claude.ts:516, 699, 816`
- **功能**: 创建流式消息请求（支持 prompt caching）
- **参数**:
  ```typescript
  {
    model: string,
    max_tokens: number,
    messages: MessageParam[],
    temperature: number,
    system: TextBlockParam[],
    tools: {...}[],
    betas?: string[],
    metadata: {...},
    thinking?: {...},
    stream: true
  }
  ```
- **使用场景**:
  - `querySonnetWithPromptCaching()` - 主查询（Sonnet 模型）
  - `queryHaikuWithPromptCaching()` - 快速查询（Haiku 模型）
  - `queryHaikuWithoutPromptCaching()` - 不使用缓存的查询

### 3. **stream.finalMessage()**
- **位置**: `src/services/claude.ts:219`
- **功能**: 获取流式响应的最终完整消息
- **返回**: `StreamResponse` (APIMessage + ttftMs)
- **用于**: `handleMessageStream()` 处理流式响应

---

## 📝 三、类型/接口（Types/Interfaces）

### 消息相关类型

| 类型 | 导入位置 | 使用位置 | 功能描述 |
|-----|---------|---------|---------|
| **MessageParam** | `src/commands.ts:21`<br>`src/services/claude.ts:28` | 多处 | API 消息参数（user/assistant） |
| **Message (as APIMessage)** | `src/services/claude.ts:27`<br>`src/utils/messages.tsx:23` | 多处 | API 返回的完整消息对象 |

### 内容块类型

| 类型 | 导入位置 | 使用位置 | 功能描述 |
|-----|---------|---------|---------|
| **ContentBlock** | `src/services/vcr.ts:10`<br>`src/utils/messages.tsx:25` | VCR 录制回放 | API 返回的内容块（可能是 text/tool_use） |
| **ContentBlockParam** | `src/utils/messages.tsx:24` | 消息规范化 | 发送给 API 的内容块参数 |
| **TextBlock** | `src/tools/ArchitectTool:1`<br>`src/tools/AgentTool:1`<br>`src/components/binary-feedback:1` | Agent/反馈处理 | API 返回的文本内容块 |
| **TextBlockParam** | `src/services/claude.ts:29`<br>多个组件文件 | 系统提示/用户消息 | 发送文本内容块参数 |
| **ImageBlockParam** | `src/tools/FileReadTool:1`<br>`src/utils/messages.tsx:19` | 图片处理 | 图片内容块参数 |

### 工具相关类型

| 类型 | 导入位置 | 使用位置 | 功能描述 |
|-----|---------|---------|---------|
| **ToolUseBlock** | `src/utils/messages.tsx:34`<br>`src/components/binary-feedback:1` | 工具使用识别 | API 返回的工具使用块 |
| **ToolUseBlockParam** | `src/screens/REPL.tsx:1`<br>`src/components/messages/AssistantToolUseMessage:4`<br>`src/components/messages/UserToolResultMessage/utils:1` | 工具使用消息渲染 | 工具使用块参数 |
| **ToolResultBlockParam** | `src/components/messages/UserToolResultMessage/*` | 工具结果消息 | 工具执行结果参数 |

### 使用统计类型

| 类型 | 导入位置 | 使用位置 | 功能描述 |
|-----|---------|---------|---------|
| **BetaUsage** | `src/services/claude.ts:5` | Token/成本统计 | 包含缓存 token 的使用统计 |

### 流式处理类型

| 类型 | 导入位置 | 使用位置 | 功能描述 |
|-----|---------|---------|---------|
| **BetaMessageStream** | `src/services/claude.ts:25` | 流式查询 | Beta 版本的消息流对象 |

---

## ⚠️ 四、错误处理类

| 类 | 导入位置 | 使用位置 | 功能描述 |
|----|---------|---------|---------|
| **APIError** | `src/services/claude.ts:2` | `shouldRetry()`<br>`withRetry()` | API 错误基类，包含 `status`、`headers`、`message` |
| **APIConnectionError** | `src/services/claude.ts:2` | `shouldRetry()` | 连接错误（网络问题） |

### 错误属性
- `error.status` - HTTP 状态码（408/409/429/5xx）
- `error.headers` - 响应头（`x-should-retry`, `retry-after`）
- `error.message` - 错误消息

### 重试逻辑（`shouldRetry()`）
```typescript
// 位置: src/services/claude.ts:86-118
function shouldRetry(error: APIError): boolean {
  // 检查 overloaded_error（仅 SWE_BENCH 重试）
  if (error.message?.includes('"type":"overloaded_error"')) {
    return process.env.USER_TYPE === 'SWE_BENCH'
  }

  // 遵循服务器指示
  const shouldRetryHeader = error.headers?.['x-should-retry']
  if (shouldRetryHeader === 'true') return true
  if (shouldRetryHeader === 'false') return false

  // 连接错误
  if (error instanceof APIConnectionError) return true

  // 特定状态码重试
  if (error.status === 408) return true  // Request timeout
  if (error.status === 409) return true  // Lock timeout
  if (error.status === 429) return true  // Rate limit
  if (error.status && error.status >= 500) return true  // Server errors

  return false
}
```

---

## 🔄 五、核心流程使用示例

### 1. Sonnet 查询流程
```typescript
// 位置: src/services/claude.ts:443-616
async function querySonnetWithPromptCaching(
  messages: (UserMessage | AssistantMessage)[],
  systemPrompt: string[],
  maxThinkingTokens: number,
  tools: Tool[],
  signal: AbortSignal,
  options: {...}
): Promise<AssistantMessage> {
  // 1. 获取客户端
  const anthropic = await getAnthropicClient(options.model)

  // 2. 准备系统提示（带缓存标记）
  const system: TextBlockParam[] = splitSysPromptPrefix(systemPrompt).map(_ => ({
    cache_control: { type: 'ephemeral' },
    text: _,
    type: 'text',
  }))

  // 3. 准备工具模式
  const toolSchemas = await Promise.all(
    tools.map(async _ => ({
      name: _.name,
      description: await _.prompt({...}),
      input_schema: zodToJsonSchema(_.inputSchema)
    }))
  )

  // 4. 发起流式请求（带重试）
  const response = await withRetry(async attempt => {
    const s = anthropic.beta.messages.stream({
      model: options.model,
      max_tokens: maxThinkingTokens + 1,
      messages: addCacheBreakpoints(messages),
      temperature: MAIN_QUERY_TEMPERATURE,
      system,
      tools: toolSchemas,
      betas: await getBetas(),
      metadata: getMetadata(),
      thinking: {...}  // ANT 专用
    }, { signal })

    return handleMessageStream(s)
  })

  // 5. 计算成本并返回
  const costUSD = calculateCost(response.usage)
  addToTotalCost(costUSD, durationMs)

  return {
    message: {
      ...response,
      content: normalizeContentFromAPI(response.content),
    },
    costUSD,
    durationMs,
    type: 'assistant',
    uuid: randomUUID(),
  }
}
```

### 2. Haiku 查询流程
```typescript
// 位置: src/services/claude.ts:652-778
async function queryHaikuWithPromptCaching({...}): Promise<AssistantMessage> {
  const anthropic = await getAnthropicClient(SMALL_FAST_MODEL)

  const response = await withRetry(async attempt => {
    const s = anthropic.beta.messages.stream({
      model: SMALL_FAST_MODEL,
      max_tokens: 512,
      messages: [
        { role: 'user', content: userPrompt },
        ...(assistantPrompt ? [{ role: 'assistant', content: assistantPrompt }] : [])
      ],
      system: splitSysPromptPrefix(systemPrompt).map(_ => ({
        cache_control: { type: 'ephemeral' },
        text: _,
        type: 'text',
      })),
      temperature: 0,
      metadata: getMetadata(),
      stream: true,
    }, { signal })

    return await handleMessageStream(s)
  })

  return assistantMessage
}
```

### 3. 错误重试流程
```typescript
// 位置: src/services/claude.ts:120-162
async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? MAX_RETRIES
  let lastError: unknown

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation(attempt)
    } catch (error) {
      lastError = error

      // 只在应该重试时重试
      if (
        attempt > maxRetries ||
        !(error instanceof APIError) ||
        !shouldRetry(error)
      ) {
        throw error
      }

      // 获取重试延迟
      const retryAfter = error.headers?.['retry-after'] ?? null
      const delayMs = getRetryDelay(attempt, retryAfter)

      console.log(`  ⎿  API Error · Retrying in ${Math.round(delayMs / 1000)}s… (attempt ${attempt}/${maxRetries})`)

      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  throw lastError
}
```

### 4. 流式消息处理
```typescript
// 位置: src/services/claude.ts:206-224
async function handleMessageStream(
  stream: BetaMessageStream,
): Promise<StreamResponse> {
  const streamStartTime = Date.now()
  let ttftMs: number | undefined

  // 遍历流式部分（可以在这里添加进度显示）
  for await (const part of stream) {
    if (part.type === 'message_start') {
      ttftMs = Date.now() - streamStartTime  // Time to first token
    }
  }

  // 获取最终完整消息
  const finalResponse = await stream.finalMessage()

  return {
    ...finalResponse,
    ttftMs,  // 附加首 token 时间
  }
}
```

---

## 📊 六、按文件分类的使用情况

| 文件 | 使用的类/方法 | 主要用途 |
|------|--------------|---------|
| **src/services/claude.ts** | Anthropic<br>APIError, APIConnectionError<br>messages.create<br>beta.messages.stream<br>finalMessage | 核心 API 交互、错误处理、重试逻辑 |
| **src/utils/messages.tsx** | ContentBlock<br>TextBlock<br>ToolUseBlock<br>ImageBlockParam<br>ContentBlockParam | 消息规范化和转换 |
| **src/tools/*.tsx** | TextBlock<br>ImageBlockParam | 工具输入/输出处理 |
| **src/components/messages/*.tsx** | TextBlockParam<br>ToolUseBlockParam<br>ToolResultBlockParam | 消息 UI 渲染 |
| **src/screens/REPL.tsx** | ToolUseBlockParam | 工具使用协调 |
| **src/services/vcr.ts** | ContentBlock | VCR 录制回放（调试用） |
| **src/commands.ts** | MessageParam | 命令系统消息构建 |

---

## 🎯 七、关键方法/属性速查表

| 方法/属性 | 位置 | 功能 |
|----------|------|------|
| `new Anthropic({...})` | claude.ts:165,275 | 创建客户端实例 |
| `new AnthropicBedrock({...})` | claude.ts:253 | 创建 AWS Bedrock 客户端 |
| `new AnthropicVertex({...})` | claude.ts:262 | 创建 Vertex AI 客户端 |
| `.messages.create({...})` | claude.ts:179 | 非流式请求（仅用于验证） |
| `.beta.messages.stream({...})` | claude.ts:516,699,816 | 流式请求（支持 prompt caching） |
| `stream.finalMessage()` | claude.ts:219 | 获取流的最终完整消息 |
| `stream.request_id` | claude.ts:556,580,726,773 | 请求 ID（用于日志追踪） |
| `error.status` | claude.ts:103-115 | HTTP 状态码（重试判断） |
| `error.headers` | claude.ts:93,142 | 响应头（重试策略/延迟） |
| `error.message` | claude.ts:88 | 错误详细信息 |

---

## 🚀 八、实现小脚本的关键要点

如果你要从零实现类似功能，需要重点关注：

### 1. 最小可用示例
```typescript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// 非流式
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }]
})

// 流式（带缓存）
const stream = client.beta.messages.stream({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }],
  system: [{
    type: 'text',
    text: 'System prompt',
    cache_control: { type: 'ephemeral' }  // 缓存标记
  }]
})

for await (const part of stream) {
  if (part.type === 'content_block_delta') {
    process.stdout.write(part.delta.text)
  }
}

const final = await stream.finalMessage()
console.log(final)
```

### 2. 工具使用示例
```typescript
const response = await client.beta.messages.stream({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  messages: [{ role: 'user', content: 'What is the weather?' }],
  tools: [{
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
})

const final = await response.finalMessage()

// 检查是否有工具调用
if (final.content.some(_ => _.type === 'tool_use')) {
  const toolUse = final.content.find(_ => _.type === 'tool_use')
  console.log('Tool call:', toolUse.name, toolUse.input)

  // 返回工具结果
  const response2 = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      { role: 'user', content: 'What is the weather?' },
      { role: 'assistant', content: final.content },
      {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify({ temp: 72, condition: 'sunny' })
        }]
      }
    ],
    tools: [...]
  })
}
```

### 3. 错误处理示例
```typescript
import { APIError, APIConnectionError } from '@anthropic-ai/sdk'

try {
  const response = await client.messages.create({...})
} catch (error) {
  if (error instanceof APIConnectionError) {
    console.error('Network error:', error.message)
    // 重试逻辑
  } else if (error instanceof APIError) {
    console.error('API error:', error.status, error.message)

    // 检查是否应该重试
    if (error.status === 429) {
      const retryAfter = error.headers?.['retry-after']
      console.log(`Rate limited. Retry after ${retryAfter}s`)
    }
  }
}
```

---

## 📚 九、相关文档

- **Anthropic API 官方文档**: https://docs.anthropic.com/
- **SDK GitHub**: https://github.com/anthropics/anthropic-sdk-typescript
- **Prompt Caching**: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- **Tool Use**: https://docs.anthropic.com/en/docs/build-with-claude/tool-use

---

## 📋 十、导入汇总

完整导入示例（供参考）：

```typescript
// 核心客户端
import Anthropic, { APIConnectionError, APIError } from '@anthropic-ai/sdk'
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk'

// 消息类型
import type {
  Message as APIMessage,
  MessageParam,
} from '@anthropic-ai/sdk/resources/index.mjs'

// 内容块类型
import type {
  ContentBlock,
  ContentBlockParam,
  TextBlock,
  TextBlockParam,
  ImageBlockParam,
  ToolUseBlock,
  ToolUseBlockParam,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'

// 流式处理
import type { BetaMessageStream } from '@anthropic-ai/sdk/lib/BetaMessageStream.mjs'

// 使用统计
import type { BetaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

// Shims (Node.js 环境必需)
import '@anthropic-ai/sdk/shims/node'
```

---

*最后更新: 2025-12-10*
