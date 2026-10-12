const { readData, writeData } = require("./dbEngine");
const { getPool } = require("./postgres");

const COLLECTION = "interviews";

function matchesUser(item, userRef) {
  if (!userRef || !item) return false;
  const targetId = typeof userRef === "object" ? (userRef.id || userRef.userId) : null;
  const targetEmail = (typeof userRef === "object" ? (userRef.email || userRef.userEmail) : userRef || "").toLowerCase().trim();

  const itemId = item.userId !== undefined ? Number(item.userId) : (item.user_id !== undefined ? Number(item.user_id) : null);
  if (targetId && itemId && Number(targetId) === itemId) {
    return true;
  }

  const createdBy = (item.createdBy || item.created_by || "").toLowerCase().trim();
  const userEmail = (item.userEmail || item.user_email || "").toLowerCase().trim();

  if (targetEmail && (createdBy === targetEmail || userEmail === targetEmail)) {
    return true;
  }

  return false;
}

class InterviewsDatabase {
  syncFromResume(resumeItem) {
    if (!resumeItem) return null;
    const list = readData(COLLECTION, []);
    
    const candidateId = resumeItem.id;
    const emailLower = (resumeItem.email || "").toLowerCase().trim();

    // Check if interview already exists for this candidate
    let existingIdx = list.findIndex(iv => 
      iv.candidateId === candidateId ||
      iv.resumeId === candidateId ||
      iv.id === `iv-${candidateId}` ||
      (emailLower && iv.email && iv.email.toLowerCase().trim() === emailLower)
    );

    const id = existingIdx >= 0 ? list[existingIdx].id : `iv-${candidateId}`;
    const cleanNum = candidateId.replace(/\D/g, "").slice(-3) || Math.floor(100 + Math.random() * 900);
    const linkCode = existingIdx >= 0 && list[existingIdx].linkCode ? list[existingIdx].linkCode : `ava${cleanNum}`;

    const dateVal = existingIdx >= 0 && list[existingIdx].date 
      ? list[existingIdx].date 
      : (resumeItem.uploadedDate || new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }));

    const interviewData = {
      id,
      userId: resumeItem.userId || null,
      candidateId,
      resumeId: candidateId,
      name: resumeItem.name || "Candidate",
      email: resumeItem.email || "",
      phone: resumeItem.phone || "",
      avatar: resumeItem.avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150",
      role: resumeItem.targetJobTitle || resumeItem.role || "Software Engineer",
      company: "AvaHire Technologies Pvt. Ltd.",
      date: dateVal,
      dayOfWeek: existingIdx >= 0 && list[existingIdx].dayOfWeek ? list[existingIdx].dayOfWeek : "Tuesday",
      time: existingIdx >= 0 && list[existingIdx].time ? list[existingIdx].time : "11:00 AM",
      timeZone: "IST",
      duration: existingIdx >= 0 && list[existingIdx].duration ? list[existingIdx].duration : "45 Minutes",
      durationMins: 45,
      linkCode,
      status: existingIdx >= 0 && list[existingIdx].status ? list[existingIdx].status : "Scheduled",
      expiry: existingIdx >= 0 && list[existingIdx].expiry ? list[existingIdx].expiry : "Not started",
      expiryTime: existingIdx >= 0 && list[existingIdx].expiryTime ? list[existingIdx].expiryTime : `${dateVal}, 11:00 AM`,
      isExpired: false,
      score: resumeItem.atsScore || resumeItem.matchScore || null,
      createdBy: resumeItem.createdBy || resumeItem.userEmail || "",
      userEmail: resumeItem.userEmail || resumeItem.createdBy || "",
      createdAt: existingIdx >= 0 && list[existingIdx].createdAt ? list[existingIdx].createdAt : new Date().toISOString()
    };

    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...interviewData };
    } else {
      list.unshift(interviewData);
    }
    writeData(COLLECTION, list);

    try {
      const p = getPool();
      const query = `
        INSERT INTO public.interviews (
          id, candidate_id, name, email, avatar, role, company, date, day_of_week,
          time, time_zone, duration, duration_mins, link_code, status, expiry,
          expiry_time, is_expired, score, created_by, user_email, user_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          role = EXCLUDED.role,
          date = EXCLUDED.date,
          link_code = EXCLUDED.link_code,
          status = EXCLUDED.status,
          user_id = COALESCE(EXCLUDED.user_id, public.interviews.user_id),
          updated_at = NOW();
      `;
      p.query(query, [
        interviewData.id, interviewData.candidateId, interviewData.name, interviewData.email,
        interviewData.avatar, interviewData.role, interviewData.company, interviewData.date,
        interviewData.dayOfWeek, interviewData.time, interviewData.timeZone, interviewData.duration,
        interviewData.durationMins, interviewData.linkCode, interviewData.status, interviewData.expiry,
        interviewData.expiryTime, interviewData.isExpired, interviewData.score, interviewData.createdBy,
        interviewData.userEmail, interviewData.userId
      ]).catch(() => {});
    } catch (_) {}

    return interviewData;
  }

  removeForCandidate(candidateId, email) {
    const list = readData(COLLECTION, []);
    const emailLower = email ? email.toLowerCase().trim() : null;
    const filtered = list.filter(iv => {
      if (candidateId && (iv.candidateId === candidateId || iv.resumeId === candidateId || iv.id === `iv-${candidateId}`)) {
        return false;
      }
      if (emailLower && iv.email && iv.email.toLowerCase().trim() === emailLower) {
        return false;
      }
      return true;
    });
    if (filtered.length !== list.length) {
      writeData(COLLECTION, filtered);
    }
    try {
      const p = getPool();
      if (candidateId) {
        p.query("DELETE FROM public.interviews WHERE candidate_id = $1 OR id = $2", [candidateId, `iv-${candidateId}`]).catch(() => {});
      }
      if (emailLower) {
        p.query("DELETE FROM public.interviews WHERE LOWER(email) = $1", [emailLower]).catch(() => {});
      }
    } catch (_) {}
  }

  async getAll(filters = {}) {
    const userRef = filters.user || (filters.userId ? { id: filters.userId, email: filters.userEmail } : filters.userEmail);
    if (!userRef && !filters.allowAll) {
      return []; // Strict isolation: never return interviews without recruiter context
    }

    const userId = typeof userRef === "object" ? userRef.id : filters.userId;
    const userEmail = (typeof userRef === "object" ? userRef.email : filters.userEmail || userRef || "").toLowerCase().trim();

    // 1. Sync resumes from resumesDb scoped to this user
    let resumesList = [];
    try {
      const resumesDb = require("./resumesDb");
      resumesList = userRef ? resumesDb.getAll({ user: userRef }) : [];
    } catch (e) {
      resumesList = [];
    }

    const rejectedCandIds = new Set();
    const rejectedEmails = new Set();
    const selectedResumes = [];

    for (const r of resumesList) {
      const st = String(r.status || "").trim().toLowerCase();
      if (st === "rejected") {
        if (r.id) rejectedCandIds.add(r.id);
        if (r.email) rejectedEmails.add(r.email.toLowerCase().trim());
      } else if (st === "selected" || st === "shortlisted") {
        const nm = String(r.name || "").toLowerCase().trim();
        const isTest = !r.name || nm === "management tools" || nm.includes("prachi jain") || nm === "team members";
        if (!isTest && r.email) {
          selectedResumes.push(r);
        }
      }
    }

    const isDemoOrTest = (iv) => {
      if (!iv) return true;
      const cid = String(iv.candidateId || iv.resumeId || "").toLowerCase();
      const name = String(iv.name || "").toLowerCase().trim();
      const email = String(iv.email || "").toLowerCase().trim();
      if (cid.includes("cand-demo") || cid.includes("demo")) return true;
      if (name === "ananya sharma" || name === "rohan varma" || name === "priyanka patel") return true;
      if (name === "management tools" || name.includes("prachi jain")) return true;
      if (name === "srtyse" || name === "hjjiy" || name === "hello" || email === "hello@mail.com" || email === "awer@drtyg" || email === "sdfg@werr") return true;
      if (name === "candidate" && (!email || email.includes("example.com"))) return true;
      return false;
    };

    // 2. Fetch interviews from PostgreSQL first
    try {
      const p = getPool();
      let query = "SELECT * FROM public.interviews";
      const params = [];
      const conditions = [];

      if (userId && userEmail) {
        params.push(userId, userEmail);
        conditions.push(`(user_id = $1 OR LOWER(created_by) = $2 OR LOWER(user_email) = $2)`);
      } else if (userId) {
        params.push(userId);
        conditions.push(`user_id = $1`);
      } else if (userEmail) {
        params.push(userEmail);
        conditions.push(`(LOWER(created_by) = $1 OR LOWER(user_email) = $1)`);
      }

      if (filters.status && filters.status !== "All") {
        params.push(filters.status.toLowerCase());
        conditions.push(`LOWER(status) = $${params.length}`);
      }

      if (filters.search) {
        params.push(`%${filters.search.toLowerCase()}%`);
        const idx = params.length;
        conditions.push(`(LOWER(name) LIKE $${idx} OR LOWER(role) LIKE $${idx} OR LOWER(email) LIKE $${idx} OR LOWER(link_code) LIKE $${idx})`);
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }
      query += " ORDER BY created_at DESC";

      const res = await p.query(query, params);
      if (res.rows && res.rows.length > 0) {
        const rowsMapped = (res.rows || []).map(this._mapRow);
        return rowsMapped.filter(iv => {
          if (isDemoOrTest(iv)) return false;
          if (iv.candidateId && rejectedCandIds.has(iv.candidateId)) return false;
          if (iv.resumeId && rejectedCandIds.has(iv.resumeId)) return false;
          if (iv.email && rejectedEmails.has(iv.email.toLowerCase().trim())) return false;
          return true;
        });
      }
    } catch (err) {
      // fallback to local mirror
    }

    // 3. Fallback to local JSON mirror
    let list = readData(COLLECTION, []);
    list = list.filter(iv => {
      if (isDemoOrTest(iv)) return false;
      if (iv.candidateId && rejectedCandIds.has(iv.candidateId)) return false;
      if (iv.resumeId && rejectedCandIds.has(iv.resumeId)) return false;
      if (iv.id && rejectedCandIds.has(iv.id.replace(/^iv-/, ""))) return false;
      if (iv.email && rejectedEmails.has(iv.email.toLowerCase().trim())) return false;
      return true;
    });

    if (userRef) {
      list = list.filter(iv => matchesUser(iv, userRef));
    }
    if (filters.status && filters.status !== "All" && filters.status !== "All Status") {
      list = list.filter(iv => (iv.status || "").toLowerCase() === filters.status.toLowerCase());
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(iv =>
        (iv.name && iv.name.toLowerCase().includes(q)) ||
        (iv.role && iv.role.toLowerCase().includes(q)) ||
        (iv.email && iv.email.toLowerCase().includes(q)) ||
        (iv.linkCode && iv.linkCode.toLowerCase().includes(q))
      );
    }
    return list;
  }

  async getById(id, userRef = null) {
    if (!id) return null;
    // 1. Try PostgreSQL
    try {
      const p = getPool();
      const res = await p.query(
        "SELECT * FROM public.interviews WHERE id = $1 OR link_code = $1 LIMIT 1",
        [id]
      );
      if (res.rows && res.rows.length > 0) {
        const iv = this._mapRow(res.rows[0]);
        if (userRef && !matchesUser(iv, userRef)) {
          return null; // IDOR Protection
        }
        return iv;
      }
    } catch (err) {
      console.warn("PostgreSQL interviews getById fallback:", err.message);
    }

    // 2. Fallback to local mirror
    const list = readData(COLLECTION, []);
    const iv = list.find(item => item.id === id || item.linkCode === id) || null;
    if (iv && userRef && !matchesUser(iv, userRef)) {
      return null;
    }
    return iv;
  }

  async getByLinkCode(linkCode) {
    if (!linkCode) return null;
    const cleaned = linkCode.toLowerCase().trim();

    // 1. Try PostgreSQL
    try {
      const p = getPool();
      const res = await p.query(
        "SELECT * FROM public.interviews WHERE LOWER(link_code) = $1 OR id = $2 LIMIT 1",
        [cleaned, linkCode]
      );
      if (res.rows && res.rows.length > 0) {
        return this._mapRow(res.rows[0]);
      }
    } catch (err) {
      console.warn("PostgreSQL interviews getByLinkCode fallback:", err.message);
    }

    // 2. Fallback to local mirror
    const list = readData(COLLECTION, []);
    return list.find(iv => (iv.linkCode && iv.linkCode.toLowerCase() === cleaned) || iv.id === linkCode) || null;
  }

  async create(data) {
    const list = readData(COLLECTION, []);
    const id = data.id || `iv-${Date.now()}`;
    const randomCode = Math.random().toString(36).substring(2, 8);
    const linkCode = data.linkCode || randomCode;

    const newInterview = {
      id,
      userId: data.userId ? Number(data.userId) : null,
      candidateId: data.candidateId || `cand-${Date.now()}`,
      resumeId: data.resumeId || data.candidateId || "",
      name: data.name || "Candidate",
      email: data.email || "",
      phone: data.phone || "",
      avatar: data.avatar || "",
      role: data.role || "Software Engineer",
      company: data.company || "AvaHire Technologies Pvt. Ltd.",
      date: data.date || new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
      dayOfWeek: data.dayOfWeek || "",
      time: data.time || "10:00 AM",
      timeZone: data.timeZone || "IST",
      duration: data.duration || "45 Minutes",
      durationMins: data.durationMins || 45,
      linkCode,
      status: data.status || "Scheduled",
      expiry: data.expiry || "04:59 Remaining",
      expiryTime: data.expiryTime || "",
      isExpired: Boolean(data.isExpired),
      score: data.score !== undefined ? data.score : null,
      createdBy: data.createdBy || data.userEmail || "",
      userEmail: data.userEmail || data.createdBy || "",
      createdAt: new Date().toISOString()
    };

    // Update local mirror
    const existingIdx = list.findIndex(iv => iv.id === id || iv.linkCode === linkCode);
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...newInterview };
    } else {
      list.unshift(newInterview);
    }
    writeData(COLLECTION, list);

    // Persist to PostgreSQL public.interviews with user_id
    try {
      const p = getPool();
      const query = `
        INSERT INTO public.interviews (
          id, candidate_id, name, email, avatar, role, company, date, day_of_week,
          time, time_zone, duration, duration_mins, link_code, status, expiry,
          expiry_time, is_expired, score, created_by, user_email, user_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          avatar = EXCLUDED.avatar,
          role = EXCLUDED.role,
          company = EXCLUDED.company,
          date = EXCLUDED.date,
          day_of_week = EXCLUDED.day_of_week,
          time = EXCLUDED.time,
          time_zone = EXCLUDED.time_zone,
          duration = EXCLUDED.duration,
          duration_mins = EXCLUDED.duration_mins,
          link_code = EXCLUDED.link_code,
          status = EXCLUDED.status,
          score = EXCLUDED.score,
          user_id = COALESCE(EXCLUDED.user_id, public.interviews.user_id),
          created_by = EXCLUDED.created_by,
          user_email = EXCLUDED.user_email
        RETURNING *;
      `;

      const values = [
        newInterview.id,
        newInterview.candidateId,
        newInterview.name,
        newInterview.email,
        newInterview.avatar,
        newInterview.role,
        newInterview.company,
        newInterview.date,
        newInterview.dayOfWeek,
        newInterview.time,
        newInterview.timeZone,
        newInterview.duration,
        newInterview.durationMins,
        newInterview.linkCode,
        newInterview.status,
        newInterview.expiry,
        newInterview.expiryTime,
        newInterview.isExpired,
        newInterview.score,
        newInterview.createdBy,
        newInterview.userEmail,
        newInterview.userId
      ];

      await p.query(query, values);
    } catch (err) {
      console.warn("PostgreSQL interview insert notice:", err.message);
    }

    return newInterview;
  }

  async update(id, updates, userRef = null) {
    const existing = await this.getById(id, userRef);
    if (!existing) {
      return null; // Not found or unauthorized
    }

    // 1. Update local JSON mirror
    const list = readData(COLLECTION, []);
    const idx = list.findIndex(iv => iv.id === id || iv.linkCode === id);
    let updatedItem = null;
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
      updatedItem = list[idx];
      writeData(COLLECTION, list);
    }

    // 2. Update PostgreSQL
    try {
      const p = getPool();
      const setClauses = [];
      const params = [];

      if (updates.name !== undefined) {
        params.push(updates.name);
        setClauses.push(`name = $${params.length}`);
      }
      if (updates.email !== undefined) {
        params.push(updates.email);
        setClauses.push(`email = $${params.length}`);
      }
      if (updates.role !== undefined) {
        params.push(updates.role);
        setClauses.push(`role = $${params.length}`);
      }
      if (updates.status !== undefined) {
        params.push(updates.status);
        setClauses.push(`status = $${params.length}`);
      }
      if (updates.score !== undefined) {
        params.push(updates.score);
        setClauses.push(`score = $${params.length}`);
      }
      if (updates.date !== undefined) {
        params.push(updates.date);
        setClauses.push(`date = $${params.length}`);
      }
      if (updates.time !== undefined) {
        params.push(updates.time);
        setClauses.push(`time = $${params.length}`);
      }
      if (updates.duration !== undefined) {
        params.push(updates.duration);
        setClauses.push(`duration = $${params.length}`);
      }
      if (updates.isExpired !== undefined) {
        params.push(Boolean(updates.isExpired));
        setClauses.push(`is_expired = $${params.length}`);
      }

      if (setClauses.length > 0) {
        params.push(id);
        const query = `UPDATE public.interviews SET ${setClauses.join(", ")}, updated_at = NOW() WHERE id = $${params.length} OR link_code = $${params.length} RETURNING *;`;
        const res = await p.query(query, params);
        if (res.rows && res.rows[0]) {
          return this._mapRow(res.rows[0]);
        }
      }
    } catch (err) {
      console.warn("PostgreSQL interview update notice:", err.message);
    }

    return updatedItem;
  }

  async delete(id, userRef = null) {
    const existing = await this.getById(id, userRef);
    if (!existing) {
      return false; // Not found or unauthorized
    }

    // 1. Delete from local mirror
    const list = readData(COLLECTION, []);
    const filtered = list.filter(iv => iv.id !== id && iv.linkCode !== id);
    writeData(COLLECTION, filtered);

    // 2. Delete from PostgreSQL
    try {
      const p = getPool();
      await p.query("DELETE FROM public.interviews WHERE id = $1 OR link_code = $1", [id]);
      return true;
    } catch (err) {
      console.warn("PostgreSQL interview delete notice:", err.message);
      return filtered.length !== list.length;
    }
  }

  _mapRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id !== null && row.user_id !== undefined ? Number(row.user_id) : null,
      candidateId: row.candidate_id,
      resumeId: row.resume_id || row.candidate_id,
      name: row.name,
      email: row.email,
      phone: row.phone || "",
      avatar: row.avatar,
      role: row.role,
      company: row.company,
      date: row.date,
      dayOfWeek: row.day_of_week,
      time: row.time,
      timeZone: row.time_zone,
      duration: row.duration,
      durationMins: row.duration_mins,
      linkCode: row.link_code,
      status: row.status,
      expiry: row.expiry,
      expiryTime: row.expiry_time,
      isExpired: row.is_expired,
      score: row.score,
      createdBy: row.created_by,
      userEmail: row.user_email,
      createdAt: row.created_at
    };
  }
}

module.exports = new InterviewsDatabase();
