module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  settings: {
    'import/resolver': {
      typescript: {},
    },
  },
  rules: {
    // Kunci boundary modular monolith: satu modul TIDAK BOLEH import
    // langsung dari internal/ modul lain — cuma boleh lewat index.ts-nya.
    'import/no-restricted-paths': [
      'error',
      {
        zones: [
          {
            target: './src/modules/sales-inventory/**/*',
            from: './src/modules/ecommerce-sync/internal',
          },
          {
            target: './src/modules/sales-inventory/**/*',
            from: './src/modules/auth-product/internal',
          },
          {
            target: './src/modules/ecommerce-sync/**/*',
            from: './src/modules/sales-inventory/internal',
          },
          {
            target: './src/modules/ecommerce-sync/**/*',
            from: './src/modules/auth-product/internal',
          },
          {
            target: './src/modules/auth-product/**/*',
            from: './src/modules/sales-inventory/internal',
          },
          {
            target: './src/modules/auth-product/**/*',
            from: './src/modules/ecommerce-sync/internal',
          },
        ],
      },
    ],
  },
};
