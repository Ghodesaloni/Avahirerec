const express = require("express");
const router = express.Router();
const interviewsDb = require("../db/interviewsDb");
const settingsDb = require("../db/settingsDb");
const automatedEmailService = require("../services/automatedEmailService");
const { requireAuth, optionalAuth } = require("../middleware/authMiddleware");

function parseDateTime(dateStr, timeStr) {
  if (!dateStr) return null;
  try {
    const rawDate = String(dateStr).trim().toLowerCase();
    let d = new Date();
    if (rawDate === "today") {
      d = new Date();
    } else if (rawDate === "tomorrow") {
      d = new Date();
      d.setDate(d.getDate() + 1);
    } else if (rawDate === "yesterday") {
      d = new Date();
      d.setDate(d.getDate() - 1);
    } else {
      let parsed = new Date(dateStr);
      if (isNaN(parsed.getTime())) {
        const parts = String(dateStr).trim().split(/\s+/);
        if (parts.length === 3) parsed = new Date(`${parts[1]} ${parts[0]}, ${parts[2]}`);
      }
      if (!isNaN(parsed.getTime())) d = parsed;
    }

    let hours = 11;
    let minutes = 0;
    if (timeStr && typeof timeStr === "string") {
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
      if (match) {
        hours = parseInt(match[1], 10);
        minutes = parseInt(match[2], 10);
        const meridian = match[3] ? match[3].toUpperCase() : null;
        if (meridian === "PM" && hours < 12) hours += 12;
        if (meridian === "AM" && hours === 12) hours = 0;
      }
    }
    d.setHours(hours, minutes, 0, 0);
    return d;
  } catch (e) {
    return null;
  }
}

async function checkAndEnforceExpiry(interview) {
  if (!interview) return interview;
  const status = String(interview.status || "").toLowerCase().trim();
  if (status === "completed" || status === "active" || status === "in live interview" || status === "joined") {
    return interview;
  }
  const parsed = parseDateTime(interview.date, interview.time);
  if (parsed && !isNaN(parsed.getTime())) {
    const ivSettings = settingsDb.getInterviewSettings(interview.userEmail || interview.createdBy);
    const graceMatch = String(ivSettings?.graceTime || "2").match(/(\d+)/);
    const graceMins = graceMatch ? parseInt(graceMatch[1], 10) : 2;
    const joinDeadline = new Date(parsed.getTime() + graceMins * 60 * 1000);
    if (new Date() > joinDeadline) {
      interview.isExpired = true;
      interview.status = "Expired";
      await interviewsDb.update(interview.id, { isExpired: true, status: "Expired" }).catch(() => {});
    }
  }
  return interview;
}

// GET /api/interviews - list interviews strictly scoped to authenticated recruiter
router.get("/", requireAuth, async (req, res) => {
  try {
    const { status, search } = req.query;
    const list = await interviewsDb.getAll({
      status,
      search,
      user: req.user,
      userId: req.user.id,
      userEmail: req.user.email
    });
    const processedList = await Promise.all(list.map(checkAndEnforceExpiry));
    res.json({ success: true, count: processedList.length, data: processedList });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/interviews/code/:linkCode - get by linkCode (used by candidate portal to enter their scheduled interview)
router.get("/code/:linkCode", async (req, res) => {
  try {
    let interview = await interviewsDb.getByLinkCode(req.params.linkCode);
    if (!interview) {
      return res.status(404).json({ success: false, error: "Interview link is invalid or expired" });
    }
    interview = await checkAndEnforceExpiry(interview);
    res.json({ success: true, data: interview });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/interviews/:id - get single interview (with IDOR protection)
router.get("/:id", requireAuth, async (req, res) => {
  try {
    let interview = await interviewsDb.getById(req.params.id, req.user);
    if (!interview) {
      return res.status(404).json({ success: false, error: "Interview not found or access denied" });
    }
    interview = await checkAndEnforceExpiry(interview);
    res.json({ success: true, data: interview });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/interviews - schedule new interview bound to authenticated account
router.post("/", requireAuth, async (req, res) => {
  try {
    const newInterview = await interviewsDb.create({
      ...req.body,
      userId: req.user.id,
      createdBy: req.user.email,
      userEmail: req.user.email
    });

    // Automated Email Trigger: Interview Scheduled
    automatedEmailService.sendInterviewScheduledEmail({ interview: newInterview, req }).catch(err => {
      console.warn("[AUTOMATED-EMAIL] Interview scheduled email notice:", err.message);
    });

    // In-app Notification Trigger
    const notificationService = require("../services/notificationService");
    notificationService.notifyInterviewScheduled({
      userEmail: req.user.email,
      candidateName: newInterview.name,
      role: newInterview.role,
      date: newInterview.date,
      time: newInterview.time,
      interviewId: newInterview.id
    }).catch(e => console.warn("Notification error:", e.message));

    res.status(201).json({ success: true, data: newInterview, message: "Interview scheduled successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/interviews/:id - update interview (only permitted for owner)
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const updated = await interviewsDb.update(req.params.id, req.body, req.user);
    if (!updated) {
      return res.status(404).json({ success: false, error: "Interview not found or unauthorized to update" });
    }
    res.json({ success: true, data: updated, message: "Interview updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/interviews/:id - delete/cancel interview (only permitted for owner)
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const deleted = await interviewsDb.delete(req.params.id, req.user);
    if (!deleted) {
      return res.status(404).json({ success: false, error: "Interview not found or unauthorized to delete" });
    }
    res.json({ success: true, message: "Interview cancelled successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
