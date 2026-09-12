import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      '.realtime/**',
      'out/**',
      'build/**',
      'coverage/**',
      'next-env.d.ts',
      '.data/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  ...compat.extends('prettier'),
  {
    rules: {
      // Existing rules
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      'react/no-unescaped-entities': 'error',
      'react/jsx-no-target-blank': 'error',

      // CLAUDE.md Coding Standards - Arrow Functions for ALL functions
      'react/function-component-definition': [
        'warn',
        {
          namedComponents: 'arrow-function',
          unnamedComponents: 'arrow-function',
        },
      ],
      'func-style': [
        'warn',
        'expression',
        {
          allowArrowFunctions: true,
        },
      ],

      // CLAUDE.md Coding Standards - TypeScript Rules
      'prefer-const': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: true,
        },
      ],
      // Note: interface vs type enforcement would need custom rule or different approach

      // CLAUDE.md Coding Standards - Export Style Rules
      'import/prefer-default-export': 'off',
      'react/jsx-no-useless-fragment': 'warn',
    },
  },
  {
    files: ['src/app/**/*.tsx', 'src/app/**/*.ts'],
    rules: {
      // Allow default exports only in app directory (Next.js pages)
      'import/no-default-export': 'off',
    },
  },
  {
    files: ['src/components/**/*.tsx', 'src/components/**/*.ts'],
    rules: {
      // Enforce named exports in components directory
      'import/no-default-export': 'warn',
    },
  },
];

export default eslintConfig;
