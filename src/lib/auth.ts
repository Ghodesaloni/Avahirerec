import { db } from '../db/index';
import { users } from '../db/schema';
import { eq, or } from 'drizzle-orm';

/**
 * PostgreSQL Authentication & User Management Helper
 * Replaces Firebase Auth client and admin SDKs
 */
export async function getPostgresUser(identifier: string) {
  try {
    const res = await db
      .select()
      .from(users)
      .where(or(eq(users.uid, identifier), eq(users.email, identifier)))
      .limit(1);
    return res[0] || null;
  } catch (err) {
    console.error('Failed to query PostgreSQL user:', err);
    return null;
  }
}

export async function upsertPostgresUser(userData: {
  uid: string;
  email: string;
  name?: string;
  avatar?: string;
  role?: string;
}) {
  try {
    const existing = await getPostgresUser(userData.uid);
    if (existing) {
      const updated = await db
        .update(users)
        .set({
          email: userData.email,
          name: userData.name || existing.name,
          avatar: userData.avatar || existing.avatar,
          role: userData.role || existing.role,
        })
        .where(eq(users.uid, userData.uid))
        .returning();
      return updated[0];
    } else {
      const inserted = await db
        .insert(users)
        .values({
          uid: userData.uid,
          email: userData.email,
          name: userData.name,
          avatar: userData.avatar,
          role: userData.role || 'recruiter',
        })
        .returning();
      return inserted[0];
    }
  } catch (err) {
    console.error('Failed to upsert PostgreSQL user:', err);
    throw err;
  }
}
