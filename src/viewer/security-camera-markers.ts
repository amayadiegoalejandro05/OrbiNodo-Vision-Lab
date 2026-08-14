import type { MarkerConfig } from '@photo-sphere-viewer/markers-plugin';
import type { SecurityCameraRecord } from '../domain/security-camera.types';

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] ?? character);
}

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value + 'T00:00:00Z'));
}

function detail(label: string, value: string): string {
  return '<div class="camera-detail"><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(value) + '</dd></div>';
}

function statusOption(camera: SecurityCameraRecord, value: SecurityCameraRecord['status']): string {
  return '<option value="' + escapeHtml(value) + '"' + (camera.status === value ? ' selected' : '') + '>' + escapeHtml(value) + '</option>';
}

function buildOperationalEditor(camera: SecurityCameraRecord): string {
  return `
    <form class="camera-edit-form" data-camera-edit-form data-camera-id="${escapeHtml(camera.id)}">
      <h3>Actualizar información operativa</h3>
      <p class="camera-edit-scope">Marca, modelo, ubicación, tipo, instalación y coordenadas permanecen bloqueados.</p>
      <label>Estado operativo
        <select name="status" required>
          ${statusOption(camera, 'Operativa')}
          ${statusOption(camera, 'En mantenimiento')}
          ${statusOption(camera, 'Fuera de servicio')}
        </select>
      </label>
      <div class="camera-edit-dates">
        <label>Último mantenimiento
          <input name="lastMaintenanceOn" type="date" value="${escapeHtml(camera.lastMaintenanceOn)}" required />
        </label>
        <label>Próximo mantenimiento
          <input name="nextMaintenanceOn" type="date" value="${escapeHtml(camera.nextMaintenanceOn)}" required />
        </label>
      </div>
      <label>Área responsable
        <input name="responsibleArea" type="text" maxlength="100" value="${escapeHtml(camera.responsibleArea)}" required />
      </label>
      <label>Observaciones
        <textarea name="notes" maxlength="500" rows="4" required>${escapeHtml(camera.notes)}</textarea>
      </label>
      <button type="submit">Guardar cambios operativos</button>
      <p class="camera-edit-status" role="status" aria-live="polite"></p>
    </form>`;
}

function buildOperationalReadOnly(camera: SecurityCameraRecord): string {
  return `
    <dl class="camera-operational-readonly">
      ${detail('Estado operativo', camera.status)}
      ${detail('Último mantenimiento', formatDate(camera.lastMaintenanceOn))}
      ${detail('Próximo mantenimiento', formatDate(camera.nextMaintenanceOn))}
      ${detail('Área responsable', camera.responsibleArea)}
      ${detail('Observaciones', camera.notes)}
    </dl>`;
}

function buildCameraPanel(camera: SecurityCameraRecord, editable: boolean): string {
  return `
    <article class="camera-information" aria-labelledby="${escapeHtml(camera.id)}-title">
      <p class="camera-demo-label">Ficha simulada · Datos ficticios</p>
      <h2 id="${escapeHtml(camera.id)}-title">${escapeHtml(camera.name)}</h2>
      <p class="camera-status camera-status--${escapeHtml(camera.status.toLowerCase().replace(/\s+/g, '-'))}"><span aria-hidden="true"></span>${escapeHtml(camera.status)}</p>
      <dl>
        ${detail('Lugar', camera.location)}
        ${detail('Código del activo', camera.assetCode)}
        ${detail('Marca', camera.brand + ' (ficticia)')}
        ${detail('Modelo', camera.model)}
        ${detail('Tipo de cámara', camera.type)}
        ${detail('Cobertura prevista', camera.coverage)}
        ${detail('Modo de grabación', camera.recordingMode)}
        ${detail('Retención', camera.retention)}
        ${detail('Instalación', formatDate(camera.installedOn))}
      </dl>
      ${editable ? buildOperationalEditor(camera) : buildOperationalReadOnly(camera)}
    </article>`;
}

export interface SecurityCameraMarkerOptions {
  editable: boolean;
}

// Un marcador HTML permanece unido a yaw/pitch y el complemento lo oculta
// automáticamente al salir de los límites visibles de la cámara del usuario.
export function buildSecurityCameraMarker(
  camera: SecurityCameraRecord,
  options: SecurityCameraMarkerOptions = { editable: false },
): MarkerConfig {
  const safeName = escapeHtml(camera.name);
  return {
    id: camera.id,
    position: { yaw: camera.yaw + 'deg', pitch: camera.pitch + 'deg' },
    html: `
      <button class="security-camera-marker" type="button" aria-label="Abrir ficha de ${safeName}">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 7.5h2.2l1.1-2h9.4l1.1 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Zm8 2.1a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 1.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4Z" />
        </svg>
        <span>CCTV</span>
      </button>`,
    size: { width: 58, height: 58 },
    anchor: 'center center',
    className: 'security-camera-hotspot',
    tooltip: { content: safeName + ' · Ver ficha', position: 'bottom center' },
    content: buildCameraPanel(camera, options.editable),
    listContent: safeName,
    data: { cameraId: camera.id, panoramaId: camera.panoramaId },
  };
}
