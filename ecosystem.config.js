module.exports = {
  apps: [
    {
      name: 'qualitas-backend',
      cwd: './backend',
      script: 'python3',
      args: '-m uvicorn main:app --host 0.0.0.0 --port 8000',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 2000,
      env: {
        PYTHONUNBUFFERED: '1'
      }
    },
    {
      name: 'qualitas-frontend',
      cwd: './react-app',
      script: 'npx',
      args: 'vite --port 5173',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 2000
    }
  ]
};
