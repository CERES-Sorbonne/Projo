import { defineConfig } from 'astro/config'
import react from '@astrojs/react'

export default defineConfig({
  site: 'https://votre-user.github.io',
  base: '/',
  integrations: [react()],
  output: 'static',
})