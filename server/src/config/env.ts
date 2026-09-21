import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  mongodbUri: requireEnv('MONGODB_URI'),
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigins: (
    process.env.CORS_ORIGINS ??
    'http://localhost:5173,http://localhost:8081,http://localhost:8082'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  apiUrl: process.env.API_URL ?? 'http://localhost:3000',
  isProduction: process.env.NODE_ENV === 'production',
} as const;
