import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

// Test connection on startup
pool.query('SELECT NOW()')
  .then(() => console.log('[db] Connected to PostgreSQL'))
  .catch((err) => {
    console.error('[db] Failed to connect to PostgreSQL:', err.message);
    process.exit(1);
  });

export { pool as db };
