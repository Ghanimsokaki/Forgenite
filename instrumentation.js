// Boots the 24/7 automation scheduler when the Node.js server starts
// (`npm start`, pm2, Docker, Railway, Render, Fly…).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/server/automations.js");
    startScheduler();
  }
}
