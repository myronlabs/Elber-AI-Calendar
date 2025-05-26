// @ts-check
import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import json from "@eslint/json";
import markdown from "@eslint/markdown";

export default tseslint.config(
  // Global ignores - should be one of the first entries
  { 
    ignores: [
      "node_modules/",
      "dist/",
      "src/frontend/dist/",
      "src/backend/dist/", 
      "build/",
      ".netlify/",
      "netlify/",
      "supabase/.temp/",
      "src/frontend/dist/assets/**",
      "supabase/functions/**/index.ts",
      "supabase/functions/_shared/**",
      "*.config.js",
      "*.config.mjs",
      "eslint.config.mjs",
      ".eslintrc.cjs",
      "vite.config.ts",
      "postcss.config.js"
    ]
  },
  
  // Base ESLint recommended rules
  eslint.configs.recommended,
  
  // TypeScript ESLint recommended rules for all TS files
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ["src/frontend/**/*.{ts,tsx,mts,cts}", "src/backend/**/*.{ts,tsx,mts,cts}", "test-find-duplicates.ts"],
  })),
  
  // Global configuration for all files
  {
    files: ["src/frontend/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}", "src/backend/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },
  
  // React plugin configuration for frontend files
  {
    files: ["src/frontend/**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    ...pluginReact.configs.flat.recommended,
    plugins: {
      ...pluginReact.configs.flat.recommended.plugins,
      'react-hooks': pluginReactHooks,
    },
    rules: {
      ...pluginReact.configs.flat.recommended.rules,
      ...pluginReactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off", // Not needed in React 17+
      "react/prop-types": "off", // Disable prop-types since we use TypeScript
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  
  // JSON configuration
  {
    files: ["src/**/*.json"],
    ...json.configs.recommended
  },
  
  // Markdown configuration
  {
    files: ["src/**/*.md"],
    ...markdown.configs.recommended
  },
  
  // Configuration for Deno/Supabase functions
  {
    files: ["supabase/functions/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        Deno: "readonly",
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "no-undef": "off", 
    }
  },
  
  // Custom rules for TypeScript files
  {
    files: ["src/frontend/**/*.{ts,tsx,mts,cts}", "src/backend/**/*.{ts,tsx,mts,cts}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error", 
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_",
          "ignoreRestSiblings": true
        }
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "prefer-const": "error",
      "no-console": "off", // Allow console for development
    }
  },
  
  // Frontend-specific overrides
  {
    files: ["src/frontend/**/*.{ts,tsx}"],
    rules: {
      // Allow specific unused vars pattern for frontend
      "@typescript-eslint/no-unused-vars": [
        "warn", 
        { 
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^(SearchMatchType)$",
          "ignoreRestSiblings": true,
          "destructuredArrayIgnorePattern": "^_"
        }
      ]
    }
  },
  
  // Backend-specific overrides
  {
    files: ["src/backend/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/no-non-null-assertion": "error",
    }
  }
);