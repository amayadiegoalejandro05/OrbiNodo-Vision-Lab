import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import type { BackendEnvironment } from '../../config/environment';
import { demoSecurityCameras } from '../../../src/data/demo-cameras';
import { hashPassword } from '../../security/password-hash';
import { createPostgresOptions } from '../postgres-options';
import type { SeedAccount } from './seed-accounts';

const OPERATION_INSERT_SQL = `INSERT INTO camera_operational_state
  (camera_id, status, last_maintenance_on, next_maintenance_on, responsible_area, notes)
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (camera_id) DO NOTHING`;
const CAMERA_INSERT_SQL = `INSERT INTO cameras
  (id, asset_code, name, panorama_id, location, brand, model, camera_type, yaw, pitch,
   installed_on, coverage, recording_mode, retention)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
  ON CONFLICT (id) DO NOTHING`;

export interface SeedResult {
  users: number;
  cameras: number;
}

type PreparedAccount = Omit<SeedAccount, 'password'> & { passwordHash: string };

const USER_UPSERT_SQL = `
  INSERT INTO users (username, display_name, password_hash, role, is_active)
  VALUES ($1, $2, $3, $4, true)
  ON CONFLICT ((lower(username))) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    is_active = true
`;

export async function runSeed(
  env: BackendEnvironment,
  accounts: SeedAccount[],
): Promise<SeedResult> {
  const prepared = accounts.map(({ password, ...account }) => ({
    ...account,
    passwordHash: hashPassword(password),
  }));
  return executeWithPool(env, prepared);
}

async function executeWithPool(
  env: BackendEnvironment,
  accounts: PreparedAccount[],
): Promise<SeedResult> {
  const pool = new Pool(createPostgresOptions(env));
  try {
    const client = await pool.connect();
    return await executeSeedTransaction(client, accounts);
  } finally {
    await pool.end();
  }
}

async function executeSeedTransaction(
  client: PoolClient,
  accounts: PreparedAccount[],
): Promise<SeedResult> {
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [1_849_042_027]);
    const schema = await client.query(
      'SELECT 1 FROM schema_migrations WHERE version = $1',
      ['0001_initial_schema.sql'],
    );
    if (schema.rowCount !== 1) throw new Error('Falta aplicar la migración inicial.');
    await seedUsers(client, accounts);
    await seedCameras(client);
    await client.query('COMMIT');
    return { users: accounts.length, cameras: demoSecurityCameras.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function seedUsers(client: PoolClient, accounts: PreparedAccount[]): Promise<void> {
  for (const account of accounts) {
    await client.query(USER_UPSERT_SQL, [
      account.username,
      account.displayName,
      account.passwordHash,
      account.role,
    ]);
  }
}

async function seedCameras(client: PoolClient): Promise<void> {
  for (const camera of demoSecurityCameras) await seedCamera(client, camera);
}

async function seedCamera(
  client: PoolClient,
  camera: (typeof demoSecurityCameras)[number],
): Promise<void> {
  await client.query(CAMERA_INSERT_SQL, [
    camera.id, camera.assetCode, camera.name, camera.panoramaId,
    camera.location, camera.brand, camera.model, camera.type,
    camera.yaw, camera.pitch, camera.installedOn, camera.coverage,
    camera.recordingMode, camera.retention,
  ]);
  await client.query(OPERATION_INSERT_SQL, [
    camera.id, camera.status, camera.lastMaintenanceOn,
    camera.nextMaintenanceOn, camera.responsibleArea, camera.notes,
  ]);
}
