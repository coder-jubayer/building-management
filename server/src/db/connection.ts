import mongoose from 'mongoose';
import { env } from '../config/env';

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);

  const maxAttempts = 12;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await mongoose.connect(env.mongodbUri);
      console.log(`MongoDB connected (${env.isProduction ? 'production' : 'development'})`);
      return;
    } catch (error) {
      lastError = error;
      console.error(`MongoDB connect attempt ${attempt}/${maxAttempts} failed`);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  throw lastError;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function getDatabaseStatus(): 'connected' | 'disconnected' | 'connecting' | 'disconnecting' {
  const state = mongoose.connection.readyState;
  switch (state) {
    case 0:
      return 'disconnected';
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    case 3:
      return 'disconnecting';
    default:
      return 'disconnected';
  }
}
