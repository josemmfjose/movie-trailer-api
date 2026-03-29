import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
    resolve: {
      alias: {
        '#shared': resolve(__dirname, 'src/shared'),
        '#adapters': resolve(__dirname, 'src/adapters'),
        '#lib': resolve(__dirname, 'src/lib'),
        '#data': resolve(__dirname, 'src/data'),
        '#clients': resolve(__dirname, 'src/clients'),
        '#validators': resolve(__dirname, 'src/validators'),
        '#middleware': resolve(__dirname, 'src/middleware'),
      },
    },
    test: {
      globals: true,
      environment: 'node',
      include: ['__tests__/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts'],
        exclude: ['src/infra/**', 'src/handlers/**'],
      },
    },
  }
})
