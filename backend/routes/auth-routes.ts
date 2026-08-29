import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { apiError } from '../api-error.js';
import type { AuthService } from '../domain/auth-service';
import { LoginRateLimitedError } from '../domain/auth-service.js';

export interface AuthRouteOptions {
  authService: AuthService;
  cookieName: string;
  cookieSecure: boolean;
  sessionHours: number;
}

const loginBody = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(128),
}).strict();

const unauthorized = apiError('INVALID_CREDENTIALS', 'Usuario o contraseña incorrectos.');

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (app, options) => {
  const cookieOptions = {
    httpOnly: true, sameSite: 'lax' as const, secure: options.cookieSecure,
    path: '/', maxAge: options.sessionHours * 60 * 60,
  };

  app.post('/login', async (request, reply) => {
    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(apiError('VALIDATION_ERROR', 'Los datos de acceso no son válidos.'));
    }
    let result;
    try {
      result = await options.authService.login(
        parsed.data.username, parsed.data.password, { sourceIp: request.ip },
      );
    } catch (error) {
      if (error instanceof LoginRateLimitedError) {
        request.log.warn({ event: 'auth.login', outcome: 'rate_limited' }, 'Login rate limited');
        return reply.code(429).send(apiError(
          'LOGIN_RATE_LIMITED', 'Demasiados intentos. Intenta nuevamente más tarde.',
        ));
      }
      throw error;
    }
    if (!result) {
      request.log.warn({ event: 'auth.login', outcome: 'failure', reason: 'invalid_credentials' }, 'Login failed');
      return reply.code(401).send(unauthorized);
    }
    request.log.info({ event: 'auth.login', outcome: 'success', role: result.user.role }, 'Login succeeded');
    reply.setCookie(options.cookieName, result.token, cookieOptions);
    return {
      user: result.user,
      expiresAt: result.expiresAt.toISOString(),
    };
  });

  app.get('/me', async (request, reply) => {
    const token = request.cookies[options.cookieName];
    const user = token ? await options.authService.getSession(token) : null;
    if (!user) {
      return reply.code(401).send(apiError('SESSION_REQUIRED', 'Se requiere una sesión válida.'));
    }
    return { user };
  });

  app.post('/logout', async (request, reply) => {
    const token = request.cookies[options.cookieName];
    if (token) {
      await options.authService.logout(token);
      request.log.info({ event: 'auth.logout', outcome: 'success' }, 'Logout completed');
    }
    reply.clearCookie(options.cookieName, cookieOptions);
    return reply.code(204).send();
  });
};
