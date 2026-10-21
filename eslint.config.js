/**
 * Análisis estático (SAST ligero) del proyecto.
 *
 * Además de las reglas recomendadas de TypeScript, se activan las reglas de
 * eslint-plugin-security y prohibiciones explícitas de construcciones peligrosas:
 *  - dangerouslySetInnerHTML (XSS en React).
 *  - $queryRawUnsafe / $executeRawUnsafe (inyección SQL a través del ORM).
 *  - eval, new Function y setTimeout con cadenas (ejecución dinámica de código).
 */
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'backend/src/generated/**', '**/coverage/**', 'docs/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  security.configs.recommended,
  {
    files: ['backend/**/*.ts', 'scripts/**/*.mjs', 'backend/scripts/**/*.mjs', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['frontend/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Prohibido: riesgo de XSS. Renderiza el contenido como texto con React.',
        },
        {
          selector: "MemberExpression[property.name=/^\\$(queryRawUnsafe|executeRawUnsafe)$/]",
          message: 'Prohibido: riesgo de inyección SQL. Usa consultas del ORM o $queryRaw con plantilla etiquetada.',
        },
        {
          selector: "AssignmentExpression[left.property.name='innerHTML']",
          message: 'Prohibido: asignar innerHTML permite XSS (y viola Trusted Types).',
        },
      ],
      // Demasiados falsos positivos con TypeScript estricto (accesos indexados tipados).
      'security/detect-object-injection': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
