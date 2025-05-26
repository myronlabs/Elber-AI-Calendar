/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load the root .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Get values from the root .env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  css: {
    preprocessorOptions: {
      scss: {
        // Explicitly use the modern Sass API to try and resolve deprecation warnings
        api: 'modern-compiler',
        // You could add other options like 'includePaths' or 'additionalData' here if needed
      },
    },
  },
  define: {
    // Explicitly define environment variables for the client
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
  },
  build: {
    sourcemap: false, // Disable source maps in production for smaller build
    chunkSizeWarningLimit: 500, // Lower limit to encourage better splitting
    rollupOptions: {
      output: {
        // Manual chunk split configuration for better caching
        manualChunks: {
          'vendor': ['react', 'react-dom', 'react-router-dom'],
          'supabase': ['@supabase/supabase-js'],
          'ui': ['react-toastify'],
          'utils': ['papaparse', 'uuid'],
        },
        // Ensure chunk filenames include content hash for better caching
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    // Compress assets for smaller bundle size
    assetsInlineLimit: 4096, // Inline smaller assets
    minify: 'esbuild', // Use esbuild for minification instead of terser
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
  // Vitest configuration
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'src/test-setup.ts',
        '**/*.d.ts',
        '**/*.config.*',
        'dist/',
        'coverage/',
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70
        }
      }
    },
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}', 'utils/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}', 'components/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}', 'pages/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.git', '.cache'],
  },
});