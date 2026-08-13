/**
 * Applies supabase/schema.sql when DATABASE_URL is set.
 * Get connection string from: Supabase Dashboard → Project Settings → Database → Connection string (URI)
 *
 * Usage: DATABASE_URL="postgresql://..." node scripts/setup-supabase-schema.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Missing DATABASE_URL.');
  console.error('Add your Supabase Postgres URI to .env, then run:');
  console.error('  npm run db:setup');
  console.error('');
  console.error('Or paste supabase/schema.sql into Supabase Dashboard → SQL Editor → Run.');
  process.exit(1);
}

const sql = readFileSync(join(__dirname, '../supabase/schema.sql'), 'utf8');

try {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('Connected to Supabase Postgres. Applying schema...');
  await client.query(sql);
  await client.end();
  console.log('Schema applied successfully.');
} catch (err) {
  console.error('Schema setup failed:', err.message);
  console.error('Fallback: run supabase/schema.sql manually in the Supabase SQL Editor.');
  process.exit(1);
}
