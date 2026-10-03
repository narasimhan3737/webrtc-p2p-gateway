import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    // Allow ngrok (and similar) tunnels; hostnames change per session.
    allowedHosts: ['.ngrok-free.app', '.ngrok.app'],
  },
});
