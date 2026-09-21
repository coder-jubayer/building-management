export const config = {
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined)?.trim() || 'http://localhost:3001/api/v1',
  appName: 'Barighorr Admin',
  appVersion: '1.0.0',
} as const;
