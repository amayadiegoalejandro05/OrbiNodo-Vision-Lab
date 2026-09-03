const configuredUrl = process.argv[2] || process.env.ORBINODO_MONITOR_URL;
if (!configuredUrl) throw new Error('Falta ORBINODO_MONITOR_URL o una URL como primer argumento.');
const target = new URL(configuredUrl);
if (target.protocol !== 'https:' && process.env.ORBINODO_MONITOR_ALLOW_HTTP !== 'true') {
  throw new Error('El monitor exige una URL HTTPS. Para pruebas locales usa ORBINODO_MONITOR_ALLOW_HTTP=true.');
}

const timeoutMs = Number.parseInt(process.env.ORBINODO_MONITOR_TIMEOUT_MS || '10000', 10);
if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 29_000) {
  throw new Error('ORBINODO_MONITOR_TIMEOUT_MS debe estar entre 1000 y 29000.');
}

const alertWebhook = process.env.ORBINODO_MONITOR_ALERT_WEBHOOK_URL?.trim();

async function inspect(path, expectedBody) {
  const startedAt = performance.now();
  try {
    const response = await fetch(new URL(path, target), { signal: AbortSignal.timeout(timeoutMs) });
    let body = {};
    try { body = await response.json(); } catch { /* response is intentionally not logged */ }
    const ok = response.status === 200
      && Object.entries(expectedBody).every(([key, value]) => body[key] === value);
    return {
      ok,
      statusCode: response.status,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch {
    return { ok: false, statusCode: 0, latencyMs: Math.round(performance.now() - startedAt) };
  }
}

async function notify(event) {
  if (!alertWebhook || event.metrics.liveness_up === 1 && event.metrics.readiness_up === 1) return;
  let webhook;
  try {
    webhook = new URL(alertWebhook);
  } catch {
    throw new Error('ORBINODO_MONITOR_ALERT_WEBHOOK_URL no es una URL valida.');
  }
  if (webhook.protocol !== 'https:') throw new Error('El webhook de alerta debe usar HTTPS.');
  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event: 'orbinodo.health_alert',
        timestamp: event.timestamp,
        target: event.target,
        metrics: event.metrics,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) console.error(JSON.stringify({ event: 'alert.delivery_failed', statusCode: response.status }));
  } catch {
    console.error(JSON.stringify({ event: 'alert.delivery_failed', statusCode: 0 }));
  }
}

const [liveness, readiness] = await Promise.all([
  inspect('/api/live', { status: 'ok', service: 'api' }),
  inspect('/api/health', { status: 'ok', database: 'available' }),
]);

const event = {
  event: 'orbinodo.health_check',
  timestamp: new Date().toISOString(),
  target: target.origin,
  metrics: {
    liveness_up: liveness.ok ? 1 : 0,
    readiness_up: readiness.ok ? 1 : 0,
    liveness_latency_ms: liveness.latencyMs,
    readiness_latency_ms: readiness.latencyMs,
    liveness_status_code: liveness.statusCode,
    readiness_status_code: readiness.statusCode,
  },
};

console.log(JSON.stringify(event));
await notify(event);
if (event.metrics.liveness_up !== 1 || event.metrics.readiness_up !== 1) process.exitCode = 1;
