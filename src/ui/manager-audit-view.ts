import type { DemoRole } from '../auth/demo-auth';
import type {
  AccessAuditEntry as AccessHistoryEntry,
  AuditHistory,
  CameraChangeAuditEntry as CameraChangeHistoryEntry,
} from '../domain/audit.types';

export interface ManagerAuditViewApi {
  element: HTMLElement;
  setAvailable: (available: boolean) => void;
  destroy: () => void;
}

export interface ProfileTab {
  role: DemoRole;
  label: string;
}

const DEFAULT_PROFILE_TABS: ProfileTab[] = [
  { role: 'programmer', label: 'Orbinodo' },
  { role: 'manager', label: 'Jefe' },
  { role: 'engineer1', label: 'Ingeniero 1' },
  { role: 'engineer2', label: 'Ingeniero 2' },
];
const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

function createEmpty(message: string): HTMLElement {
  const paragraph = document.createElement('p');
  paragraph.className = 'audit-empty';
  paragraph.textContent = message;
  return paragraph;
}

function formatDuration(entry: AccessHistoryEntry): string {
  if (entry.durationSeconds === undefined || !entry.logoutAt) return 'Sin cierre registrado';
  if (entry.durationSeconds < 60) return 'Menos de 1 minuto';
  const hours = Math.floor(entry.durationSeconds / 3600);
  const minutes = Math.floor((entry.durationSeconds % 3600) / 60);
  if (hours === 0) return minutes + (minutes === 1 ? ' minuto' : ' minutos');
  return hours + (hours === 1 ? ' hora ' : ' horas ') + minutes + (minutes === 1 ? ' minuto' : ' minutos');
}

function formatSessionStatus(entry: AccessHistoryEntry): string {
  const labels = {
    active: 'Activa', logged_out: 'Cerrada', expired: 'Expirada', revoked: 'Revocada',
  } as const;
  return labels[entry.status];
}

function createAccessEntry(entry: AccessHistoryEntry): HTMLElement {
  const article = document.createElement('article');
  article.className = 'audit-entry audit-access-entry';
  const heading = document.createElement('h4');
  heading.textContent = entry.displayName + ' ingresó al software';
  const detail = document.createElement('p');
  detail.textContent = dateFormatter.format(new Date(entry.timestamp)) + ' · Usuario: ' + entry.username;
  const duration = document.createElement('p');
  duration.className = 'audit-duration';
  duration.textContent = 'Duración: ' + formatDuration(entry);
  const status = document.createElement('p');
  status.textContent = 'Estado: ' + formatSessionStatus(entry);
  article.append(heading, detail, status, duration);
  return article;
}

function createChangeEntry(entry: CameraChangeHistoryEntry): HTMLElement {
  const article = document.createElement('article');
  article.className = 'audit-entry audit-change-entry';
  const heading = document.createElement('h4');
  heading.textContent = entry.actorName + ' modificó ' + entry.cameraName;
  const meta = document.createElement('p');
  meta.textContent = dateFormatter.format(new Date(entry.timestamp)) + ' · ' + entry.assetCode;
  const list = document.createElement('ul');
  for (const change of entry.changes) {
    const item = document.createElement('li');
    item.textContent = change.label + ': “' + change.before + '” → “' + change.after + '”';
    list.append(item);
  }
  article.append(heading, meta, list);
  return article;
}

export function createManagerAuditView(
  parent: HTMLElement,
  loadAudit: () => Promise<AuditHistory>,
  profileTabs: ProfileTab[] = DEFAULT_PROFILE_TABS,
): ManagerAuditViewApi {
  const section = document.createElement('section');
  section.className = 'manager-audit-tools';
  section.hidden = true;
  section.innerHTML = '<button type="button" class="open-audit-button">Control del jefe</button>';
  parent.append(section);

  const dialog = document.createElement('dialog');
  dialog.className = 'audit-dialog';
  dialog.innerHTML = `
    <div class="audit-dialog-heading">
      <div>
        <p class="audit-eyebrow">Auditoría central de PostgreSQL</p>
        <h2 id="audit-dialog-title">Historial por perfil</h2>
      </div>
      <button type="button" class="audit-close" aria-label="Cerrar historial">×</button>
    </div>
    <div class="audit-dialog-content">
      <section class="latest-access-summary" aria-labelledby="latest-access-title"></section>
      <div class="audit-tabs" role="tablist" aria-label="Perfiles auditados"></div>
      <section class="audit-profile-panel" role="tabpanel" tabindex="0"></section>
    </div>`;
  document.body.append(dialog);

  const summary = dialog.querySelector<HTMLElement>('.latest-access-summary')!;
  const tabList = dialog.querySelector<HTMLElement>('.audit-tabs')!;
  const panel = dialog.querySelector<HTMLElement>('.audit-profile-panel')!;
  let activeRole: DemoRole = 'engineer2';

  function renderSummary(accessHistory: AccessHistoryEntry[]): void {
    summary.replaceChildren();
    const title = document.createElement('h3');
    title.id = 'latest-access-title';
    title.textContent = 'Último ingreso registrado';
    const latest = accessHistory.find((entry) => entry.role !== 'manager');
    if (!latest) {
      summary.append(title, createEmpty('Todavía no hay ingresos de perfiles distintos del Jefe.'));
      return;
    }
    const name = document.createElement('strong');
    name.textContent = latest.displayName;
    const detail = document.createElement('p');
    detail.textContent = dateFormatter.format(new Date(latest.timestamp)) + ' · Duración: ' + formatDuration(latest);
    summary.append(title, name, detail);
  }

  function renderProfile(
    role: DemoRole,
    accessHistory: AccessHistoryEntry[],
    changeHistory: CameraChangeHistoryEntry[],
  ): void {
    activeRole = role;
    for (const button of tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]')) {
      const selected = button.dataset.role === role;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    panel.replaceChildren();
    panel.setAttribute('aria-labelledby', 'audit-tab-' + role);
    const profile = profileTabs.find((item) => item.role === role)!;
    const heading = document.createElement('h3');
    heading.textContent = 'Actividad de ' + profile.label;

    const accessHeading = document.createElement('h4');
    accessHeading.className = 'audit-section-title';
    accessHeading.textContent = 'Sesiones de acceso';
    const accesses = accessHistory.filter((entry) => entry.role === role);
    const accessList = document.createElement('div');
    accessList.className = 'audit-entry-list';
    if (accesses.length === 0) accessList.append(createEmpty('No hay accesos registrados para este perfil.'));
    else accesses.forEach((entry) => accessList.append(createAccessEntry(entry)));

    const changesHeading = document.createElement('h4');
    changesHeading.className = 'audit-section-title';
    changesHeading.textContent = 'Cambios realizados';
    const changes = changeHistory.filter((entry) => entry.actorRole === role);
    const changeList = document.createElement('div');
    changeList.className = 'audit-entry-list';
    if (changes.length === 0) changeList.append(createEmpty('Este perfil no tiene cambios operativos registrados.'));
    else changes.forEach((entry) => changeList.append(createChangeEntry(entry)));

    panel.append(heading, accessHeading, accessList, changesHeading, changeList);
  }

  async function renderHistory(): Promise<void> {
    summary.replaceChildren(createEmpty('Consultando PostgreSQL…'));
    tabList.replaceChildren();
    panel.replaceChildren();
    const { accessHistory, changeHistory } = await loadAudit();
    renderSummary(accessHistory);
    tabList.replaceChildren();
    const latestNonManager = accessHistory.find((entry) => entry.role !== 'manager');
    activeRole = latestNonManager?.role ?? 'engineer1';
    for (const profile of profileTabs) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = 'audit-tab-' + profile.role;
      button.dataset.role = profile.role;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', 'audit-profile-panel');
      button.textContent = profile.label;
      button.addEventListener('click', () => renderProfile(profile.role, accessHistory, changeHistory));
      tabList.append(button);
    }
    panel.id = 'audit-profile-panel';
    renderProfile(activeRole, accessHistory, changeHistory);
  }

  section.querySelector('.open-audit-button')?.addEventListener('click', async () => {
    dialog.showModal();
    try {
      await renderHistory();
    } catch (error) {
      summary.replaceChildren(createEmpty(
        error instanceof Error ? error.message : 'No fue posible cargar la auditoría.',
      ));
      tabList.replaceChildren();
      panel.replaceChildren();
    }
  });
  dialog.querySelector('.audit-close')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

  return {
    element: section,
    setAvailable: (available) => {
      section.hidden = !available;
      if (!available && dialog.open) dialog.close();
    },
    destroy: () => { section.remove(); dialog.remove(); },
  };
}
