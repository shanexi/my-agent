/**
 * Cost Service
 * Handles cost calculation and formatting for AI model usage
 */
import { injectable } from 'inversify';
import type { TokenUsage } from '../types/telegram.types.js';

export const CostService = Symbol.for('CostService');

interface ModelPricing {
  input: number;
  output: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude Sonnet 4.5
  'us.anthropic.claude-sonnet-4-5-20250929-v1:0': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },

  // Claude Opus 4
  'us.anthropic.claude-opus-4-20250514-v1:0': { input: 15.0, output: 75.0 },
  'claude-opus-4-20250514': { input: 15.0, output: 75.0 },

  // Claude Haiku 4
  'us.anthropic.claude-haiku-4-20250514-v1:0': { input: 0.8, output: 4.0 },
  'claude-haiku-4-20250514': { input: 0.8, output: 4.0 },
};

@injectable()
export class CostServiceImpl {
  private getModelPricing(modelName: string): ModelPricing {
    return MODEL_PRICING[modelName] || { input: 3.0, output: 15.0 };
  }

  calculateCost(usage: TokenUsage, modelName: string): number {
    const pricing = this.getModelPricing(modelName);
    const inputCost = (usage.input_tokens / 1_000_000) * pricing.input;
    const outputCost = (usage.output_tokens / 1_000_000) * pricing.output;
    return inputCost + outputCost;
  }

  getModelDisplayName(modelName: string): string {
    if (modelName.includes('sonnet')) return 'Sonnet 4.5';
    if (modelName.includes('opus')) return 'Opus 4';
    if (modelName.includes('haiku')) return 'Haiku 4';
    return modelName;
  }

  formatCostInfo(usage: TokenUsage, modelName: string): string {
    const cost = this.calculateCost(usage, modelName);
    const pricing = this.getModelPricing(modelName);
    const displayName = this.getModelDisplayName(modelName);

    return `\n\n━━━━━━━━━━━━━━━━
🤖 ${displayName}
💰 Cost: $${cost.toFixed(6)}
📊 Tokens: ${usage.input_tokens.toLocaleString()} → ${usage.output_tokens.toLocaleString()}
💵 Rate: $${pricing.input}/M in, $${pricing.output}/M out`;
  }
}
