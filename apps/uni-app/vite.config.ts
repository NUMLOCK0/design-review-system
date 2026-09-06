import { defineConfig } from 'vite';
import uni from '@dcloudio/uni-vite-plugin';

export default defineConfig({
  plugins: [uni()],
  server: {
    port: 5173
  }
});
