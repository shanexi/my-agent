/**
 * Claude Agent utilities
 */

import { unstable_v2_prompt } from "@anthropic-ai/claude-agent-sdk";

export interface AgentResponse {
  text: string;
  isError: boolean;
  durationMs: number;
  costUSD: number;
}

/**
 * Process a message using Claude Agent
 */
export async function processMessage(
  message: string,
  model?: string
): Promise<AgentResponse> {
  const modelName =
    model || process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

  try {
    const result = await unstable_v2_prompt(message, {
      model: modelName,
    });

    // Handle both success and error responses
    let responseText: string;
    if (result.subtype === "success") {
      responseText = result.result;
    } else {
      // Error response
      const errors = "errors" in result ? result.errors.join("; ") : "Unknown error";
      responseText = `处理消息时出现错误: ${errors}`;
    }

    return {
      text: responseText,
      isError: result.is_error,
      durationMs: result.duration_ms,
      costUSD: result.total_cost_usd,
    };
  } catch (error) {
    console.error("Claude Agent error:", error);
    return {
      text: "抱歉，处理您的消息时出现了错误。请稍后再试。",
      isError: true,
      durationMs: 0,
      costUSD: 0,
    };
  }
}
