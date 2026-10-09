// PM2 process file — keeps Forgenite (and its automation scheduler) running 24/7.
//   npm run build && pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
module.exports = {
  apps: [
    {
      name: "forgenite",
      script: "node_modules/next/dist/bin/next",
      args: "start -p " + (process.env.PORT || 3000),
      cwd: __dirname,
      instances: 1, // the in-process scheduler must run in exactly ONE instance
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 50,
      restart_delay: 3000,
      max_memory_restart: "800M",
      env: { NODE_ENV: "production" },
      out_file: "./data/logs/out.log",
      error_file: "./data/logs/error.log",
      time: true,
    },
  ],
};
