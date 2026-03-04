import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  out: './src/lib/db/generated',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:@localhost:5432/buildo',
  },
});
