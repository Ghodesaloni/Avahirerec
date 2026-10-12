import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const createMockChain = (resolvedValue: any = []): any => {
  const fn: any = () => fn;
  return new Proxy(fn, {
    get: (_, prop) => {
      if (prop === 'then') {
        return (resolve: any) => Promise.resolve(resolvedValue).then(resolve);
      }
      if (prop === 'catch') {
        return (reject: any) => Promise.resolve(resolvedValue).catch(reject);
      }
      return createMockChain(resolvedValue);
    },
    apply: () => createMockChain(resolvedValue),
  });
};

const mockNoOp = {
  findMany: async () => [],
  findFirst: async () => null,
  findUnique: async () => null,
  create: async (d: any) => d?.data ?? {},
  update: async (d: any) => d?.data ?? {},
  delete: async () => ({}),
};

const createMockDb = () => {
  return new Proxy({}, {
    get: (_, prop) => {
      if (prop === 'query') {
        return new Proxy({}, { get: () => mockNoOp });
      }
      return createMockChain([]);
    },
  });
};

let db: any;
if (!process.env.SQL_HOST && !process.env.DATABASE_URL) {
  console.warn('[AI Studio] Database credentials not set — using in-memory mock');
  db = createMockDb();
} else {
  try {
    const pool = createPool();
    db = drizzle(pool, { schema });
  } catch (err) {
    console.warn('[AI Studio] Database not connected — using mock', err);
    db = createMockDb();
  }
}

export { db };
