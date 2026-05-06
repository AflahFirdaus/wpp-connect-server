module.exports = {
  apps: [
    {
      name: 'wppconnect-server',
      script: './dist/server.js', // Pastikan sudah di-build (npm run build)
      instances: 1, // Untuk wppconnect, gunakan 1 instance saja agar tidak ada konflik file token
      autorestart: true,
      watch: false,
      max_memory_restart: '1G', // Restart otomatis jika memori Node.js menyentuh 1 GB
      env: {
        NODE_ENV: 'production',
        DISPLAY: '',
      },
    },
  ],
};
