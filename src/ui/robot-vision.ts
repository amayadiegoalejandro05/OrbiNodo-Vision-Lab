import {
  getVisionPeople, getVisionServiceHealth, getVisionServiceStatus, getVisionStreamUrl, startVisionService, stopVisionService,
  type VisionFace, type VisionStatus,
} from '../api/vision-service-api';
import {
  canStartVisionService,
  createUnknownAlertConfirmation,
  VISION_SERVICE_CONFIGURATION,
  VISION_STATUS_POLL_MS,
} from '../config/vision-service';
import type { SecurityCameraRecord } from '../domain/security-camera.types';

export interface RobotVisionApi {
  open: (camera: SecurityCameraRecord) => void;
  updateCamera: (camera: SecurityCameraRecord) => void;
  close: () => void;
  destroy: () => void;
}

function operationalMessage(status: SecurityCameraRecord['status']): string {
  if (status === 'En mantenimiento') return 'Robot Vision no puede iniciar: la cámara está en mantenimiento.';
  if (status === 'Fuera de servicio') return 'Robot Vision no puede iniciar: la cámara está fuera de servicio.';
  return 'La cámara está disponible para el nodo Vision Service configurado.';
}

export function createRobotVision(parent: HTMLElement = document.body): RobotVisionApi {
  const dialog = document.createElement('dialog');
  dialog.className = 'robot-vision-dialog';
  dialog.innerHTML = `
    <section class="robot-vision" aria-labelledby="robot-vision-title">
      <header class="robot-vision-header"><div><p class="robot-vision-eyebrow">ROBOT-01 · percepción local experimental</p><h2 id="robot-vision-title">Robot Vision</h2></div><button type="button" class="robot-vision-close" aria-label="Cerrar Robot Vision">×</button></header>
      <dl class="robot-vision-status-grid"><div><dt>Cámara</dt><dd data-robot-camera-code></dd></div><div><dt>Estado operacional</dt><dd data-robot-operational-status></dd></div><div><dt>Vision Service</dt><dd data-robot-service-status>CONECTANDO</dd></div><div><dt>Video</dt><dd data-robot-video-status>INACTIVO</dd></div><div><dt>Percepción</dt><dd data-robot-perception-status>INACTIVA</dd></div><div><dt>FPS / último frame</dt><dd data-robot-stream-metrics>—</dd></div></dl>
      <div class="robot-vision-video-shell"><img class="robot-vision-stream" alt="Stream anotado de CAM-ROBOT-01" hidden><p class="robot-vision-video-placeholder">Activa la cámara para recibir el stream anotado del nodo Vision Service.</p></div>
      <p class="robot-vision-message" role="status" aria-live="polite"></p>
      <section class="robot-vision-recognition" aria-label="Estado de reconocimiento facial"><h3>Rostros actuales</h3><p data-robot-people-count>Personas autorizadas: —</p><ul class="robot-vision-faces" data-robot-faces><li>Sin lecturas actuales.</li></ul><p class="robot-vision-alert" data-robot-alert hidden>ALERTA · PERSONA NO RECONOCIDA · CAM-ROBOT-01 · <span data-robot-alert-time></span></p></section>
      <footer class="robot-vision-actions"><button type="button" data-robot-activate>Activar cámara</button><button type="button" data-robot-stop disabled>Detener cámara</button></footer>
    </section>`;
  parent.append(dialog);
  const code = dialog.querySelector<HTMLElement>('[data-robot-camera-code]')!;
  const operational = dialog.querySelector<HTMLElement>('[data-robot-operational-status]')!;
  const serviceStatus = dialog.querySelector<HTMLElement>('[data-robot-service-status]')!;
  const videoStatus = dialog.querySelector<HTMLElement>('[data-robot-video-status]')!;
  const perceptionStatus = dialog.querySelector<HTMLElement>('[data-robot-perception-status]')!;
  const streamMetrics = dialog.querySelector<HTMLElement>('[data-robot-stream-metrics]')!;
  const peopleCount = dialog.querySelector<HTMLElement>('[data-robot-people-count]')!;
  const facesHost = dialog.querySelector<HTMLUListElement>('[data-robot-faces]')!;
  const alert = dialog.querySelector<HTMLElement>('[data-robot-alert]')!;
  const alertTime = dialog.querySelector<HTMLElement>('[data-robot-alert-time]')!;
  const message = dialog.querySelector<HTMLElement>('.robot-vision-message')!;
  const stream = dialog.querySelector<HTMLImageElement>('.robot-vision-stream')!;
  const placeholder = dialog.querySelector<HTMLElement>('.robot-vision-video-placeholder')!;
  const activate = dialog.querySelector<HTMLButtonElement>('[data-robot-activate]')!;
  const stop = dialog.querySelector<HTMLButtonElement>('[data-robot-stop]')!;
  const unknownConfirmation = createUnknownAlertConfirmation();
  let camera: SecurityCameraRecord | undefined;
  let serviceReady = false;
  let serviceStarted = false;
  let pollTimer: number | undefined;
  let stopping: Promise<void> | undefined;
  let lastFacesKey = '';

  function setText(element: HTMLElement, value: string): void { if (element.textContent !== value) element.textContent = value; }
  function stopPolling(): void { if (pollTimer !== undefined) window.clearTimeout(pollTimer); pollTimer = undefined; }
  function clearStream(): void {
    stream.hidden = true;
    stream.removeAttribute('src');
    placeholder.hidden = false;
    setText(videoStatus, 'INACTIVO');
    setText(perceptionStatus, 'INACTIVA');
    setText(streamMetrics, '—');
  }
  function setFaces(faces: VisionFace[]): void {
    const key = JSON.stringify(faces);
    if (key === lastFacesKey) return;
    lastFacesKey = key;
    facesHost.replaceChildren(...(faces.length > 0 ? faces.map((face) => {
      const item = document.createElement('li');
      item.textContent = face.status === 'AUTHORIZED' ? `AUTHORIZED — ${face.name ?? 'sin nombre'} — ${face.similarity.toFixed(3)}` : `UNKNOWN — ${face.similarity.toFixed(3)}`;
      return item;
    }) : [document.createElement('li')]));
    if (faces.length === 0) facesHost.firstElementChild!.textContent = 'Sin rostros detectados.';
  }
  function updateStatus(status: VisionStatus): void {
    const hasFrame = status.running && Boolean(status.timestamp);
    setText(serviceStatus, status.state === 'ERROR' ? 'ERROR' : status.prepared ? 'LISTO' : 'INICIALIZANDO');
    setText(perceptionStatus, hasFrame ? 'ACTIVA' : 'INACTIVA');
    setText(videoStatus, hasFrame ? 'EN VIVO' : status.running ? 'INICIANDO' : 'INACTIVO');
    setText(streamMetrics, status.timestamp ? `${status.fps.toFixed(1)} FPS · ${new Date(status.timestamp).toLocaleTimeString()}` : 'Esperando primer frame');
    if (status.error) message.textContent = status.error;
    setFaces(status.faces);
    const alertNow = unknownConfirmation.observe(status.faces.some((face) => face.status === 'UNKNOWN'), Date.now());
    if (alertNow) { alert.hidden = false; alertTime.textContent = new Date().toLocaleTimeString(); }
    if (!status.faces.some((face) => face.status === 'UNKNOWN')) alert.hidden = true;
  }
  async function pollStatus(): Promise<void> {
    if (!serviceStarted) return;
    try { updateStatus(await getVisionServiceStatus()); }
    catch {
      serviceStarted = false;
      serviceReady = false;
      setText(serviceStatus, 'ERROR');
      message.textContent = 'Vision Service no disponible. Inicia o revisa el nodo remoto de percepción.';
      clearStream();
      return;
    }
    pollTimer = window.setTimeout(() => void pollStatus(), VISION_STATUS_POLL_MS);
  }
  async function checkHealth(): Promise<void> {
    if (VISION_SERVICE_CONFIGURATION.error) {
      serviceReady = false;
      setText(serviceStatus, 'NO CONFIGURADO');
      message.textContent = VISION_SERVICE_CONFIGURATION.error;
      return;
    }
    setText(serviceStatus, 'CONECTANDO');
    try {
      const health = await getVisionServiceHealth();
      serviceReady = health.status === 'ok' && health.models === 'ready';
      setText(serviceStatus, serviceReady ? 'LISTO' : health.state === 'INITIALIZING' ? 'INICIALIZANDO' : 'ERROR');
      if (!serviceReady) message.textContent = health.state === 'INITIALIZING'
        ? 'Vision Service está preparando los modelos.'
        : 'Vision Service no está listo para procesar la cámara.';
    } catch {
      serviceReady = false;
      setText(serviceStatus, 'ERROR');
      message.textContent = 'Vision Service no disponible. Inicia o revisa el nodo remoto de percepción.';
    }
  }
  async function refreshPeople(): Promise<void> {
    try { setText(peopleCount, `Personas autorizadas: ${(await getVisionPeople()).filter((person) => person.enabled).length}`); }
    catch { setText(peopleCount, 'Personas autorizadas: no disponible'); }
  }
  async function startCamera(): Promise<void> {
    if (!camera || !canStartVisionService(camera.status)) { message.textContent = camera ? operationalMessage(camera.status) : 'No hay una cámara seleccionada.'; return; }
    if (!serviceReady) await checkHealth();
    if (!serviceReady) return;
    activate.disabled = true;
    setText(videoStatus, 'INICIANDO');
    message.textContent = 'Iniciando Vision Service…';
    try {
      updateStatus(await startVisionService());
      serviceStarted = true;
      stream.src = getVisionStreamUrl();
      stream.hidden = false;
      placeholder.hidden = true;
      stop.disabled = false;
      message.textContent = 'Vision Service iniciando; esperando el primer frame anotado.';
      void pollStatus();
    } catch {
      setText(serviceStatus, 'ERROR');
      message.textContent = 'No se pudo iniciar Vision Service.';
      activate.disabled = false;
    }
  }
  async function stopCamera(): Promise<void> {
    if (stopping) return stopping;
    stopPolling();
    clearStream();
    serviceStarted = false;
    unknownConfirmation.reset();
    alert.hidden = true;
    stop.disabled = true;
    activate.disabled = !camera || !canStartVisionService(camera.status);
    stopping = (async () => {
      try { await stopVisionService(); }
      catch { if (serviceReady) message.textContent = 'No se pudo confirmar la detención de Vision Service.'; }
      finally { stopping = undefined; }
    })();
    return stopping;
  }
  function close(): void { void stopCamera(); if (dialog.open) dialog.close(); }
  function open(selectedCamera: SecurityCameraRecord): void {
    void stopCamera();
    camera = selectedCamera;
    code.textContent = camera.assetCode;
    operational.textContent = camera.status;
    activate.disabled = !canStartVisionService(camera.status) || Boolean(VISION_SERVICE_CONFIGURATION.error);
    message.textContent = operationalMessage(camera.status);
    dialog.showModal();
    void checkHealth();
    void refreshPeople();
  }
  function updateCamera(updatedCamera: SecurityCameraRecord): void {
    if (camera?.id !== updatedCamera.id) return;
    camera = updatedCamera;
    operational.textContent = camera.status;
    if (!canStartVisionService(camera.status)) { void stopCamera(); message.textContent = operationalMessage(camera.status); }
  }
  stream.addEventListener('error', () => { if (serviceStarted) message.textContent = 'El stream del nodo Vision Service no está disponible.'; });
  activate.addEventListener('click', () => void startCamera());
  stop.addEventListener('click', () => void stopCamera());
  dialog.querySelector('.robot-vision-close')?.addEventListener('click', close);
  dialog.addEventListener('close', () => void stopCamera());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
  return { open, updateCamera, close, destroy: () => { void stopCamera(); dialog.remove(); } };
}
