import type { DemoSession } from './demo-auth';
import { authenticateWithApi } from './demo-auth';

export interface LoginViewApi {
  show: () => void;
  hide: () => void;
}

function requiredInside<T extends HTMLElement>(container: HTMLElement, selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error('La pantalla de acceso no contiene ' + selector);
  return element;
}

export function createLoginView(
  container: HTMLElement,
  onAuthenticated: (session: DemoSession) => void,
): LoginViewApi {
  const form = requiredInside<HTMLFormElement>(container, '#login-form');
  const username = requiredInside<HTMLInputElement>(container, '#demo-username');
  const password = requiredInside<HTMLInputElement>(container, '#demo-password');
  const message = requiredInside<HTMLParagraphElement>(container, '#login-message');
  const submit = requiredInside<HTMLButtonElement>(container, 'button[type="submit"]');

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    submit.disabled = true;
    message.textContent = 'Verificando acceso...';
    let session: DemoSession | null;
    try {
      session = await authenticateWithApi(username.value, password.value);
    } catch {
      message.textContent = 'No fue posible conectar con la API local.';
      submit.disabled = false;
      return;
    }
    password.value = '';
    submit.disabled = false;
    if (!session) {
      message.textContent = 'Usuario o contraseña incorrectos.';
      password.focus();
      return;
    }
    message.textContent = '';
    onAuthenticated(session);
  }

  form.addEventListener('submit', handleSubmit);
  return {
    show: () => { container.hidden = false; username.focus(); },
    hide: () => { container.hidden = true; },
  };
}
