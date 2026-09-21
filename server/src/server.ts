import app from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './db/connection';
import { runStartupMigrations } from './db/migrations';
import { seedAdminUser } from './db/seed';

async function bootstrap(): Promise<void> {
  await connectDatabase();
  await runStartupMigrations();
  await seedAdminUser();

  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`Server running on ${env.apiUrl} (port ${env.port})`);
    console.log(`LAN access: http://0.0.0.0:${env.port}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
