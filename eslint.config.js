// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Deno edge functions are linted by `deno lint` in CI; the secret file is generated.
    ignores: ['dist/*', 'supabase/functions/**/index.ts', 'supabase/functions/_shared/*.ts', 'src/core/crypto/secret.generated.ts'],
  },
  {
    rules: {
      'no-console': 'warn',
      'import/no-cycle': 'error',
    },
  },
]);
