import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto', // Explicitly injects the service worker
      // I removed 'includeAssets' so it doesn't fail if you are missing a favicon
      manifest: {
        name: 'Monk Mode Learning',
        short_name: 'Monk Mode',
        description: 'Focus, learn, and master your vocabulary.',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png', // Must be exactly this name in the 'public' folder
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png', // Must be exactly this name in the 'public' folder
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
})
