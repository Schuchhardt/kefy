import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Project-level rule overrides
  {
    rules: {
      // Calling fetch/data-load callbacks from useEffect is valid in this codebase
      'react-hooks/set-state-in-effect': 'off',
      // window.location.href navigation is intentional
      'react-hooks/immutability': 'off',
      // Ignore intentionally-unused _-prefixed identifiers
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  // La vista MCP Apps (mcp-app/) no es Next: corre en el iframe del host, sin
  // next/image ni optimizador de imágenes.
  {
    files: ['mcp-app/**'],
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Bundle de la vista MCP Apps (npm run build:mcp-app).
    "mcp-app/dist/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated coverage reports
    "coverage/**",
  ]),
]);

export default eslintConfig;
