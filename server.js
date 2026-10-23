import { createApp } from './src/app.js';
import { createGeminiClient } from './src/ai/geminiClient.js';
import { loadConfig } from './src/config.js';
import { loadDotEnv } from './src/env.js';
import { createLogger } from './src/logger.js';

const SHUTDOWN_GRACE_MS = 5000;

const logger = createLogger();
loadDotEnv();
const config = loadConfig();
const aiClient = createGeminiClient({
  apiKey: config.geminiApiKey,
  models: config.geminiModels,
  timeoutMs: config.aiTimeoutMs,
  logger,
});

const server = await createApp({ config, aiClient, logger });

server.listen(config.port, config.host, () => {
  const { port } = server.address();
  logger.info('listening', { url: `http://${config.host}:${port}`, ai: aiClient.enabled, models: config.geminiModels });
});

function shutdown(signal) {
  logger.info('shutting_down', { signal });
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
