import { createApp } from './src/app.js';
import { createAnthropicClient } from './src/ai/anthropicClient.js';
import { loadConfig } from './src/config.js';
import { createLogger } from './src/logger.js';

const SHUTDOWN_GRACE_MS = 5000;

const logger = createLogger();
const config = loadConfig();
const aiClient = createAnthropicClient({
  apiKey: config.anthropicApiKey,
  model: config.anthropicModel,
  timeoutMs: config.aiTimeoutMs,
});

const server = await createApp({ config, aiClient, logger });

server.listen(config.port, config.host, () => {
  const { port } = server.address();
  logger.info('listening', { url: `http://${config.host}:${port}`, ai: aiClient.enabled });
});

function shutdown(signal) {
  logger.info('shutting_down', { signal });
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
