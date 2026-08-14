// Importa reglas generales y el adaptador de TypeScript.
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

// Combina reglas recomendadas y omite código externo o generado.
export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      // Obliga a distinguir imports ejecutables de imports usados como tipos.
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
