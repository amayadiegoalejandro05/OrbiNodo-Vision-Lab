/* global console, process, setTimeout */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import pg from 'pg';

loadDotenv({ path: resolve('.env.backend.local'), quiet: true });
const { Pool } = pg;
const database = new Pool({
  host: process.env.ORBINODO_DATABASE_HOST ?? '127.0.0.1',
  port: Number(process.env.ORBINODO_DATABASE_PORT ?? 5432),
  database: process.env.ORBINODO_DATABASE_NAME ?? 'orbinodo_demo',
  user: process.env.ORBINODO_DATABASE_USER ?? 'orbinodo_api',
  password: process.env.ORBINODO_DATABASE_PASSWORD,
  ssl: process.env.ORBINODO_DATABASE_SSL === 'true',
});

async function freePort() {
  const server = createServer();
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No hay puerto libre.');
  await new Promise((ok) => server.close(ok));
  return address.port;
}

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const api = spawn(process.execPath, [
  resolve('node_modules/tsx/dist/cli.mjs'), resolve('backend/server.ts'),
], { env: { ...process.env, ORBINODO_API_PORT: String(port) }, stdio: 'ignore' });

async function waitForApi() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch { /* todavía está iniciando */ }
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error('La API temporal no inició correctamente.');
}

async function login(username, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error('Falló el inicio de sesión real.');
  const cookie = response.headers.get('set-cookie') ?? '';
  if (!cookie.includes('HttpOnly') || !cookie.includes('SameSite=Lax')) {
    throw new Error('La cookie no tiene la protección esperada.');
  }
  return cookie.split(';', 1)[0];
}

async function verifySession(cookie, expectedUsername) {
  const headers = { cookie };
  const me = await fetch(`${baseUrl}/api/auth/me`, { headers });
  const body = await me.json();
  if (!me.ok || body.user?.username !== expectedUsername) {
    throw new Error('La sesión no corresponde al perfil esperado.');
  }
  const logout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST', headers,
  });
  if (logout.status !== 204) throw new Error('Falló logout.');
  const after = await fetch(`${baseUrl}/api/auth/me`, { headers });
  if (after.status !== 401) throw new Error('La sesión siguió activa.');
}

try {
  await waitForApi();
  const engineerPassword = process.env.ORBINODO_SEED_ENGINEER1_PASSWORD;
  const managerPassword = process.env.ORBINODO_SEED_MANAGER_PASSWORD;
  if (!engineerPassword || !managerPassword) {
    throw new Error('Faltan credenciales locales de verificación.');
  }
  const engineerCookie = await login('Ingeniero 1', engineerPassword);
  const managerCookie = await login('Jefe', managerPassword);
  if (engineerCookie === managerCookie) throw new Error('Las sesiones no son únicas.');
  const cameras = await fetch(`${baseUrl}/api/cameras`, {
    headers: { cookie: engineerCookie },
  });
  const inventory = await cameras.json();
  if (!cameras.ok || inventory.cameras?.length !== 10) {
    throw new Error('La API no devolvió las diez cámaras de PostgreSQL.');
  }
  const forbidden = await fetch(`${baseUrl}/api/cameras/camera-01/operations`, {
    method: 'PATCH',
    headers: { cookie: managerCookie, 'content-type': 'application/json' },
    body: '{}',
  });
  if (forbidden.status !== 403) throw new Error('El Jefe pudo editar por API.');
  await Promise.all([
    verifySession(engineerCookie, 'Ingeniero 1'),
    verifySession(managerCookie, 'Jefe'),
  ]);
  const view = await database.query(
    'SELECT * FROM vista_historial_accesos LIMIT 1',
  );
  const columns = view.fields.map(({ name }) => name);
  const expected = ['Usuario', 'Entrada', 'Salida', 'Estado', 'Duración'];
  if (columns.join('|') !== expected.join('|')) {
    throw new Error('La vista legible no tiene las columnas esperadas.');
  }
  const cameraState = await database.query({
    text: `SELECT o.notes,
      array_agg(DISTINCT h.actor_username) AS actors
      FROM camera_operational_state o
      JOIN camera_change_history h ON h.camera_id = o.camera_id
      WHERE o.camera_id = $1 GROUP BY o.notes`,
    values: ['camera-03'],
  });
  const persisted = cameraState.rows[0];
  if (!persisted?.notes.includes('Ingeniero 2')
      || !persisted.actors.includes('Ingeniero 1')
      || !persisted.actors.includes('Ingeniero 2')) {
    throw new Error('Los cambios de cámaras no quedaron persistidos y auditados.');
  }
  console.log('Autenticación PostgreSQL verificada con dos sesiones independientes.');
  console.log('Vista legible del historial de accesos verificada.');
  console.log('Cambios operativos y autores verificados en PostgreSQL.');
} finally {
  api.kill();
  await database.end();
}
