// The rules of the linter for the scripts. Run it in the folder tools/lint:  npm ci --ignore-scripts  and then  npm run lint
// The linter reads JavaScript only. The check, node scripts/check.mjs, reads the HTML, the CSS and the text.
// The packages of the linter are in tools/lint, so this folder itself has no package.
import js from './tools/lint/node_modules/@eslint/js/src/index.js';

const node = { process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly', fetch: 'readonly', WebSocket: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly' };
const browser = { window: 'readonly', document: 'readonly', location: 'readonly', fetch: 'readonly', URL: 'readonly', console: 'readonly', globalThis: 'readonly' };

export default [
  { ignores: ['dist/**', '**/node_modules/**', 'third-party/**'] },
  js.configs.recommended,
  {
    rules: {
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  { files: ['**/*.mjs'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: node } },
  // the scripts that a page loads run in a browser, as plain scripts
  { files: ['plugins/**/assets/**/*.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: browser } },
  // the demo of the data script uses the one name that the data script gives to a page
  { files: ['plugins/data/assets/data-demo.js'], languageOptions: { globals: { ordData: 'readonly' } } },
];
