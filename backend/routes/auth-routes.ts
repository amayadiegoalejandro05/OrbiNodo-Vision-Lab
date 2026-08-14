import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AuthService } from '../domain/auth-service';

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

const unauthorized = { message: 'Usuario o contraseña incorrectos.' };

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (app, options) => {
  const cookieOptions = {
    httpOnly: true, sameSite: 'lax' as const, secure: options.cookieSecure,
    path: '/', maxAge: options.sessionHours * 60 * 60,
  };

  app.post('/login', async (request, reply) => {
    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) return reply.code(401).send(unauthorized);
    const result = await options.authService.login(
      parsed.data.username, parsed.data.password,
    );
    if (!result) return reply.code(401).send(unauthorized);
    reply.setCookie(options.cookieName, result.token, cookieOptions);
    return {
      user: result.user,
      expiresAt: result.expiresAt.toISOString(),
    };
  });

  app.get('/me', async (request, reply) => {
    const token = request.cookies[options.cookieName];
    const user = token ? await options.authService.getSession(token) : null;
    if (!user) return reply.code(401).send({ message: 'Sesión no válida.' });
    return { user };
  });

  app.post('/logout', async (request, reply) => {
    const token = request.cookies[options.cookieName];
    if (token) await options.authService.logout(token);
    reply.clearCookie(options.cookieName, cookieOptions);
    return reply.code(204).send();
  });
};
