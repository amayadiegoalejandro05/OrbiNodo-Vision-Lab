export interface ViewerPosition {
  yaw: number;
  pitch: number;
}

export interface CoordinateCalibratorApi {
  setAvailable: (available: boolean) => void;
  setPanorama: (panoramaId: string) => void;
  update: (position: ViewerPosition) => void;
}

function requiredInside<T extends HTMLElement>(container: HTMLElement, selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error('El calibrador no contiene el elemento ' + selector);
  return element;
}

function radiansToDegrees(radians: number): number {
  return radians * 180 / Math.PI;
}

function normalizeYaw(degrees: number): number {
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}

// La mira representa el centro exacto de la cámara. Para calibrar una flecha,
// se centra la puerta o el acceso en la mira y se copian estos valores al enlace.
export function createCoordinateCalibrator(container: HTMLElement): CoordinateCalibratorApi {
  const toolbar = requiredInside<HTMLElement>(container, '.calibration-toolbar');
  const toggle = requiredInside<HTMLButtonElement>(container, '#toggle-calibration');
  const readout = requiredInside<HTMLElement>(container, '#calibration-readout');
  const crosshair = requiredInside<HTMLElement>(container, '#calibration-crosshair');
  const yawOutput = requiredInside<HTMLOutputElement>(container, '#calibration-yaw');
  const pitchOutput = requiredInside<HTMLOutputElement>(container, '#calibration-pitch');
  const copyButton = requiredInside<HTMLButtonElement>(container, '#copy-calibration');
  const copyStatus = requiredInside<HTMLElement>(container, '#calibration-copy-status');
  let panoramaId = 'sin-panorama';
  let yaw = 0;
  let pitch = 0;

  function render(): void {
    yawOutput.value = 'Yaw: ' + yaw.toFixed(1) + '°';
    pitchOutput.value = 'Pitch: ' + pitch.toFixed(1) + '°';
  }

  function deactivate(): void {
    toggle.setAttribute('aria-pressed', 'false');
    toggle.textContent = 'Activar calibrador';
    readout.hidden = true;
    crosshair.hidden = true;
    copyStatus.textContent = '';
  }

  toggle.addEventListener('click', () => {
    const enabled = toggle.getAttribute('aria-pressed') !== 'true';
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.textContent = enabled ? 'Desactivar calibrador' : 'Activar calibrador';
    readout.hidden = !enabled;
    crosshair.hidden = !enabled;
    copyStatus.textContent = '';
  });

  copyButton.addEventListener('click', async () => {
    const value = panoramaId + ' | yaw: ' + yaw.toFixed(1) + ' | pitch: ' + pitch.toFixed(1);
    try {
      await navigator.clipboard.writeText(value);
      copyStatus.textContent = 'Coordenadas copiadas.';
    } catch {
      copyStatus.textContent = 'No se pudo copiar. Anota los dos valores mostrados.';
    }
  });

  // Empieza oculto y solo main.ts lo habilita después de confirmar programador.
  toolbar.hidden = true;
  deactivate();
  render();
  return {
    setAvailable: (available) => {
      deactivate();
      toolbar.hidden = !available;
    },
    setPanorama: (id) => { panoramaId = id; copyStatus.textContent = ''; },
    update: (position) => {
      yaw = normalizeYaw(radiansToDegrees(position.yaw));
      pitch = radiansToDegrees(position.pitch);
      render();
    },
  };
}
