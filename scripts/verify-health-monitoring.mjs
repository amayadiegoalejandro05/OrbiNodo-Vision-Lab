import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const guide = readFileSync(resolve(root, 'documentacion/health_checks_y_monitoreo_v1.txt'), 'utf8');
const app = readFileSync(resolve(root, 'backend/app.ts'), 'utf8');
const monitor = readFileSync(resolve(root, 'scripts/monitor-health.mjs'), 'utf8');

function assertCondition(condition, message) {
  if (!condition) throw new Error(`Health checks invalidos: ${message}`);
}

for (const text of [
  'GET /api/live',
  'GET /api/health',
  'liveness_up',
  'readiness_up',
  'ORBINODO_MONITOR_ALERT_WEBHOOK_URL',
  'PROGRAMACION EN WINDOWS',
  'RUNBOOK DE FALLOS',
  'cada 5 minutos',
]) {
  assertCondition(guide.includes(text), `falta documentar ${text}`);
}

assertCondition(app.includes("app.get('/api/live'"), 'falta endpoint liveness');
assertCondition(app.includes("app.get('/api/health'"), 'falta endpoint readiness');
assertCondition(monitor.includes("inspect('/api/live'"), 'el monitor no consulta liveness');
assertCondition(monitor.includes("inspect('/api/health'"), 'el monitor no consulta readiness');
assertCondition(monitor.includes('ORBINODO_MONITOR_ALERT_WEBHOOK_URL'), 'falta alerta opcional');
assertCondition(monitor.includes('liveness_latency_ms'), 'faltan metricas de latencia');
console.log('Health checks verificados: liveness, readiness, metricas, alertas opcionales y runbook.');
