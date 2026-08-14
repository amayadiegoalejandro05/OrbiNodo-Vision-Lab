import type { DemoAccount, DemoSession } from './demo-auth';
import { authenticateDemo, hasDemoAccounts } from './demo-auth';

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
  accounts: DemoAccount[],
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
    if (!hasDemoAccounts(accounts)) {
      message.textContent = 'Falta configurar el usuario o el hash en .env.local.';
      submit.disabled = false;
      return;
    }
    const session = await authenticateDemo(username.value, password.value, accounts);
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
