import { startApi } from './api/index.js';
import { startBot } from './bot/index.js';
import './db/index.js'; // Initialize DB connection

const API_PORT = 3000;

async function main(): Promise<void> {
  console.log('[app] Starting Fox Deal...');

  // Start Express API
  startApi(API_PORT);

  // Start Telegram Bot
  try {
    await startBot();
  } catch (err) {
    console.error('[app] Failed to start bot:', (err as Error).message);
    console.error('[app] Bot requires a valid BOT_TOKEN in .env');
  }
}

main().catch((err) => {
  console.error('[app] Fatal error:', err);
  process.exit(1);
});
