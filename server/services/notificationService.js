const notificationsDb = require("../db/notificationsDb");
const { readData } = require("../db/dbEngine");
const { getPool } = require("../db/postgres");

class NotificationService {
  /**
   * Create a new notification with deduplication by eventKey
   */
  async createNotification(payload) {
    try {
      if (!payload || !payload.userEmail) {
        return null;
      }
      return await notificationsDb.create(payload);
    } catch (err) {
      console.warn("[NotificationService] createNotification notice:", err.message);
      return null;
    }
  }

  /**
   * Get all notifications for user with optional filtering
   */
  async getNotifications(filters = {}) {
    const list = await notificationsDb.getAll(filters);
    // If user has no notifications at all, attempt initial sync from account records
    if ((!list || list.length === 0) && (filters.userEmail || filters.userId)) {
      await this.syncInitialNotifications(filters);
      return await notificationsDb.getAll(filters);
    }
    return list;
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userRef) {
    return await notificationsDb.getUnreadCount(userRef);
  }

  /**
   * Mark single notification as read
   */
  async markAsRead(id, userRef) {
    return await notificationsDb.markAsRead(id, userRef);
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userRef) {
    return await notificationsDb.markAllAsRead(userRef);
  }

  /**
   * Delete single notification
   */
  async deleteNotification(id, userRef) {
    return await notificationsDb.delete(id, userRef);
  }

  /**
   * Clear all notifications
   */
  async clearAll(userRef) {
    return await notificationsDb.clearAll(userRef);
  }

  /**
   * Event: Resume uploaded / parsed
   */
  async notifyResumeUploaded({ userEmail, candidateName, score, role, resumeId }) {
    return await this.createNotification({
      userEmail,
      title: `Resume Evaluated: ${candidateName || "Candidate"}`,
      message: `Resume for ${candidateName || "Candidate"} scored ${score || 85}% match for ${role || "Position"}.`,
      type: "resumes",
      category: "Resume",
      eventKey: `resume_uploaded_${resumeId || candidateName}`,
      link: "/app/resumes",
      icon: "FileText",
      iconBg: "bg-blue-50 text-blue-600",
      metadata: { resumeId, candidateName, score, role }
    });
  }

  /**
   * Event: Interview Scheduled
   */
  async notifyInterviewScheduled({ userEmail, candidateName, role, date, time, interviewId }) {
    return await this.createNotification({
      userEmail,
      title: `Interview Scheduled: ${candidateName || "Candidate"}`,
      message: `AI interview scheduled for ${candidateName || "Candidate"} (${role || "Technical Role"}) on ${date || "upcoming date"} at ${time || "scheduled time"}.`,
      type: "interviews",
      category: "Interview",
      eventKey: `interview_scheduled_${interviewId || candidateName}`,
      link: "/app/interviews",
      icon: "Video",
      iconBg: "bg-indigo-50 text-indigo-600",
      metadata: { interviewId, candidateName, role, date, time }
    });
  }

  /**
   * Event: Interview Completed
   */
  async notifyInterviewCompleted({ userEmail, candidateName, role, score, sessionId, linkCode }) {
    return await this.createNotification({
      userEmail,
      title: `Interview Completed: ${candidateName || "Candidate"}`,
      message: `${candidateName || "Candidate"} has completed the AI technical interview for ${role || "Role"} with an overall score of ${score || 0}/100.`,
      type: "interviews",
      category: "Interview",
      eventKey: `interview_completed_${sessionId || linkCode || candidateName}`,
      link: `/app/candidates?search=${encodeURIComponent(candidateName || "")}`,
      icon: "CheckCircle2",
      iconBg: "bg-emerald-50 text-emerald-600",
      metadata: { sessionId, linkCode, candidateName, role, score }
    });
  }

  /**
   * Event: Interview Terminated (proctoring violation)
   */
  async notifyInterviewTerminated({ userEmail, candidateName, role, reason, sessionId }) {
    return await this.createNotification({
      userEmail,
      title: `Interview Terminated: ${candidateName || "Candidate"}`,
      message: `Session for ${candidateName || "Candidate"} was terminated by AI proctoring: ${reason || "Security policy violation"}.`,
      type: "interviews",
      category: "Security",
      eventKey: `interview_terminated_${sessionId || candidateName}`,
      link: "/app/interviews",
      icon: "AlertTriangle",
      iconBg: "bg-rose-50 text-rose-600",
      metadata: { sessionId, candidateName, role, reason }
    });
  }

  /**
   * Event: Candidate Decision (Selected / Rejected)
   */
  async notifyCandidateDecision({ userEmail, candidateName, role, status, candidateId }) {
    const isSelected = status === "Selected";
    return await this.createNotification({
      userEmail,
      title: `Candidate ${status}: ${candidateName || "Candidate"}`,
      message: `${candidateName || "Candidate"} has been marked as ${status} for ${role || "Position"}.`,
      type: "candidates",
      category: "Candidate",
      eventKey: `candidate_decision_${candidateId || candidateName}_${status}`,
      link: `/app/candidates${isSelected ? "?status=Selected" : ""}`,
      icon: isSelected ? "Award" : "XCircle",
      iconBg: isSelected ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-600",
      metadata: { candidateId, candidateName, role, status }
    });
  }

  /**
   * Event: Job Created
   */
  async notifyJobCreated({ userEmail, jobTitle, dept, jobId }) {
    return await this.createNotification({
      userEmail,
      title: `New Job Posted: ${jobTitle}`,
      message: `Job position "${jobTitle}" in ${dept || "Department"} is now active and accepting applicants.`,
      type: "jobs",
      category: "Job",
      eventKey: `job_created_${jobId || jobTitle}`,
      link: "/app/jobs",
      icon: "Briefcase",
      iconBg: "bg-violet-50 text-violet-600",
      metadata: { jobId, jobTitle, dept }
    });
  }

  /**
   * Initial sync from existing candidates, interviews, and jobs
   */
  async syncInitialNotifications(userRef) {
    if (!userRef) return;
    const cleanEmail = (typeof userRef === "object" ? (userRef.userEmail || userRef.email || "") : String(userRef)).toLowerCase().trim();
    const userId = typeof userRef === "object" && (userRef.userId || userRef.id) ? Number(userRef.userId || userRef.id) : null;
    if (!cleanEmail && !userId) return;

    const matchesAccount = (item) => {
      if (!item) return false;
      const itemUserId = item.user_id !== undefined ? Number(item.user_id) : (item.userId !== undefined ? Number(item.userId) : null);
      if (userId && itemUserId && itemUserId === userId) return true;
      if (cleanEmail) {
        const uEmail = (item.userEmail || item.user_email || item.createdBy || item.created_by || "").toLowerCase().trim();
        return uEmail === cleanEmail;
      }
      return false;
    };

    try {
      // 1. Check existing candidates
      const candidates = readData("candidates", []);
      for (const cand of candidates.slice(0, 5)) {
        if (cand && matchesAccount(cand)) {
          if (cand.status === "Selected" || cand.status === "Rejected") {
            await this.notifyCandidateDecision({
              userId,
              userEmail: cleanEmail,
              candidateName: cand.name,
              role: cand.role,
              status: cand.status,
              candidateId: cand.id
            });
          } else if (cand.status === "Completed" || cand.transcript?.length > 0) {
            await this.notifyInterviewCompleted({
              userId,
              userEmail: cleanEmail,
              candidateName: cand.name,
              role: cand.role,
              score: cand.score,
              sessionId: cand.id
            });
          }
        }
      }

      // 2. Check scheduled interviews
      const interviews = readData("interviews", []);
      for (const iv of interviews.slice(0, 4)) {
        if (iv && matchesAccount(iv)) {
          await this.notifyInterviewScheduled({
            userId,
            userEmail: cleanEmail,
            candidateName: iv.name,
            role: iv.role,
            date: iv.date,
            time: iv.time,
            interviewId: iv.id
          });
        }
      }

      // 3. Check jobs
      const jobs = readData("jobs", []);
      for (const j of jobs.slice(0, 3)) {
        if (j && matchesAccount(j)) {
          await this.notifyJobCreated({
            userId,
            userEmail: cleanEmail,
            jobTitle: j.title,
            dept: j.dept,
            jobId: j.id
          });
        }
      }
    } catch (e) {
      console.warn("[NotificationService] Initial sync notice:", e.message);
    }
  }
}

module.exports = new NotificationService();
