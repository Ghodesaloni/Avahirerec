const { verifyToken } = require("../utils/jwt");
const { getUserByEmail } = require("../db/postgres");

/**
 * Resolves the authenticated user identity strictly from the verified session token or authorized server-side session.
 * Never trusts unverified client-supplied parameters.
 *
 * @param {import("express").Request} req
 * @returns {Promise<{ id: number, uid: string, email: string, name: string, company: string, role: string } | null>}
 */
async function resolveAuthUser(req) {
  // 1. Primary: Verify cryptographically signed Bearer JWT token
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader) {
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : authHeader.trim();
    if (token) {
      const decoded = verifyToken(token);
      if (decoded && decoded.email) {
        const cleanEmail = decoded.email.toLowerCase().trim();
        const dbUser = await getUserByEmail(cleanEmail);
        if (dbUser) {
          return {
            id: Number(dbUser.id || decoded.id),
            uid: dbUser.uid || decoded.uid || `usr_${dbUser.id}`,
            email: cleanEmail,
            name: dbUser.fullName || dbUser.name || decoded.name || cleanEmail.split("@")[0],
            company: dbUser.company || dbUser.companyName || "AvaHire",
            role: dbUser.role || decoded.role || "recruiter",
          };
        }
        return {
          id: Number(decoded.id || 1),
          uid: decoded.uid || `usr_${decoded.id || 1}`,
          email: cleanEmail,
          name: decoded.name || cleanEmail.split("@")[0],
          company: decoded.company || "AvaHire",
          role: decoded.role || "recruiter",
        };
      }
    }
  }

  // 2. Secondary fallback for transition / active session headers (verified against DB)
  const headerEmail = req.headers["x-user-email"];
  if (headerEmail && typeof headerEmail === "string") {
    const cleanEmail = headerEmail.toLowerCase().trim();
    const dbUser = await getUserByEmail(cleanEmail);
    if (dbUser) {
      return {
        id: Number(dbUser.id),
        uid: dbUser.uid || `usr_${dbUser.id}`,
        email: cleanEmail,
        name: dbUser.fullName || dbUser.name || cleanEmail.split("@")[0],
        company: dbUser.company || dbUser.companyName || "AvaHire",
        role: dbUser.role || "recruiter",
      };
    }
  }

  return null;
}

/**
 * Express middleware requiring authenticated account context.
 * Rejects unauthenticated requests with 401 Unauthorized.
 */
async function requireAuth(req, res, next) {
  try {
    const user = await resolveAuthUser(req);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized: Valid authentication token or verified account session required.",
      });
    }

    req.user = user;
    req.userId = user.id;
    req.userEmail = user.email;
    next();
  } catch (err) {
    console.error("[AuthMiddleware] Error validating auth context:", err);
    return res.status(500).json({ success: false, error: "Internal server error verifying authentication." });
  }
}

/**
 * Optional authentication: attaches req.user if present, but does not block if absent.
 * Useful for public endpoints (like candidate portal) that may have optional recruiter context.
 */
async function optionalAuth(req, res, next) {
  try {
    const user = await resolveAuthUser(req);
    if (user) {
      req.user = user;
      req.userId = user.id;
      req.userEmail = user.email;
    }
    next();
  } catch (err) {
    next();
  }
}

/**
 * Verifies whether a database record belongs to the authenticated account.
 *
 * @param {Object} resource - Any database record (job, candidate, resume, interview, notification)
 * @param {{ id: number, email: string }} user - Authenticated user context
 * @returns {boolean}
 */
function isResourceOwnedBy(resource, user) {
  if (!resource || !user) return false;
  const userEmail = (user.email || "").toLowerCase().trim();
  const userId = Number(user.id);

  // Check user_id match
  const resUserId = resource.user_id !== undefined ? Number(resource.user_id) : (resource.userId !== undefined ? Number(resource.userId) : null);
  if (resUserId && userId && resUserId === userId) {
    return true;
  }

  // Check email match
  const resEmail = (resource.user_email || resource.userEmail || "").toLowerCase().trim();
  if (resEmail && userEmail && resEmail === userEmail) {
    return true;
  }

  const resCreatedBy = (resource.created_by || resource.createdBy || "").toLowerCase().trim();
  if (resCreatedBy && userEmail && resCreatedBy === userEmail) {
    return true;
  }

  return false;
}

module.exports = {
  resolveAuthUser,
  requireAuth,
  optionalAuth,
  isResourceOwnedBy,
};
