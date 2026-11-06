import { defineConfig } from 'drizzle-kit';

// Used only to generate SQL migrations from schema.ts.
// Migrations are applied in the browser when a church's database is opened.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
});
