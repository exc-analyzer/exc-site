import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Uygulama, mevcut tanıtım sitesinin altında /app yolunda yayınlanır.
// Çıktı doğrudan Firebase'in deploy ettiği public/app klasörüne yazılır.
export default defineConfig({
  base: '/app',
  outDir: '../public/app',
  // Geliştirici araç çubuğu (sağ alttaki yüzen menü) kapalı.
  devToolbar: { enabled: false },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
