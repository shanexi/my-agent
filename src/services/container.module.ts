/**
 * InversifyJS Container Module
 * Registers all services for dependency injection
 */
import { ContainerModule } from 'inversify';
import { ConfigService, ConfigServiceImpl } from './config.service.js';
import { TelegramService, TelegramServiceImpl } from './telegram.service.js';
import { ClaudeService, ClaudeServiceImpl } from './claude.service.js';
import { CostService, CostServiceImpl } from './cost.service.js';
import { McpService, McpServiceImpl } from './mcp.service.js';
import {
  MessageProcessorService,
  MessageProcessorServiceImpl,
} from './message-processor.service.js';

export const servicesModule = new ContainerModule((bind) => {
  bind(ConfigService).to(ConfigServiceImpl).inSingletonScope();
  bind(TelegramService).to(TelegramServiceImpl).inSingletonScope();
  bind(ClaudeService).to(ClaudeServiceImpl).inSingletonScope();
  bind(CostService).to(CostServiceImpl).inSingletonScope();
  bind(McpService).to(McpServiceImpl).inSingletonScope();
  bind(MessageProcessorService)
    .to(MessageProcessorServiceImpl)
    .inSingletonScope();
});
