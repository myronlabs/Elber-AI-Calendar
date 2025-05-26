// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  // Ignores
  {
    ignores: ['dist/**', 'node_modules/**', '*.d.ts', 'eslint.config.js', 'vite.config.ts']
  },
  
  // Base configurations
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  
  // React configuration
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    ...pluginReact.configs.flat.recommended,
    plugins: {
      ...pluginReact.configs.flat.recommended.plugins,
      'react-hooks': pluginReactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    settings: {
      react: {
        version: 'detect'
      }
    },
    rules: {
      ...pluginReact.configs.flat.recommended.rules,
      ...pluginReactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    }
  },
  
  // TypeScript specific configuration
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      }
    },
    rules: {
      // Disable no-unused-vars in favor of the TypeScript-specific version
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { 
        'argsIgnorePattern': '^_',
        // For all enum values that are documented and reserved for API compatibility
        'varsIgnorePattern': '^(SearchMatchType)$',
        // Enum members are separately tracked but should be exempted when used in lookups
        'ignoreRestSiblings': true,
        'destructuredArrayIgnorePattern': '^_'
      }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'prefer-const': 'error',
      'no-console': 'off',
    }
  }
);