import { createApp } from './app.js';

const { server, config, sessionManager } = createApp();

server.listen(config.port, () => {
  console.log(`[Server] u-loc backend running on port ${config.port}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV ?? 'development'}`);
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`[Server] Received ${signal}, shutting down gracefully...`);

  sessionManager.cleanup();

  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
