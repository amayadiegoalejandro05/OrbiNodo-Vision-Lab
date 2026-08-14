/* Lee la contraseña sin ponerla en el comando ni en el historial del terminal. */
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const variablesByProfile = {
  programador: 'VITE_DEMO_PASSWORD_SHA256',
  jefe: 'VITE_DEMO_MANAGER_PASSWORD_SHA256',
  ingeniero1: 'VITE_DEMO_ENGINEER_1_PASSWORD_SHA256',
  ingeniero2: 'VITE_DEMO_ENGINEER_2_PASSWORD_SHA256',
};

const terminal = createInterface({ input: stdin, output: stdout });
const requestedProfile = (await terminal.question('Perfil (programador/jefe/ingeniero1/ingeniero2): ')).trim().toLowerCase().replace(/\s+/g, '');
const password = await terminal.question('Escribe la contraseña de la demo: ');
terminal.close();
const variable = variablesByProfile[requestedProfile];

if (!variable) {
  console.error('Escribe programador, jefe, ingeniero1 o ingeniero2.');
  process.exitCode = 1;
} else if (password.length < 8) {
  console.error('Usa al menos 8 caracteres.');
  process.exitCode = 1;
} else {
  console.log('\n' + variable + '=' + createHash('sha256').update(password).digest('hex'));
}
