import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
type DeploymentTarget = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
};

// Keeps browser-visible VITE variables out of security decisions.
export function isProductionDeployment(environment: DeploymentTarget): boolean {
  return environment.NODE_ENV === 'production' || environment.VERCEL_ENV === 'production';
}



const environmentSchema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(?:ql)?:\/\//).optional(),
  POSTGRES_URL: z.string().regex(/^postgres(?:ql)?:\/\//).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
  VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),
  ORBINODO_API_HOST: z.string().min(1).default('127.0.0.1'),
  ORBINODO_API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  ORBINODO_TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  ORBINODO_DATABASE_HOST: z.string().min(1).default('127.0.0.1'),
  ORBINODO_DATABASE_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  ORBINODO_DATABASE_NAME: z.string().min(1).default('orbinodo_demo'),
  ORBINODO_DATABASE_USER: z.string().min(1).default('orbinodo_api'),
  ORBINODO_DATABASE_PASSWORD: z.string().min(1).optional(),
  ORBINODO_DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  ORBINODO_SESSION_HOURS: z.coerce.number().int().min(1).max(8).default(8),
  ORBINODO_SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(480).default(30),
  ORBINODO_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(5),
  ORBINODO_LOGIN_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  ORBINODO_LOGIN_BLOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  ORBINODO_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default('orbinodo_session'),
  ORBINODO_COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  ORBINODO_LOG_LEVEL: z.enum(['info', 'warn', 'error']).default('info'),
}).superRefine((value, context) => {
  if (!value.DATABASE_URL && !value.POSTGRES_URL && !value.ORBINODO_DATABASE_PASSWORD) {
    context.addIssue({
      code: 'custom', path: ['ORBINODO_DATABASE_PASSWORD'],
      message: 'Falta DATABASE_URL o la contraseña de PostgreSQL local.',
    });
  }
  if (value.ORBINODO_SESSION_IDLE_MINUTES > value.ORBINODO_SESSION_HOURS * 60) {
    context.addIssue({
      code: 'custom', path: ['ORBINODO_SESSION_IDLE_MINUTES'],
      message: 'El timeout por inactividad no puede superar la duración absoluta.',
    });
  }
  if (isProductionDeployment(value) && value.ORBINODO_COOKIE_SECURE !== 'true') {
    context.addIssue({
      code: 'custom', path: ['ORBINODO_COOKIE_SECURE'],
      message: 'Produccion requiere ORBINODO_COOKIE_SECURE=true.',
    });
  }
  if (isProductionDeployment(value)
      && !value.DATABASE_URL && !value.POSTGRES_URL
      && value.ORBINODO_DATABASE_SSL !== 'true') {
    context.addIssue({
      code: 'custom', path: ['ORBINODO_DATABASE_SSL'],
      message: 'Produccion requires PostgreSQL TLS.',
    });
  }
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
