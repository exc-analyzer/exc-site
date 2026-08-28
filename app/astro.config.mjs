import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Uygulama, mevcut tanitim sitesinin altinda /app yolunda yayinlanir.
// Cikti dogrudan Firebase'in deploy ettigi public/app klasorune yazilir.
export default defineConfig({
  base: '/app',
  outDir: '../public/app',
  // Gelistirici arac cubugu (sag alttaki yuzen menu) kapali.
  devToolbar: { enabled: false },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
