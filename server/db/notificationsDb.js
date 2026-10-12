const { readData, writeData } = require("./dbEngine");
const { getPool } = require("./postgres");

const COLLECTION = "notifications";

function matchesUser(item, userRef) {
  if (!userRef) return false;
  const targetId = typeof userRef === "object" ? userRef.id : null;
  const targetEmail = (typeof userRef === "object" ? (userRef.email || "") : String(userRef)).toLowerCase().trim();

  const itemUserId = item.user_id !== undefined ? Number(item.user_id) : (item.userId !== undefined ? Number(item.userId) : null);
  if (targetId && itemUserId && itemUserId === Number(targetId)) return true;

  if (targetEmail) {
    const userEmail = (item.userEmail || item.user_email || "").toLowerCase().trim();
    return userEmail === targetEmail;
  }
  return false;
}

function formatRelativeTime(dateInput) {
  if (!dateInput) return "Just now";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "Recently";
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

class NotificationsDatabase {
  _mapRow(row) {
    if (!row) return null;
    const msg = row.message || "";
    return {
      id: row.id,
      userId: row.user_id,
      user_id: row.user_id,
      userEmail: row.user_email,
      title: row.title,
      desc: msg,
      message: msg,
      type: row.type || "general",
      category: row.category || "General",
      eventKey: row.event_key,
      link: row.link || null,
      unread: Boolean(row.unread),
      icon: row.icon || "Bell",
      iconBg: row.icon_bg || "bg-violet-50 text-violet-600",
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata || {}),
      time: formatRelativeTime(row.created_at),
      timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async getAll(filters = {}) {
    const limit = Number(filters.limit || 50);
    const targetEmail = (filters.userEmail || "").toLowerCase().trim();
    const targetUserId = filters.userId ? Number(filters.userId) : null;

    // 1. Try PostgreSQL primary store
    try {
      const pool = getPool();
      if (pool) {
        const conditions = [];
        const params = [];

        if (targetUserId && targetEmail) {
          params.push(targetUserId);
          const p1 = params.length;
          params.push(targetEmail);
          const p2 = params.length;
          conditions.push(`(user_id = $${p1} OR LOWER(user_email) = $${p2})`);
        } else if (targetUserId) {
          params.push(targetUserId);
          conditions.push(`user_id = $${params.length}`);
        } else if (targetEmail) {
          params.push(targetEmail);
          conditions.push(`LOWER(user_email) = $${params.length}`);
        }

        if (filters.type && filters.type !== "all") {
          params.push(filters.type.toLowerCase());
          conditions.push(`LOWER(type) = $${params.length}`);
        }

        if (filters.unread === true || filters.unread === "true") {
          conditions.push(`unread = TRUE`);
        }

        const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        params.push(limit);
        const query = `
          SELECT * FROM public.notifications
          ${whereSql}
          ORDER BY created_at DESC
          LIMIT $${params.length}
        `;

        const res = await pool.query(query, params);
        if (res.rows && res.rows.length > 0) {
          return res.rows.map(r => this._mapRow(r));
        }
      }
    } catch (err) {
      console.warn("NotificationsDb.getAll postgres fallback:", err.message);
    }

    // 2. Fallback to local mirror engine
    let notifs = readData(COLLECTION, []);
    if (targetUserId || targetEmail) {
      notifs = notifs.filter(n => matchesUser(n, { id: targetUserId, email: targetEmail }));
    }
    if (filters.type && filters.type !== "all") {
      notifs = notifs.filter(n => (n.type || "").toLowerCase() === filters.type.toLowerCase());
    }
    if (filters.unread === true || filters.unread === "true") {
      notifs = notifs.filter(n => n.unread);
    }

    notifs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return notifs.slice(0, limit).map(n => ({
      ...n,
      desc: n.message || n.desc,
      time: formatRelativeTime(n.createdAt)
    }));
  }

  async getUnreadCount(userRef = "") {
    const targetUserId = typeof userRef === "object" ? userRef.id : null;
    const targetEmail = (typeof userRef === "object" ? (userRef.email || "") : String(userRef)).toLowerCase().trim();

    try {
      const pool = getPool();
      if (pool) {
        let query = "SELECT COUNT(*) as count FROM public.notifications WHERE unread = TRUE";
        const params = [];
        if (targetUserId && targetEmail) {
          params.push(targetUserId);
          params.push(targetEmail);
          query += " AND (user_id = $1 OR LOWER(user_email) = $2)";
        } else if (targetUserId) {
          params.push(targetUserId);
          query += " AND user_id = $1";
        } else if (targetEmail) {
          params.push(targetEmail);
          query += " AND LOWER(user_email) = $1";
        }

        const res = await pool.query(query, params);
        if (res.rows && res.rows[0]) {
          return parseInt(res.rows[0].count, 10) || 0;
        }
      }
    } catch (err) {
      console.warn("NotificationsDb.getUnreadCount postgres fallback:", err.message);
    }

    const notifs = readData(COLLECTION, []);
    return notifs.filter(n => matchesUser(n, { id: targetUserId, email: targetEmail }) && n.unread).length;
  }

  async create(data = {}) {
    const userEmail = (data.userEmail || data.user_email || "").toLowerCase().trim();
    const userId = data.userId !== undefined ? Number(data.userId) : (data.user_id !== undefined ? Number(data.user_id) : null);
    if (!userEmail && !userId) {
      throw new Error("Recipient user identity is required for notification");
    }

    const id = data.id || `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const title = data.title || "Notification";
    const message = data.message || data.desc || "";
    const type = (data.type || "general").toLowerCase();
    const category = data.category || "General";
    const eventKey = data.eventKey || data.event_key || null;
    const link = data.link || null;
    const icon = data.icon || "Bell";
    const iconBg = data.iconBg || data.icon_bg || "bg-violet-50 text-violet-600";
    const metadata = data.metadata || {};
    const unread = data.unread !== undefined ? Boolean(data.unread) : true;
    const now = new Date().toISOString();

    // Deduplication check: if eventKey provided, verify if already present
    if (eventKey) {
      try {
        const pool = getPool();
        if (pool) {
          const dupRes = await pool.query(
            "SELECT * FROM public.notifications WHERE (user_id = $1 OR LOWER(user_email) = $2) AND event_key = $3 LIMIT 1",
            [userId, userEmail, eventKey]
          );
          if (dupRes.rows && dupRes.rows.length > 0) {
            return this._mapRow(dupRes.rows[0]);
          }
        }
      } catch (e) {}

      const localNotifs = readData(COLLECTION, []);
      const dupLocal = localNotifs.find(n => matchesUser(n, { id: userId, email: userEmail }) && (n.eventKey === eventKey || n.event_key === eventKey));
      if (dupLocal) {
        return {
          ...dupLocal,
          desc: dupLocal.message || dupLocal.desc,
          time: formatRelativeTime(dupLocal.createdAt)
        };
      }
    }

    const notifObj = {
      id,
      userId,
      user_id: userId,
      user_email: userEmail,
      userEmail,
      title,
      message,
      desc: message,
      type,
      category,
      event_key: eventKey,
      eventKey,
      link,
      unread,
      icon,
      icon_bg: iconBg,
      iconBg,
      metadata,
      created_at: now,
      createdAt: now,
      updated_at: now,
      updatedAt: now
    };

    // 1. Mirror locally
    const localNotifs = readData(COLLECTION, []);
    localNotifs.unshift(notifObj);
    writeData(COLLECTION, localNotifs);

    // 2. Persist to PostgreSQL
    try {
      const pool = getPool();
      if (pool) {
        await pool.query(`
          INSERT INTO public.notifications (
            id, user_email, title, message, type, category, event_key,
            link, unread, icon, icon_bg, metadata, user_id, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            message = EXCLUDED.message,
            unread = EXCLUDED.unread,
            user_id = COALESCE(EXCLUDED.user_id, public.notifications.user_id),
            updated_at = NOW();
        `, [
          id, userEmail, title, message, type, category, eventKey,
          link, unread, icon, iconBg, JSON.stringify(metadata), userId
        ]);
      }
    } catch (err) {
      console.warn("NotificationsDb.create postgres insert error:", err.message);
    }

    return {
      ...notifObj,
      time: "Just now"
    };
  }

  async markAsRead(id, userRef = "") {
    const cleanId = String(id).trim();
    const targetUserId = typeof userRef === "object" ? userRef.id : null;
    const targetEmail = (typeof userRef === "object" ? (userRef.email || "") : String(userRef)).toLowerCase().trim();

    let updated = null;
    let pgUpdated = false;

    // 1. Update PostgreSQL
    try {
      const pool = getPool();
      if (pool) {
        let res;
        if (targetUserId && targetEmail) {
          res = await pool.query(
            "UPDATE public.notifications SET unread = FALSE, updated_at = NOW() WHERE id = $1 AND (user_id = $2 OR LOWER(user_email) = $3) RETURNING *",
            [cleanId, targetUserId, targetEmail]
          );
        } else if (targetUserId) {
          res = await pool.query(
            "UPDATE public.notifications SET unread = FALSE, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *",
            [cleanId, targetUserId]
          );
        } else if (targetEmail) {
          res = await pool.query(
            "UPDATE public.notifications SET unread = FALSE, updated_at = NOW() WHERE id = $1 AND LOWER(user_email) = $2 RETURNING *",
            [cleanId, targetEmail]
          );
        }
        if (res && res.rows && res.rows.length > 0) {
          pgUpdated = true;
          updated = this._mapRow(res.rows[0]);
        }
      }
    } catch (err) {
      console.warn("NotificationsDb.markAsRead postgres error:", err.message);
    }

    // 2. Update local mirror
    const notifs = readData(COLLECTION, []);
    let localFound = false;
    const modified = notifs.map(n => {
      if (n.id === cleanId && matchesUser(n, { id: targetUserId, email: targetEmail })) {
        localFound = true;
        updated = { ...n, unread: false, updated_at: new Date().toISOString() };
        return updated;
      }
      return n;
    });

    if (localFound) {
      writeData(COLLECTION, modified);
    }

    if (!pgUpdated && !localFound) {
      return null; // IDOR Protection: notification not found or access denied
    }

    return updated;
  }

  async markAllAsRead(userRef = "") {
    const targetUserId = typeof userRef === "object" ? userRef.id : null;
    const targetEmail = (typeof userRef === "object" ? (userRef.email || "") : String(userRef)).toLowerCase().trim();

    try {
      const pool = getPool();
      if (pool) {
        if (targetUserId && targetEmail) {
          await pool.query(
            "UPDATE public.notifications SET unread = FALSE, updated_at = NOW() WHERE user_id = $1 OR LOWER(user_email) = $2",
            [targetUserId, targetEmail]
          );
        } else if (targetUserId) {
          await pool.query(
            "UPDATE public.notifications SET unread = FALSE, updated_at = NOW() WHERE user_id = $1",
            [targetUserId]
          );
        } else if (targetEmail) {
          await pool.query(
            "UPDATE public.notifications SET unread = FALSE, updated_at = NOW() WHERE LOWER(user_email) = $1",
            [targetEmail]
          );
        }
      }
    } catch (err) {
      console.warn("NotificationsDb.markAllAsRead postgres error:", err.message);
    }

    const notifs = readData(COLLECTION, []);
    const modified = notifs.map(n => {
      if (matchesUser(n, { id: targetUserId, email: targetEmail })) {
        return { ...n, unread: false, updated_at: new Date().toISOString() };
      }
      return n;
    });
    writeData(COLLECTION, modified);

    return { success: true };
  }

  async delete(id, userRef = "") {
    const cleanId = String(id).trim();
    const targetUserId = typeof userRef === "object" ? userRef.id : null;
    const targetEmail = (typeof userRef === "object" ? (userRef.email || "") : String(userRef)).toLowerCase().trim();

    let deletedCount = 0;

    try {
      const pool = getPool();
      if (pool) {
        let res;
        if (targetUserId && targetEmail) {
          res = await pool.query(
            "DELETE FROM public.notifications WHERE id = $1 AND (user_id = $2 OR LOWER(user_email) = $3) RETURNING id",
            [cleanId, targetUserId, targetEmail]
          );
        } else if (targetUserId) {
          res = await pool.query(
            "DELETE FROM public.notifications WHERE id = $1 AND user_id = $2 RETURNING id",
            [cleanId, targetUserId]
          );
        } else if (targetEmail) {
          res = await pool.query(
            "DELETE FROM public.notifications WHERE id = $1 AND LOWER(user_email) = $2 RETURNING id",
            [cleanId, targetEmail]
          );
        }
        if (res && res.rows && res.rows.length > 0) {
          deletedCount += res.rows.length;
        }
      }
    } catch (err) {
      console.warn("NotificationsDb.delete postgres error:", err.message);
    }

    const notifs = readData(COLLECTION, []);
    const initialLen = notifs.length;
    const filtered = notifs.filter(n => !(n.id === cleanId && matchesUser(n, { id: targetUserId, email: targetEmail })));
    if (filtered.length !== initialLen) {
      deletedCount += (initialLen - filtered.length);
      writeData(COLLECTION, filtered);
    }

    if (deletedCount === 0) {
      return null; // Not found or unauthorized
    }

    return { success: true, id: cleanId };
  }

  async clearAll(userRef = "") {
    const targetUserId = typeof userRef === "object" ? userRef.id : null;
    const targetEmail = (typeof userRef === "object" ? (userRef.email || "") : String(userRef)).toLowerCase().trim();

    try {
      const pool = getPool();
      if (pool) {
        if (targetUserId && targetEmail) {
          await pool.query(
            "DELETE FROM public.notifications WHERE user_id = $1 OR LOWER(user_email) = $2",
            [targetUserId, targetEmail]
          );
        } else if (targetUserId) {
          await pool.query(
            "DELETE FROM public.notifications WHERE user_id = $1",
            [targetUserId]
          );
        } else if (targetEmail) {
          await pool.query(
            "DELETE FROM public.notifications WHERE LOWER(user_email) = $1",
            [targetEmail]
          );
        }
      }
    } catch (err) {
      console.warn("NotificationsDb.clearAll postgres error:", err.message);
    }

    const notifs = readData(COLLECTION, []);
    const remaining = notifs.filter(n => !matchesUser(n, { id: targetUserId, email: targetEmail }));
    writeData(COLLECTION, remaining);

    return { success: true };
  }
}

module.exports = new NotificationsDatabase();
