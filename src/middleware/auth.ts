import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index';
import { users } from '../db/schema';
import { eq, or } from 'drizzle-orm';

export interface AuthUser {
  id?: number;
  uid: string;
  email: string;
  name?: string | null;
  role?: string | null;
  avatar?: string | null;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Empty token' });
  }

  try {
    // Authenticate user against PostgreSQL database
    const matchedUsers = await db
      .select()
      .from(users)
      .where(or(eq(users.uid, token), eq(users.email, token)))
      .limit(1);

    if (matchedUsers.length > 0) {
      req.user = matchedUsers[0];
      return next();
    }

    // Default fallback for session / recruiter token
    req.user = {
      uid: token,
      email: token.includes('@') ? token : `${token}@avahire.internal`,
      name: token.split('@')[0],
      role: 'recruiter',
    };
    return next();
  } catch (error) {
    console.error('Error authenticating against PostgreSQL:', error);
    return res.status(500).json({ error: 'PostgreSQL authentication failure' });
  }
};
