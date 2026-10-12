const { readData, writeData } = require("./dbEngine");
const { getPool } = require("./postgres");
const { evaluateTranscriptAlgorithmically } = require("../services/interviewEvaluatorService");
const excelReportService = require("../services/excelReportService");
const transcriptDocService = require("../services/transcriptDocService");

const COLLECTION = "candidates";

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

function applyTranscriptEvaluation(cand) {
  if (!cand) return cand;
  const transcript = cand.transcript || cand.transcripts || [];
  if (Array.isArray(transcript) && transcript.some(t => !t.isAI && t.speaker !== "Ava" && t.speaker !== "AI Interviewer")) {
    const evalRes = evaluateTranscriptAlgorithmically(transcript, cand.role);
    return {
      ...cand,
      score: evalRes.overallScore,
      total_score: evalRes.total_score,
      accuracyScore: evalRes.accuracyScore,
      confidenceScore: evalRes.confidenceScore,
      totalQuestions: evalRes.totalQuestions,
      correctAnswersCount: evalRes.correctAnswersCount,
      incorrectOrSkippedCount: evalRes.incorrectOrSkippedCount,
      status: cand.status || evalRes.status,
      recommendation: cand.recommendation || evalRes.recommendation,
      evaluationBreakdown: (cand.evaluationBreakdown && cand.evaluationBreakdown.length > 0) ? cand.evaluationBreakdown : evalRes.evaluationBreakdown,
      summaryPoints: (cand.summaryPoints && cand.summaryPoints.length > 0) ? cand.summaryPoints : evalRes.summaryPoints,
      questionEvaluations: (cand.questionEvaluations && cand.questionEvaluations.length > 0) ? cand.questionEvaluations : (cand.qaEvaluations || evalRes.qaEvaluations),
      qaEvaluations: (cand.qaEvaluations && cand.qaEvaluations.length > 0) ? cand.qaEvaluations : (cand.questionEvaluations || evalRes.qaEvaluations),
      question_evaluations: (cand.question_evaluations && cand.question_evaluations.length > 0) ? cand.question_evaluations : (cand.qaEvaluations || evalRes.qaEvaluations)
    };
  }
  return cand;
}

class CandidatesDatabase {
  async getAll(filters = {}) {
    const userRef = filters.user || (filters.userId ? { id: filters.userId, email: filters.userEmail } : filters.userEmail);
    if (!userRef && !filters.allowAll) {
      return []; // Strict isolation: return empty if no authenticated user context provided
    }

    const userId = typeof userRef === "object" ? userRef.id : filters.userId;
    const userEmail = (typeof userRef === "object" ? userRef.email : filters.userEmail || userRef || "").toLowerCase().trim();

    // 1. Try PostgreSQL first
    try {
      const p = getPool();
      let query = "SELECT * FROM public.candidates";
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

      if (filters.role && filters.role !== "All") {
        params.push(filters.role.toLowerCase());
        conditions.push(`LOWER(role) = $${params.length}`);
      }

      if (filters.search) {
        params.push(`%${filters.search.toLowerCase()}%`);
        const idx = params.length;
        conditions.push(`(LOWER(name) LIKE $${idx} OR LOWER(email) LIKE $${idx} OR LOWER(role) LIKE $${idx})`);
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }
      query += " ORDER BY created_at DESC";

      const res = await p.query(query, params);
      return (res.rows || []).map(r => this._mapRow(r));
    } catch (err) {
      console.warn("PostgreSQL candidates getAll fallback:", err.message);
    }

    // 2. Fallback to local JSON mirror
    let list = readData(COLLECTION, []);
    list = list.map(c => applyTranscriptEvaluation(c));

    if (userRef) {
      list = list.filter(c => matchesUser(c, userRef));
    }
    if (filters.status && filters.status !== "All") {
      list = list.filter(c => (c.status || "").toLowerCase() === filters.status.toLowerCase());
    }
    if (filters.role && filters.role !== "All") {
      list = list.filter(c => (c.role || "").toLowerCase() === filters.role.toLowerCase());
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(c =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.role && c.role.toLowerCase().includes(q))
      );
    }
    return list;
  }

  async getById(id, userRef = null) {
    if (!id) return null;
    // 1. Try PostgreSQL
    try {
      const p = getPool();
      const res = await p.query("SELECT * FROM public.candidates WHERE id = $1 LIMIT 1", [id]);
      if (res.rows && res.rows.length > 0) {
        const cand = this._mapRow(res.rows[0]);
        if (userRef && !matchesUser(cand, userRef)) {
          return null; // IDOR Protection: unauthorized to access another account's candidate
        }
        return cand;
      }
    } catch (err) {
      console.warn("PostgreSQL candidates getById fallback:", err.message);
    }

    // 2. Fallback to local mirror
    const list = readData(COLLECTION, []);
    const found = list.find(c => c.id === id) || null;
    const evaluated = applyTranscriptEvaluation(found);
    if (evaluated && userRef && !matchesUser(evaluated, userRef)) {
      return null;
    }
    return evaluated;
  }

  async create(data) {
    const list = readData(COLLECTION, []);
    const id = data.id || `cand-${Date.now()}`;

    // Compute dynamic evaluation based on rubric and answers
    let evaluatedScore = data.score !== undefined ? data.score : 90;
    let evaluatedStatus = data.status || "Under Review";
    let evaluatedRecommendation = data.recommendation || "";
    let evaluatedBreakdown = data.evaluationBreakdown || [];
    let evaluatedSummaryPoints = data.summaryPoints || [];
    let evaluatedQAs = data.question_evaluations || data.qaEvaluations || data.questionEvaluations || [];

    const transcript = data.transcript || data.transcripts || [];
    if (Array.isArray(transcript) && transcript.some(t => !t.isAI && t.speaker !== "Ava" && t.speaker !== "AI Interviewer")) {
      const evalRes = evaluateTranscriptAlgorithmically(transcript, data.role);
      evaluatedScore = data.score !== undefined ? data.score : evalRes.overallScore;
      evaluatedStatus = data.status || evalRes.status;
      evaluatedRecommendation = data.recommendation || evalRes.recommendation;
      evaluatedBreakdown = (data.evaluationBreakdown && data.evaluationBreakdown.length > 0) ? data.evaluationBreakdown : evalRes.evaluationBreakdown;
      evaluatedSummaryPoints = (data.summaryPoints && data.summaryPoints.length > 0) ? data.summaryPoints : evalRes.summaryPoints;
      if (!evaluatedQAs || evaluatedQAs.length === 0) {
        evaluatedQAs = evalRes.qaEvaluations || [];
      }
    }

    const isSelected = evaluatedStatus === "Selected";
    const selectionDate = data.selectionDate || (isSelected ? excelReportService.formatDisplayDate(new Date()) : "");
    const selectionTimestamp = data.selectionTimestamp || (isSelected ? String(Date.now()) : "");
    const transcriptUrl = data.transcriptUrl || `/api/candidates/${encodeURIComponent(id)}/transcript/download`;
    const transcriptPath = data.transcriptPath || "";
    const department = data.department || data.dept || "Engineering";
    const recordingStatus = data.recordingStatus || (data.audioUrl || data.audio_url ? "completed" : "pending");
    const jobId = data.jobId || data.job_id || "";

    const newCand = {
      id,
      userId: data.userId ? Number(data.userId) : null,
      name: data.name || "Candidate",
      email: data.email || "",
      phone: data.phone || "",
      role: data.role || "Software Engineer",
      avatar: data.avatar || "",
      interviewDate: data.interviewDate || new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      timestamp: String(data.timestamp || Date.now()),
      duration: data.duration || "0m 00s",
      mode: data.mode || "AI Live Interview",
      score: evaluatedScore,
      total_score: evaluatedScore,
      status: evaluatedStatus,
      selectionDate,
      selectionTimestamp,
      transcriptPath,
      transcriptUrl,
      department,
      recordingStatus,
      jobId,
      notes: data.notes || `Live interview evaluated based on technical correctness of answers and level of confidence. Overall score: ${evaluatedScore}/100 (${evaluatedStatus}).`,
      summaryPoints: evaluatedSummaryPoints,
      recommendation: evaluatedRecommendation,
      transcript: transcript,
      evaluationBreakdown: evaluatedBreakdown,
      questionEvaluations: evaluatedQAs,
      qaEvaluations: evaluatedQAs,
      question_evaluations: evaluatedQAs,
      audioUrl: data.audioUrl || data.audio_url || "",
      audioPath: data.audioPath || data.audio_path || "",
      createdBy: data.createdBy || data.userEmail || "",
      userEmail: data.userEmail || data.createdBy || "",
      createdAt: new Date().toISOString()
    };

    // Update local mirror
    const existingIdx = list.findIndex(c => c.id === id);
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...newCand };
    } else {
      list.unshift(newCand);
    }
    writeData(COLLECTION, list);

    // Persist to PostgreSQL public.candidates with user_id
    try {
      const p = getPool();
      const query = `
        INSERT INTO public.candidates (
          id, name, email, phone, role, avatar, interview_date, timestamp,
          duration, mode, score, status, notes, summary_points, recommendation,
          transcript, evaluation_breakdown, question_evaluations, audio_url, audio_path,
          selection_date, selection_timestamp, transcript_path, transcript_url,
          department, recording_status, job_id, created_by, user_email, user_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          role = EXCLUDED.role,
          avatar = EXCLUDED.avatar,
          interview_date = EXCLUDED.interview_date,
          duration = EXCLUDED.duration,
          score = EXCLUDED.score,
          status = EXCLUDED.status,
          notes = EXCLUDED.notes,
          summary_points = EXCLUDED.summary_points,
          recommendation = EXCLUDED.recommendation,
          transcript = EXCLUDED.transcript,
          evaluation_breakdown = EXCLUDED.evaluation_breakdown,
          question_evaluations = EXCLUDED.question_evaluations,
          audio_url = COALESCE(EXCLUDED.audio_url, public.candidates.audio_url),
          audio_path = COALESCE(EXCLUDED.audio_path, public.candidates.audio_path),
          selection_date = EXCLUDED.selection_date,
          selection_timestamp = EXCLUDED.selection_timestamp,
          transcript_path = COALESCE(EXCLUDED.transcript_path, public.candidates.transcript_path),
          transcript_url = COALESCE(EXCLUDED.transcript_url, public.candidates.transcript_url),
          department = EXCLUDED.department,
          recording_status = EXCLUDED.recording_status,
          job_id = EXCLUDED.job_id,
          user_id = COALESCE(EXCLUDED.user_id, public.candidates.user_id),
          created_by = EXCLUDED.created_by,
          user_email = EXCLUDED.user_email
        RETURNING *;
      `;

      const values = [
        newCand.id,
        newCand.name,
        newCand.email,
        newCand.phone,
        newCand.role,
        newCand.avatar,
        newCand.interviewDate,
        newCand.timestamp,
        newCand.duration,
        newCand.mode,
        newCand.score,
        newCand.status,
        newCand.notes,
        JSON.stringify(newCand.summaryPoints),
        newCand.recommendation,
        JSON.stringify(newCand.transcript),
        JSON.stringify(newCand.evaluationBreakdown),
        JSON.stringify(newCand.question_evaluations),
        newCand.audioUrl,
        newCand.audioPath,
        newCand.selectionDate,
        newCand.selectionTimestamp,
        newCand.transcriptPath,
        newCand.transcriptUrl,
        newCand.department,
        newCand.recordingStatus,
        newCand.jobId,
        newCand.createdBy,
        newCand.userEmail,
        newCand.userId
      ];

      await p.query(query, values);
    } catch (err) {
      console.warn("PostgreSQL candidate insert notice:", err.message);
    }

    // Auto-generate transcript Word document (.docx) in background
    transcriptDocService.generateTranscriptDoc(newCand).then(savedDoc => {
      newCand.transcriptPath = savedDoc.filePath;
      newCand.transcriptUrl = savedDoc.downloadUrl;
      const curList = readData(COLLECTION, []);
      const cIdx = curList.findIndex(c => c.id === newCand.id);
      if (cIdx >= 0) {
        curList[cIdx].transcriptPath = savedDoc.filePath;
        curList[cIdx].transcriptUrl = savedDoc.downloadUrl;
        writeData(COLLECTION, curList);
      }
    }).catch(err => {
      console.warn("[CandidatesDB] Auto docx generation notice:", err.message);
    });

    // If candidate status is Selected, sync daily reports for this user
    if (newCand.status === "Selected") {
      this.getAll({ user: { id: newCand.userId, email: newCand.userEmail } }).then(userCands => {
        excelReportService.syncAllReports(userCands, "", newCand.userEmail).catch(err => {
          console.warn("[CandidatesDB] Excel report sync notice:", err.message);
        });
      }).catch(() => {});
    }

    return newCand;
  }

  async update(id, updates, userRef = null) {
    const existing = await this.getById(id, userRef);
    if (!existing) {
      return null; // Not found or unauthorized
    }

    // 1. Update local mirror
    const list = readData(COLLECTION, []);
    const idx = list.findIndex(c => c.id === id);
    let updatedItem = null;
    let statusChanged = false;

    if (idx >= 0) {
      // Automatically handle selection date
      if (updates.status === "Selected") {
        if (!updates.selectionDate && !existing.selectionDate) {
          updates.selectionDate = excelReportService.formatDisplayDate(new Date());
          updates.selectionTimestamp = String(Date.now());
        }
      } else if (updates.status && updates.status !== "Selected") {
        if (existing.status === "Selected") {
          updates.selectionDate = "";
          updates.selectionTimestamp = "";
        }
      }

      if (updates.status !== undefined && updates.status !== existing.status) {
        statusChanged = true;
      }

      list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
      updatedItem = list[idx];
      writeData(COLLECTION, list);
    }

    // 2. Update PostgreSQL
    try {
      const p = getPool();
      const setClauses = [];
      const params = [];

      if (updates.status !== undefined) {
        params.push(updates.status);
        setClauses.push(`status = $${params.length}`);
      }
      if (updates.selectionDate !== undefined) {
        params.push(updates.selectionDate);
        setClauses.push(`selection_date = $${params.length}`);
      }
      if (updates.selectionTimestamp !== undefined) {
        params.push(updates.selectionTimestamp);
        setClauses.push(`selection_timestamp = $${params.length}`);
      }
      if (updates.transcriptPath !== undefined) {
        params.push(updates.transcriptPath);
        setClauses.push(`transcript_path = $${params.length}`);
      }
      if (updates.transcriptUrl !== undefined) {
        params.push(updates.transcriptUrl);
        setClauses.push(`transcript_url = $${params.length}`);
      }
      if (updates.department !== undefined) {
        params.push(updates.department);
        setClauses.push(`department = $${params.length}`);
      }
      if (updates.recordingStatus !== undefined) {
        params.push(updates.recordingStatus);
        setClauses.push(`recording_status = $${params.length}`);
      }
      if (updates.jobId !== undefined) {
        params.push(updates.jobId);
        setClauses.push(`job_id = $${params.length}`);
      }
      if (updates.notes !== undefined) {
        params.push(updates.notes);
        setClauses.push(`notes = $${params.length}`);
      }
      if (updates.score !== undefined) {
        params.push(updates.score);
        setClauses.push(`score = $${params.length}`);
      }
      if (updates.recommendation !== undefined) {
        params.push(updates.recommendation);
        setClauses.push(`recommendation = $${params.length}`);
      }
      if (updates.question_evaluations !== undefined || updates.qaEvaluations !== undefined) {
        params.push(JSON.stringify(updates.question_evaluations || updates.qaEvaluations));
        setClauses.push(`question_evaluations = $${params.length}`);
      }
      if (updates.evaluationBreakdown !== undefined) {
        params.push(JSON.stringify(updates.evaluationBreakdown));
        setClauses.push(`evaluation_breakdown = $${params.length}`);
      }
      if (updates.audioUrl !== undefined || updates.audio_url !== undefined) {
        params.push(updates.audioUrl || updates.audio_url);
        setClauses.push(`audio_url = $${params.length}`);
      }
      if (updates.audioPath !== undefined || updates.audio_path !== undefined) {
        params.push(updates.audioPath || updates.audio_path);
        setClauses.push(`audio_path = $${params.length}`);
      }

      if (setClauses.length > 0) {
        params.push(id);
        const query = `UPDATE public.candidates SET ${setClauses.join(", ")}, updated_at = NOW() WHERE id = $${params.length} RETURNING *;`;
        const res = await p.query(query, params);
        if (res.rows && res.rows[0]) {
          updatedItem = this._mapRow(res.rows[0]);
        }
      }
    } catch (err) {
      console.warn("PostgreSQL candidate update notice:", err.message);
    }

    // If candidate status is or was Selected, sync Excel reports for this account
    if (statusChanged || updates.status === "Selected" || (updatedItem && updatedItem.status === "Selected")) {
      const ownerEmail = existing.userEmail || existing.createdBy;
      const ownerId = existing.userId;
      this.getAll({ user: { id: ownerId, email: ownerEmail } }).then(allCands => {
        excelReportService.syncAllReports(allCands, "", ownerEmail).catch(err => {
          console.warn("[CandidatesDB] Excel report sync notice on update:", err.message);
        });
      }).catch(() => {});
    }

    return updatedItem || existing;
  }

  async delete(id, userRef = null) {
    const existing = await this.getById(id, userRef);
    if (!existing) {
      return false; // Not found or unauthorized
    }

    // 1. Delete from local mirror
    const list = readData(COLLECTION, []);
    const filtered = list.filter(c => c.id !== id);
    writeData(COLLECTION, filtered);

    // 2. Delete from PostgreSQL
    try {
      const p = getPool();
      await p.query("DELETE FROM public.candidates WHERE id = $1", [id]);
    } catch (err) {
      console.warn("PostgreSQL candidate delete notice:", err.message);
    }

    // Sync reports for this user after deletion
    const ownerEmail = existing.userEmail || existing.createdBy;
    const userFiltered = filtered.filter(c => matchesUser(c, { id: existing.userId, email: ownerEmail }));
    excelReportService.syncAllReports(userFiltered, "", ownerEmail).catch(() => {});

    return true;
  }

  _mapRow(row) {
    if (!row) return null;
    const qEvals = typeof row.question_evaluations === "string" ? JSON.parse(row.question_evaluations) : (row.question_evaluations || []);
    const mapped = {
      id: row.id,
      userId: row.user_id !== null && row.user_id !== undefined ? Number(row.user_id) : null,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      avatar: row.avatar,
      interviewDate: row.interview_date,
      timestamp: row.timestamp,
      duration: row.duration,
      mode: row.mode,
      score: row.score,
      total_score: row.score,
      status: row.status,
      selectionDate: row.selection_date || row.selectionDate || (row.status === "Selected" ? excelReportService.formatDisplayDate(row.updated_at || row.created_at || new Date()) : ""),
      selectionTimestamp: row.selection_timestamp || row.selectionTimestamp || "",
      transcriptPath: row.transcript_path || row.transcriptPath || "",
      transcriptUrl: row.transcript_url || row.transcriptUrl || `/api/candidates/${encodeURIComponent(row.id)}/transcript/download`,
      department: row.department || row.dept || "Engineering",
      recordingStatus: row.recording_status || (row.audio_url || row.audioUrl ? "completed" : "pending"),
      jobId: row.job_id || row.jobId || "",
      notes: row.notes,
      summaryPoints: typeof row.summary_points === "string" ? JSON.parse(row.summary_points) : (row.summary_points || []),
      recommendation: row.recommendation,
      transcript: typeof row.transcript === "string" ? JSON.parse(row.transcript) : (row.transcript || []),
      evaluationBreakdown: typeof row.evaluation_breakdown === "string" ? JSON.parse(row.evaluation_breakdown) : (row.evaluation_breakdown || []),
      questionEvaluations: qEvals,
      qaEvaluations: qEvals,
      question_evaluations: qEvals,
      audioUrl: row.audio_url || row.audioUrl || "",
      audioPath: row.audio_path || row.audioPath || "",
      createdBy: row.created_by,
      userEmail: row.user_email,
      createdAt: row.created_at
    };
    return applyTranscriptEvaluation(mapped);
  }
}

module.exports = new CandidatesDatabase();
