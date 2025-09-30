module.exports = {
  apps : [{
    name: 'FEDEVENT',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 5050
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5050
    }
  }]
};