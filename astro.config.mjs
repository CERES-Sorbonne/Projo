import { defineConfig } from 'astro/config'
import react from '@astrojs/react'

export default defineConfig({
  site: 'https://ceres.sorbonne-universite.fr',
  base: '/Projo',
  integrations: [react()],
  output: 'static',
})