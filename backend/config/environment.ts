import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const environmentSchema = z.object({
  ORBINODO_API_HOST: z.string().min(1).default('127.0.0.1'),
  ORBINODO_API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  ORBINODO_DATABASE_HOST: z.string().min(1).default('127.0.0.1'),
  ORBINODO_DATABASE_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  ORBINODO_DATABASE_NAME: z.string().min(1).default('orbinodo_demo'),
  ORBINODO_DATABASE_USER: z.string().min(1).default('orbinodo_api'),
  ORBINODO_DATABASE_PASSWORD: z.string().min(1),
  ORBINODO_DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  ORBINODO_SESSION_HOURS: z.coerce.number().int().min(1).max(168).default(8),
  ORBINODO_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default('orbinodo_session'),
  ORBINODO_COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
});

export type BackendEnvironment = z.infer<typeof environmentSchema>;

// Las credenciales del backend nunca usan variables VITE_* visibles en el navegador.
export function loadBackendEnvironment(): BackendEnvironment {
  loadDotenv({ path: resolve(process.cwd(), '.env.backend.local'), quiet: true });
  const parsed = environmentSchema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error('Configuración local incompleta. Revisa estas variables: ' + names);
  }
  return parsed.data;
}
