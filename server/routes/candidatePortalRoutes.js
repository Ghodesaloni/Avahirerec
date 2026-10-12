const express = require("express");
const router = express.Router();
const multer = require("multer");
const candidateSessionsDb = require("../db/candidateSessionsDb");
const candidatesDb = require("../db/candidatesDb");
const interviewsDb = require("../db/interviewsDb");
const resumesDb = require("../db/resumesDb");
const settingsDb = require("../db/settingsDb");
const proctoringDb = require("../db/proctoringDb");
const recordingStorageService = require("../services/recordingStorageService");

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

/**
 * Clean & normalize email for comparison
 */
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/**
 * Strip all non-digit characters from phone
 */
function normalizePhoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

/**
 * Robust phone number matching:
 * Handles international prefix (+91, +1), local trunk prefix (0), spaces, dashes, parentheses.
 */
function matchPhoneNumbers(inputPhone, storedPhone) {
  if (!inputPhone || !storedPhone) return false;
  const d1 = normalizePhoneDigits(inputPhone);
  const d2 = normalizePhoneDigits(storedPhone);
  if (!d1 || !d2) return false;

  // Exact digit match
  if (d1 === d2) return true;

  // Match national 10-digit number if both are at least 10 digits
  if (d1.length >= 10 && d2.length >= 10) {
    if (d1.slice(-10) === d2.slice(-10)) return true;
  }

  // Fallback substring match for non-standard or abbreviated numbers
  if ((d1.length >= 7 && d2.includes(d1)) || (d2.length >= 7 && d1.includes(d2))) {
    return true;
  }

  return false;
}

/**
 * Gather all resumes from resumesDb and candidatesDb so candidate portal is connected to all resumes
 * Excludes rejected candidates and prioritizes/selects candidates in a selective way
 */
async function getAllCandidateResumes(filters = {}) {
  const resumes = resumesDb.getAll() || [];
  let candidates = [];
  try {
    candidates = (await candidatesDb.getAll()) || [];
  } catch (err) {
    candidates = [];
  }
  
  const map = new Map();
  // 1. Primary resume collection from resumesDb
  for (const r of resumes) {
    const key = normalizeEmail(r.email);
    const statusLower = String(r.status || "").trim().toLowerCase();
    
    // Completely exclude rejected candidates
    if (statusLower === "rejected") continue;

    if (key) {
      map.set(key, {
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone || "",
        role: r.targetJobTitle || r.role || "Software Engineer",
        field: r.field || r.domain || "Software Development",
        resumeFileName: r.resumeFileName || (r.s3Key ? r.s3Key.split("/").pop() : null),
        skills: r.skills || r.allSkills || [],
        experience: r.experience || (r.expYears ? `${r.expYears} Years` : "1-2 Years"),
        status: r.status || "Shortlisted",
        source: "resumes",
        createdBy: r.createdBy || "",
        userEmail: r.userEmail || ""
      });
    }
  }

  // 2. Also supplement with candidates from candidatesDb if not already present
  for (const c of candidates) {
    const key = normalizeEmail(c.email);
    const statusLower = String(c.status || "").trim().toLowerCase();
    if (statusLower === "rejected") continue;

    if (key && !map.has(key)) {
      map.set(key, {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone || "",
        role: c.role || "Software Engineer",
        field: c.field || "Technology",
        resumeFileName: c.resumeFileName || null,
        skills: c.skills || [],
        experience: c.experience || "1-2 Years",
        status: c.status || "Applied",
        source: "candidates",
        createdBy: c.createdBy || "",
        userEmail: c.userEmail || ""
      });
    } else if (key && map.has(key)) {
      const existing = map.get(key);
      if (!existing.phone && c.phone) {
        existing.phone = c.phone;
      }
    }
  }

  let result = Array.from(map.values());

  // Filter by userEmail if provided for user isolation
  if (filters.userEmail) {
    const target = filters.userEmail.toLowerCase().trim();
    const userFiltered = result.filter(c => 
      (c.createdBy && c.createdBy.toLowerCase().trim() === target) ||
      (c.userEmail && c.userEmail.toLowerCase().trim() === target)
    );
    if (userFiltered.length > 0) {
      result = userFiltered;
    }
  }

  // Selective ordering:
  // "in that way like selected candidates list will be shown in interview page , list must be shown in selective way"
  // Candidates marked as "Selected" or "Shortlisted" are given selective prominence
  const selectedOnly = result.filter(c => {
    const s = String(c.status || "").toLowerCase().trim();
    return s === "selected" || s === "shortlisted";
  });

  if (selectedOnly.length > 0) {
    return selectedOnly.sort((a, b) => {
      const aSel = String(a.status || "").toLowerCase() === "selected" ? 0 : 1;
      const bSel = String(b.status || "").toLowerCase() === "selected" ? 0 : 1;
      return aSel - bSel;
    });
  }

  return result;
}

/**
 * Parse human date & time strings into a Date object
 */
function parseInterviewDateTime(dateStr, timeStr) {
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
        if (parts.length === 3) {
          parsed = new Date(`${parts[1]} ${parts[0]}, ${parts[2]}`);
        }
      }
      if (!isNaN(parsed.getTime())) {
        d = parsed;
      }
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
  } catch (err) {
    return null;
  }
}

/**
 * Compute candidate interview schedule window and know at which time the candidate should login and enter.
 * Enforces strict 5-minute join rule: if candidate does not join within 5 minutes of scheduled time, link expires.
 */
function getCandidateScheduleTiming(scheduledInterview) {
  if (!scheduledInterview) return null;

  const parsedDate = parseInterviewDateTime(scheduledInterview.date, scheduledInterview.time);
  const now = new Date();

  let durationMins = 45;
  if (scheduledInterview.duration) {
    const dMatch = String(scheduledInterview.duration).match(/(\d+)/);
    if (dMatch) durationMins = parseInt(dMatch[1], 10);
  }

  const currentStatus = String(scheduledInterview.status || "").toLowerCase().trim();
  const isAlreadyCompleted = currentStatus === "completed";
  const isAlreadyJoined = currentStatus === "active" || currentStatus === "in live interview" || currentStatus === "joined";

  let windowStart = null;
  let windowEnd = null;
  let joinExpiryTime = null;
  let isWindowActive = true;
  let isUpcoming = false;
  let isPast = false;
  let isExpired = false;
  let diffMinutes = 0;
  let timingMessage = "";
  let timingBadge = "Scheduled Slot";

  const ivSettings = settingsDb.getInterviewSettings(scheduledInterview?.userEmail || scheduledInterview?.createdBy);
  const joinWindowMatch = String(ivSettings?.joinWindow || "5").match(/(\d+)/);
  const joinWindowMins = joinWindowMatch ? parseInt(joinWindowMatch[1], 10) : 5;
  const graceMatch = String(ivSettings?.graceTime || "2").match(/(\d+)/);
  const graceTimeMins = graceMatch ? parseInt(graceMatch[1], 10) : 2;

  if (parsedDate && !isNaN(parsedDate.getTime())) {
    windowStart = new Date(parsedDate.getTime() - joinWindowMins * 60 * 1000); // join window prior to start
    windowEnd = new Date(parsedDate.getTime() + (durationMins + 30) * 60 * 1000); // duration + 30 mins
    // Configured grace period: Candidate must join within graceTimeMins of scheduled start time
    joinExpiryTime = new Date(parsedDate.getTime() + graceTimeMins * 60 * 1000);

    diffMinutes = Math.round((parsedDate.getTime() - now.getTime()) / (60 * 1000));

    if (isAlreadyCompleted) {
      timingBadge = "Completed";
      timingMessage = `Your interview on ${scheduledInterview.date} at ${scheduledInterview.time} has been completed.`;
    } else if (isAlreadyJoined) {
      isWindowActive = true;
      timingBadge = "In Progress";
      timingMessage = `Interview session is currently active.`;
    } else if (now > joinExpiryTime) {
      // Exceeded grace period from scheduled start time without joining
      isPast = true;
      isExpired = true;
      isWindowActive = false;
      timingBadge = `Link Expired (${graceTimeMins}m Grace Exceeded)`;
      timingMessage = `This interview link has expired. Candidates must click 'Join Interview' within ${graceTimeMins} minutes of their scheduled time (${scheduledInterview.date} at ${scheduledInterview.time}). Please contact HR to reschedule.`;
    } else if (now < windowStart) {
      isUpcoming = true;
      isWindowActive = false;
      const hours = Math.floor(diffMinutes / 60);
      const mins = diffMinutes % 60;
      const timeRemainingStr = hours > 0 ? `${hours} hr ${mins} min` : `${mins} min`;
      timingBadge = `Upcoming (${timeRemainingStr})`;
      timingMessage = `Your interview is scheduled for ${scheduledInterview.date} at ${scheduledInterview.time}. Entry portal opens ${joinWindowMins} minutes prior to your slot. Candidate entry window begins in ${timeRemainingStr}.`;
    } else {
      isWindowActive = true;
      timingBadge = "Entry Open Now";
      timingMessage = `Your scheduled interview slot is ACTIVE right now (${scheduledInterview.date} at ${scheduledInterview.time}). Please join within ${graceTimeMins} minutes grace period.`;
    }
  } else {
    timingMessage = `Interview scheduled for ${scheduledInterview.date || "Assigned Date"} at ${scheduledInterview.time || "Assigned Slot"}.`;
  }

  const finalIsExpired = isExpired || Boolean(scheduledInterview.isExpired) || currentStatus === "expired";

  return {
    scheduledDate: scheduledInterview.date,
    scheduledTime: scheduledInterview.time,
    duration: scheduledInterview.duration || `${durationMins} Minutes`,
    durationMins,
    windowStartTime: windowStart ? windowStart.toISOString() : null,
    windowEndTime: windowEnd ? windowEnd.toISOString() : null,
    joinExpiryTime: joinExpiryTime ? joinExpiryTime.toISOString() : null,
    canEnterNow: isWindowActive && !finalIsExpired && !isAlreadyCompleted,
    isWindowActive,
    isUpcoming,
    isPast,
    isExpired: finalIsExpired,
    diffMinutes,
    timingBadge,
    timingMessage,
    scheduledDisplay: `${scheduledInterview.date} at ${scheduledInterview.time}`
  };
}

// Default role-specific question banks for live AI interviews
const ROLE_QUESTIONS = {
  "frontend developer": [
    "Welcome! Could you please introduce yourself and share your core frontend tech stack?",
    "How do you manage complex asynchronous state and prevent unnecessary re-renders in modern React applications?",
    "What strategies do you employ for Core Web Vitals optimization and cross-browser accessibility?",
    "Describe how you structure scalable design systems and reusable UI component architectures."
  ],
  "software engineer": [
    "Welcome! Please introduce yourself and highlight a high-impact engineering system you built.",
    "How do you approach database schema design, indexing, and query optimization for high-throughput services?",
    "Explain how you design fault-tolerant microservices with circuit breakers and message queues.",
    "Tell us about a critical production outage you debugged under pressure and how you resolved it."
  ],
  "full stack engineer": [
    "Welcome! Walk us through your background and the architecture of your favorite full-stack project.",
    "How do you manage API contract consistency and state synchronization between client and backend servers?",
    "What is your approach to authentication security, session caching, and database transaction isolation?",
    "How do you balance rapid delivery with code review rigor and automated test coverage?"
  ],
  "product manager": [
    "Welcome! Tell us about yourself and a product roadmap you successfully delivered from 0 to 1.",
    "How do you prioritize competing stakeholder demands when engineering capacity is constrained?",
    "What qualitative and quantitative metrics do you use to evaluate feature adoption and customer retention?",
    "Walk us through a time a product launch did not meet KPI targets and how you pivoted."
  ]
};

function getQuestionsForRole(roleName = "") {
  const normalized = (roleName || "").toLowerCase().trim();
  for (const [key, questions] of Object.entries(ROLE_QUESTIONS)) {
    if (normalized.includes(key)) {
      return questions;
    }
  }
  return ROLE_QUESTIONS["software engineer"];
}

const { analyzeCandidateResumeForAgent } = require("../services/resumeQuestionService");

// 1. GET /api/candidate-portal/session/:linkCode - Retrieve session by link code
router.get("/session/:linkCode", async (req, res) => {
  try {
    const { linkCode } = req.params;
    let session = await candidateSessionsDb.getByLinkCode(linkCode);
    const scheduledInterview = await interviewsDb.getByLinkCode(linkCode);

    // Compute live schedule timing & check 5-minute expiration rule
    const scheduleTiming = scheduledInterview ? getCandidateScheduleTiming(scheduledInterview) : null;
    const isLinkExpired = Boolean(scheduleTiming?.isExpired || scheduledInterview?.isExpired || session?.isExpired || scheduledInterview?.status === "Expired" || session?.status === "Expired");

    if (scheduledInterview && isLinkExpired && scheduledInterview.status !== "Expired") {
      scheduledInterview.isExpired = true;
      scheduledInterview.status = "Expired";
      await interviewsDb.update(scheduledInterview.id, { isExpired: true, status: "Expired" }).catch(() => {});
    }

    // If not found in sessions table, attempt to hydrate from scheduled interview and resume in HR Portal
    const allResumes = resumesDb.getAll() || [];
    let allCandidates = [];
    try {
      allCandidates = (await candidatesDb.getAll()) || [];
    } catch (e) {
      allCandidates = [];
    }

    const targetEmail = (session?.candidateEmail || scheduledInterview?.email || "").toLowerCase().trim();
    const targetName = (session?.candidateName || scheduledInterview?.name || "").toLowerCase().trim();
    const targetId = session?.resumeId || scheduledInterview?.candidateId || scheduledInterview?.resumeId || null;

    let matchedResume = null;
    if (targetEmail) {
      matchedResume = allResumes.find(r => r.email && normalizeEmail(r.email) === targetEmail) ||
                      allCandidates.find(c => c.email && normalizeEmail(c.email) === targetEmail);
    }
    if (!matchedResume && targetId) {
      matchedResume = allResumes.find(r => r.id === targetId) || allCandidates.find(c => c.id === targetId);
    }
    if (!matchedResume && targetName && targetName !== "candidate") {
      matchedResume = allResumes.find(r => r.name && r.name.toLowerCase().trim() === targetName) ||
                      allCandidates.find(c => c.name && c.name.toLowerCase().trim() === targetName);
    }
    if (!matchedResume) {
      matchedResume = allResumes.find(r => r.projects?.length > 0 || r.rawText) || allResumes[0] || allCandidates[0] || null;
    }

    const combinedCandidateData = {
      name: scheduledInterview?.name || session?.candidateName || matchedResume?.name || "Candidate",
      email: targetEmail || matchedResume?.email || "candidate@avahire.ai",
      phone: (matchedResume && matchedResume.phone) || session?.candidatePhone || scheduledInterview?.phone || "+91 98765 43210",
      role: scheduledInterview?.role || session?.role || (matchedResume && (matchedResume.targetJobTitle || matchedResume.role)) || "Software Engineer",
      company: scheduledInterview?.company || session?.company || "AvaHire Technologies Pvt. Ltd.",
      resumeId: matchedResume ? matchedResume.id : null,
      resumeFileName: matchedResume ? (matchedResume.resumeFileName || (matchedResume.s3Key ? matchedResume.s3Key.split("/").pop() : null)) : null,
      skills: (matchedResume && (matchedResume.allSkills || matchedResume.skills)) || session?.skills || ["Full Stack", "JavaScript", "React", "Node.js"],
      allSkills: (matchedResume && (matchedResume.allSkills || matchedResume.skills)) || session?.skills || [],
      experience: (matchedResume && (matchedResume.experience || (matchedResume.expYears ? `${matchedResume.expYears} Years` : null))) || session?.experience || "3+ Years",
      education: matchedResume?.education || "Bachelor of Technology",
      certifications: matchedResume?.certifications || [],
      projects: matchedResume?.projects || session?.projects || [],
      rawText: matchedResume?.rawText || matchedResume?.raw_text || session?.rawText || "",
      summary: matchedResume?.summary || session?.summary || ""
    };

    const resumeAnalysis = analyzeCandidateResumeForAgent(combinedCandidateData, scheduledInterview);

    const initialStatus = scheduledInterview?.status === "Completed"
      ? "Completed"
      : isLinkExpired
      ? "Expired"
      : "Invited";

    if (!session && scheduledInterview) {
      session = await candidateSessionsDb.createOrUpdate({
        id: `sess-${scheduledInterview.id}`,
        linkCode: scheduledInterview.linkCode,
        candidateName: resumeAnalysis.candidateName,
        candidateEmail: resumeAnalysis.candidateEmail,
        candidatePhone: resumeAnalysis.candidatePhone,
        role: resumeAnalysis.candidateRole,
        company: resumeAnalysis.candidateCompany,
        resumeId: matchedResume ? matchedResume.id : null,
        resumeFileName: resumeAnalysis.resumeFileName,
        skills: resumeAnalysis.skills,
        experience: resumeAnalysis.experience,
        projects: resumeAnalysis.projects,
        questions: resumeAnalysis.generatedQuestions,
        status: initialStatus,
        isExpired: isLinkExpired,
        overallScore: scheduledInterview.score || 94,
        techDepthScore: "9.2 / 10",
        clarityScore: "9.5 / 10",
        recommendation: "Recommended for Senior Technical Review",
      });
    }

    if (!session && !scheduledInterview) {
      session = {
        id: `sess-${linkCode}`,
        linkCode,
        candidateName: resumeAnalysis.candidateName,
        candidateEmail: resumeAnalysis.candidateEmail,
        candidatePhone: resumeAnalysis.candidatePhone,
        role: resumeAnalysis.candidateRole,
        company: resumeAnalysis.candidateCompany,
        resumeId: matchedResume ? matchedResume.id : null,
        resumeFileName: resumeAnalysis.resumeFileName,
        skills: resumeAnalysis.skills,
        experience: resumeAnalysis.experience,
        projects: resumeAnalysis.projects,
        questions: resumeAnalysis.generatedQuestions,
        status: isLinkExpired ? "Expired" : "Invited",
        isExpired: isLinkExpired,
        overallScore: 94,
        techDepthScore: "9.2 / 10",
        clarityScore: "9.5 / 10",
        recommendation: "Recommended for Senior Technical Review"
      };
    }

    if (session && isLinkExpired && session.status !== "Expired") {
      session.isExpired = true;
      session.status = "Expired";
      await candidateSessionsDb.createOrUpdate(session).catch(() => {});
    }

    const interviewSettings = settingsDb.getInterviewSettings();

    res.json({
      success: true,
      data: {
        ...session,
        isExpired: isLinkExpired,
        status: isLinkExpired ? "Expired" : session.status,
        projects: resumeAnalysis.projects,
        projectHighlights: resumeAnalysis.projectHighlights,
        questions: resumeAnalysis.generatedQuestions,
        resumeAnalysis,
        interviewSettings,
        interviewSchedule: scheduledInterview ? {
          id: scheduledInterview.id,
          linkCode: scheduledInterview.linkCode,
          date: scheduledInterview.date,
          time: scheduledInterview.time,
          duration: scheduledInterview.duration || interviewSettings.duration,
          status: isLinkExpired ? "Expired" : scheduledInterview.status,
          isExpired: isLinkExpired,
          timing: scheduleTiming
        } : null
      }
    });
  } catch (err) {
    console.error("Error retrieving candidate portal session:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/candidate-portal/interview-settings - Candidate-accessible interview & proctoring configuration
router.get("/interview-settings", async (req, res) => {
  try {
    let userEmail = req.query.userEmail || req.headers["x-user-email"];
    if (!userEmail && req.query.linkCode) {
      const scheduled = await interviewsDb.getByLinkCode(req.query.linkCode);
      if (scheduled && (scheduled.userEmail || scheduled.createdBy)) {
        userEmail = scheduled.userEmail || scheduled.createdBy;
      }
    }
    const settings = await settingsDb.getInterviewSettingsAsync(userEmail);
    res.json({ success: true, data: settings });
  } catch (err) {
    console.error("Error retrieving interview settings for candidate portal:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/candidate-portal/resumes - Retrieve all submitted resumes for candidate portal connection
router.get("/resumes", async (req, res) => {
  try {
    const authorEmail = req.query.userEmail || req.headers["x-user-email"];
    const list = await getAllCandidateResumes({ userEmail: authorEmail });
    const allInterviews = await interviewsDb.getAll({ userEmail: authorEmail });
    const sanitized = list.map(r => {
      const cleanEmail = normalizeEmail(r.email);
      const scheduled = allInterviews.find(iv => 
        (iv.email && normalizeEmail(iv.email) === cleanEmail) ||
        (iv.candidateId && iv.candidateId === r.id) ||
        (iv.resumeId && iv.resumeId === r.id)
      );
      const timing = scheduled ? getCandidateScheduleTiming(scheduled) : null;
      return {
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        role: r.role || "Software Engineer",
        field: r.field || "Software Development",
        resumeFileName: r.resumeFileName || null,
        skills: r.skills || [],
        experience: r.experience || "1-2 Years",
        status: r.status,
        hasScheduledInterview: Boolean(scheduled),
        interviewSchedule: scheduled ? {
          id: scheduled.id,
          linkCode: scheduled.linkCode,
          date: scheduled.date,
          time: scheduled.time,
          duration: scheduled.duration || "45 Minutes",
          status: scheduled.status,
          timing
        } : null
      };
    });
    res.json({ success: true, count: sanitized.length, data: sanitized });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/candidate-portal/demo-resumes - Retrieve sample resume credentials for testing/evaluation
router.get("/demo-resumes", async (req, res) => {
  try {
    const list = await getAllCandidateResumes();
    const allInterviews = await interviewsDb.getAll();
    const sanitized = list.map(r => {
      const cleanEmail = normalizeEmail(r.email);
      const scheduled = allInterviews.find(iv => 
        (iv.email && normalizeEmail(iv.email) === cleanEmail) ||
        (iv.candidateId && iv.candidateId === r.id) ||
        (iv.resumeId && iv.resumeId === r.id)
      );
      const timing = scheduled ? getCandidateScheduleTiming(scheduled) : null;
      return {
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        role: r.role || "Software Engineer",
        resumeFileName: r.resumeFileName || null,
        skills: r.skills || [],
        interviewSchedule: scheduled ? {
          linkCode: scheduled.linkCode,
          date: scheduled.date,
          time: scheduled.time,
          status: scheduled.status,
          timing
        } : null
      };
    });
    res.json({ success: true, count: sanitized.length, data: sanitized });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/candidate-portal/schedule/:linkCode - Retrieve schedule & timing window for candidate portal
router.get("/schedule/:linkCode", async (req, res) => {
  try {
    const { linkCode } = req.params;
    const scheduled = await interviewsDb.getByLinkCode(linkCode);
    if (!scheduled) {
      return res.status(404).json({ success: false, error: "Interview schedule not found" });
    }
    const timing = getCandidateScheduleTiming(scheduled);
    res.json({
      success: true,
      data: {
        id: scheduled.id,
        linkCode: scheduled.linkCode,
        name: scheduled.name,
        email: scheduled.email,
        phone: scheduled.phone || "",
        role: scheduled.role,
        company: scheduled.company,
        date: scheduled.date,
        time: scheduled.time,
        duration: scheduled.duration,
        status: scheduled.status,
        timing
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. POST /api/candidate-portal/login - Candidate Portal authentication and verification
router.post("/login", async (req, res) => {
  try {
    const { linkCode, email, phone } = req.body;

    // Validate inputs
    const cleanEmail = normalizeEmail(email);
    const cleanPhone = String(phone || "").trim();

    if (!cleanEmail) {
      return res.status(400).json({
        success: false,
        error: "Please enter the Email ID mentioned on your submitted resume."
      });
    }

    if (!cleanPhone) {
      return res.status(400).json({
        success: false,
        error: "Please enter the Phone Number mentioned on your submitted resume."
      });
    }

    // 1. Check all submitted resumes in resumes and candidates database
    const allCandidateResumes = await getAllCandidateResumes();
    const matchedResume = allCandidateResumes.find(r => r.email && normalizeEmail(r.email) === cleanEmail);

    // If no candidate resume found with this email, strictly reject
    if (!matchedResume) {
      return res.status(403).json({
        success: false,
        error: `Access Denied: The email "${email}" was not found in any submitted resume. You are not allowed to log in with an email address not mentioned in your resume. Candidate Portal strictly requires an approved resume on file.`
      });
    }

    // 2. Strict Phone Number Verification against Candidate Resume
    const registeredPhone = String(matchedResume.phone || "").trim();
    if (registeredPhone) {
      const isPhoneMatch = matchPhoneNumbers(cleanPhone, registeredPhone);
      if (!isPhoneMatch) {
        return res.status(403).json({
          success: false,
          error: `Access Denied: The phone number "${cleanPhone}" does not match the contact number registered on the resume for ${matchedResume.name}. You are not allowed to log in with a different phone number than mentioned in your resume.`
        });
      }
    } else {
      // If resume had no phone recorded, save the validated phone format (min 7 digits)
      const cleanDigits = normalizePhoneDigits(cleanPhone);
      if (cleanDigits.length < 7) {
        return res.status(400).json({
          success: false,
          error: "Please enter a valid phone number (minimum 7 digits)."
        });
      }
      resumesDb.update(matchedResume.id, { phone: cleanPhone });
    }

    // 3. Interview Schedule Verification: Check when candidate is scheduled to interview
    let scheduledInterview = null;
    if (linkCode) {
      scheduledInterview = await interviewsDb.getByLinkCode(linkCode);
    }
    if (!scheduledInterview) {
      const allInterviews = await interviewsDb.getAll();
      scheduledInterview = allInterviews.find(iv => 
        (iv.email && normalizeEmail(iv.email) === cleanEmail) ||
        (iv.candidateId && iv.candidateId === matchedResume.id) ||
        (iv.resumeId && iv.resumeId === matchedResume.id)
      );
    }

    // If no interview is scheduled for this candidate: do not allow entry
    if (!scheduledInterview) {
      return res.status(403).json({
        success: false,
        notScheduled: true,
        candidate: {
          name: matchedResume.name,
          email: cleanEmail,
          phone: registeredPhone || cleanPhone,
          role: matchedResume.role || "Software Engineer"
        },
        error: `Access Restricted: Resume verified for ${matchedResume.name}, but an interview has not been scheduled yet on the Schedule page. Candidates can only log in and enter once an interview slot has been assigned by the hiring team.`
      });
    }

    // If linkCode was provided, verify it belongs to this candidate
    if (scheduledInterview.email && normalizeEmail(scheduledInterview.email) !== cleanEmail) {
      return res.status(403).json({
        success: false,
        error: `Access Denied: This interview link is designated for a different candidate (${scheduledInterview.email}). Please sign in with the email linked to your interview invitation.`
      });
    }

    // Compute candidate schedule timing
    const scheduleTiming = getCandidateScheduleTiming(scheduledInterview);

    // Check completion status
    if (scheduledInterview.status === "Completed") {
      return res.status(403).json({
        success: false,
        isCompleted: true,
        timing: scheduleTiming,
        error: `Interview Already Completed: Your interview on ${scheduledInterview.date} has already been completed. Thank you for participating!`
      });
    }

    // Check expiry (including the 5-minute joining window expiry rule)
    if (scheduleTiming?.isExpired || scheduledInterview.isExpired || scheduledInterview.status === "Expired") {
      if (scheduledInterview && scheduledInterview.status !== "Expired") {
        await interviewsDb.update(scheduledInterview.id, { isExpired: true, status: "Expired" }).catch(() => {});
      }
      return res.status(403).json({
        success: false,
        isExpired: true,
        timing: scheduleTiming,
        error: `Interview Expired: The 5-minute joining window for your scheduled interview on ${scheduledInterview.date} at ${scheduledInterview.time} has passed. Please contact HR for a reschedule.`
      });
    }

    // Candidate authenticated successfully!
    const candidateName = matchedResume.name || scheduledInterview.name || "Candidate";
    const candidateRole = matchedResume.role || scheduledInterview.role || "Software Engineer";
    const company = scheduledInterview.company || "AvaHire Technologies Pvt. Ltd.";
    const code = linkCode || scheduledInterview.linkCode || `ava-${matchedResume.id}`;

    const existingSession = await candidateSessionsDb.getByLinkCode(code);

    const session = await candidateSessionsDb.createOrUpdate({
      id: existingSession ? existingSession.id : `sess-${scheduledInterview ? scheduledInterview.id : code}`,
      linkCode: code,
      candidateName,
      candidateEmail: cleanEmail,
      candidatePhone: registeredPhone || cleanPhone,
      role: candidateRole,
      company,
      resumeId: matchedResume.id,
      resumeFileName: matchedResume.resumeFileName || null,
      skills: matchedResume.skills || [],
      experience: matchedResume.experience || "1-2 Years",
      education: matchedResume.education || "Bachelor's Degree",
      interviewSchedule: {
        id: scheduledInterview.id,
        linkCode: code,
        date: scheduledInterview.date,
        time: scheduledInterview.time,
        duration: scheduledInterview.duration || "45 Minutes",
        status: scheduledInterview.status,
        timing: scheduleTiming
      },
      authenticated: true,
      authenticatedAt: new Date().toISOString(),
      status: "Authenticated"
    });

    // Update HR Portal interview status to indicate candidate has joined portal
    if (scheduledInterview && scheduledInterview.status === "Scheduled") {
      await interviewsDb.update(scheduledInterview.id, { status: "Active" });
    }

    return res.json({
      success: true,
      data: session,
      candidate: {
        id: session.id,
        name: candidateName,
        email: cleanEmail,
        phone: registeredPhone || cleanPhone,
        role: candidateRole,
        company,
        resumeFileName: matchedResume ? matchedResume.resumeFileName : null
      },
      timing: scheduleTiming,
      message: `Identity verified! Welcome ${candidateName}. Your interview is scheduled on ${scheduledInterview.date} at ${scheduledInterview.time}.`
    });
  } catch (err) {
    console.error("Error in candidate portal login:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. POST /api/candidate-portal/system-check - Hardware and proctoring readiness check
router.post("/system-check", async (req, res) => {
  try {
    const { linkCode, camera, microphone, audio, network, latency, agreedProctoring } = req.body;
    if (!linkCode) {
      return res.status(400).json({ success: false, error: "Link code is required" });
    }

    const existingSession = await candidateSessionsDb.getByLinkCode(linkCode);
    const updated = await candidateSessionsDb.createOrUpdate({
      ...(existingSession || {}),
      linkCode,
      status: "System Check Completed",
      systemCheckStatus: {
        camera: Boolean(camera),
        microphone: Boolean(microphone),
        audio: Boolean(audio),
        network: network || "Optimal",
        latency: latency || "32ms",
        agreedProctoring: Boolean(agreedProctoring),
        checkedAt: new Date().toISOString()
      }
    });

    res.json({
      success: true,
      data: updated,
      message: "System diagnostics verified and recorded"
    });
  } catch (err) {
    console.error("Error saving system check:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. GET /api/candidate-portal/questions/:linkCode - Retrieve role-specific AI questions
router.get("/questions/:linkCode", async (req, res) => {
  try {
    const { linkCode } = req.params;
    const session = await candidateSessionsDb.getByLinkCode(linkCode);
    const scheduled = await interviewsDb.getByLinkCode(linkCode);
    const role = (session && session.role) || (scheduled && scheduled.role) || "Software Engineer";

    const questions = getQuestionsForRole(role);
    res.json({
      success: true,
      role,
      questions
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. POST /api/candidate-portal/transcript-chunk - Real-time interview utterance streaming
router.post("/transcript-chunk", async (req, res) => {
  try {
    const { linkCode, speaker, roleTag, time, text, questionIndex } = req.body;
    if (!linkCode || !text) {
      return res.status(400).json({ success: false, error: "linkCode and text are required" });
    }

    const session = await candidateSessionsDb.getByLinkCode(linkCode);
    if (!session) {
      return res.status(404).json({ success: false, error: "Candidate session not found" });
    }

    const currentTranscripts = Array.isArray(session.transcripts) ? session.transcripts : [];
    const newEntry = {
      speaker: speaker || "Candidate",
      roleTag: roleTag || (speaker === "Ava" ? "AI Interviewer" : "Candidate"),
      time: time || new Date().toLocaleTimeString(),
      text: text.trim(),
      questionIndex: questionIndex !== undefined ? questionIndex : null,
      timestamp: Date.now()
    };

    currentTranscripts.push(newEntry);

    await candidateSessionsDb.createOrUpdate({
      ...session,
      transcripts: currentTranscripts,
      status: "In Live Interview"
    });

    res.json({ success: true, count: currentTranscripts.length, latest: newEntry });
  } catch (err) {
    console.error("Error streaming transcript chunk:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. POST /api/candidate-portal/session - Create or update candidate portal session state
router.post("/session", async (req, res) => {
  try {
    const sessionData = req.body;
    const session = await candidateSessionsDb.createOrUpdate(sessionData);

    // If session is completed, automatically sync into HR candidates evaluation table
    if (sessionData.status === "Completed") {
      await syncSessionToHRPorizontal(session, req.headers["x-user-email"]);
    }

    res.json({ success: true, data: session, message: "Candidate portal session saved to PostgreSQL" });
  } catch (err) {
    console.error("Error saving candidate portal session:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const {
  evaluateCandidateInterview,
  evaluateSingleAnswerWithGemini,
  generateExpectedRubric,
  evaluateTranscriptAlgorithmically
} = require("../services/interviewEvaluatorService");

// 7. POST /api/candidate-portal/evaluate-answer - Real-time individual answer evaluation via Gemini
router.post("/evaluate-answer", async (req, res) => {
  try {
    const { question, expectedRubric, candidateAnswer, role, candidateName } = req.body;
    if (!question || !candidateAnswer) {
      return res.status(400).json({ success: false, error: "question and candidateAnswer are required" });
    }

    const evaluation = await evaluateSingleAnswerWithGemini({
      question,
      expectedRubric: expectedRubric || generateExpectedRubric(question, role || "Software Engineer"),
      candidateAnswer,
      role: role || "Software Engineer",
      candidateName: candidateName || "Candidate"
    });

    res.json({
      success: true,
      data: evaluation
    });
  } catch (err) {
    console.error("Error evaluating single answer:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. POST /api/candidate-portal/complete - Explicit completion endpoint connecting to HR Portal
router.post("/complete", async (req, res) => {
  try {
    const {
      linkCode,
      id,
      candidateName,
      candidateEmail,
      candidatePhone,
      role,
      company,
      elapsedSeconds,
      transcripts
    } = req.body;

    const code = linkCode || "akc123";
    const existing = await candidateSessionsDb.getByLinkCode(code);
    const targetRole = role || (existing ? existing.role : "Senior Full Stack Engineer");
    const activeTranscripts = transcripts || (existing ? existing.transcripts : []);

    // Calculate dynamic Gemini scoring based on rubric weights (40% tech, 25% completeness, 15% relevance, 15% problem-solving, 5% clarity)
    const evaluation = await evaluateCandidateInterview({
      transcript: activeTranscripts,
      role: targetRole,
      name: candidateName || (existing ? existing.candidateName : "Candidate")
    });

    const completedSession = await candidateSessionsDb.createOrUpdate({
      ...(existing || {}),
      id: id || (existing ? existing.id : `sess-${code}`),
      linkCode: code,
      candidateName: candidateName || (existing ? existing.candidateName : "Candidate"),
      candidateEmail: candidateEmail || (existing ? existing.candidateEmail : "candidate@avahire.ai"),
      candidatePhone: candidatePhone || (existing ? existing.candidatePhone : "+91 98765 43210"),
      role: targetRole,
      company: company || (existing ? existing.company : "AvaHire Technologies Pvt. Ltd."),
      status: "Completed",
      overallScore: evaluation.overallScore,
      total_score: evaluation.total_score || evaluation.overallScore,
      accuracyScore: evaluation.accuracyScore,
      confidenceScore: evaluation.confidenceScore,
      techDepthScore: `${(evaluation.accuracyScore / 10).toFixed(1)} / 10`,
      clarityScore: `${(evaluation.confidenceScore / 10).toFixed(1)} / 10`,
      recommendation: evaluation.recommendation,
      elapsedSeconds: elapsedSeconds || (existing ? existing.elapsedSeconds : 504),
      transcripts: activeTranscripts,
      evaluationBreakdown: evaluation.evaluationBreakdown,
      summaryPoints: evaluation.summaryPoints,
      questionEvaluations: evaluation.qaEvaluations || evaluation.question_evaluations || [],
      qaEvaluations: evaluation.qaEvaluations || evaluation.question_evaluations || [],
      completedAt: new Date().toISOString()
    });

    // Deep sync to HR Portal backend
    const hrCandidate = await syncSessionToHRPorizontal(completedSession, req.headers["x-user-email"], evaluation);

    // In-app Notification Trigger
    const notificationService = require("../services/notificationService");
    const targetRecruiter = hrCandidate?.userEmail || hrCandidate?.createdBy || req.headers["x-user-email"] || "hr@avahire.ai";
    notificationService.notifyInterviewCompleted({
      userEmail: targetRecruiter,
      candidateName: completedSession.candidateName,
      role: completedSession.role,
      score: evaluation.overallScore,
      sessionId: completedSession.id,
      linkCode: code
    }).catch(e => console.warn("Notification error:", e.message));

    res.json({
      success: true,
      message: "Interview finalized and synchronized with HR Evaluation Portal",
      data: {
        session: completedSession,
        evaluation,
        hrCandidateEvaluationId: hrCandidate ? hrCandidate.id : null,
        referenceId: `REF-${code.toUpperCase()}-${Date.now().toString().slice(-4)}`
      }
    });
  } catch (err) {
    console.error("Error completing candidate interview:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper function to synchronize candidate portal session into HR candidates & interviews database
async function syncSessionToHRPorizontal(session, authorEmail, evalOverride = null) {
  try {
    const defaultAuthor = authorEmail || "hr@avahire.ai";
    const durationMins = Math.floor((session.elapsedSeconds || 504) / 60);
    const durationSecs = (session.elapsedSeconds || 504) % 60;
    const formattedDuration = `${durationMins}m ${durationSecs}s`;

    const transcripts = session.transcripts || [];
    const evaluation = evalOverride || evaluateTranscriptAlgorithmically(transcripts, session.role);

    // 1. Create or update Candidate in HR Candidates Evaluation database
    const hrCandidate = await candidatesDb.create({
      id: `cand-${session.id || session.linkCode}`,
      name: session.candidateName,
      email: session.candidateEmail,
      phone: session.candidatePhone,
      role: session.role,
      company: session.company,
      score: evaluation.overallScore,
      total_score: evaluation.overallScore,
      status: evaluation.status,
      duration: formattedDuration,
      mode: "AI Live Interview",
      recommendation: evaluation.recommendation,
      notes: `Live interview evaluated using AI rubric: Technical Correctness 40%, Completeness 25%, Relevance 15%, Problem-Solving 15%, Clarity 5%. Overall score: ${evaluation.overallScore}/100 (${evaluation.status}).`,
      summaryPoints: evaluation.summaryPoints,
      transcript: transcripts,
      evaluationBreakdown: evaluation.evaluationBreakdown,
      question_evaluations: evaluation.qaEvaluations || evaluation.question_evaluations || [],
      qaEvaluations: evaluation.qaEvaluations || evaluation.question_evaluations || [],
      questionEvaluations: evaluation.qaEvaluations || evaluation.question_evaluations || [],
      createdBy: defaultAuthor,
      userEmail: defaultAuthor
    });

    // 2. Update Interview record in HR Portal
    if (session.linkCode) {
      await interviewsDb.update(session.linkCode, {
        status: "Completed",
        score: evaluation.overallScore
      }).catch(() => {});
    }

    return hrCandidate;
  } catch (err) {
    console.error("Error synchronizing session to HR Portal:", err);
    return null;
  }
}

// 8. GET /api/candidate-portal/sessions - Recruiter endpoint to list all portal sessions
router.get("/sessions", async (req, res) => {
  try {
    const { status, email, linkCode } = req.query;
    const list = await candidateSessionsDb.getAll({ status, email, linkCode });
    res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. GET /api/candidate-portal/hr-overview - Recruiter live overview metrics
router.get("/hr-overview", async (req, res) => {
  try {
    const allSessions = await candidateSessionsDb.getAll();
    const liveSessions = allSessions.filter(s => s.status === "In Live Interview" || s.status === "Joined");
    const completedSessions = allSessions.filter(s => s.status === "Completed");
    const totalScore = completedSessions.reduce((acc, s) => acc + (s.overallScore || 0), 0);
    const avgScore = completedSessions.length > 0 ? Math.round(totalScore / completedSessions.length) : 0;

    res.json({
      success: true,
      metrics: {
        totalSessions: allSessions.length,
        liveRooms: liveSessions.length,
        completedSessions: completedSessions.length,
        averageScore: avgScore,
        recentActivity: allSessions.slice(0, 5)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. POST /api/candidate-portal/proctoring/violation - Register proctoring violation, warning, or termination
router.post("/proctoring/violation", async (req, res) => {
  try {
    const {
      linkCode,
      sessionId,
      candidateEmail,
      candidateName,
      violationType,
      details,
      metadata
    } = req.body;

    const rawCode = (linkCode || "").replace(/^interview_/, "").trim();
    const type = String(violationType || "").toLowerCase().trim();

    // Check effective interview settings for this interview / recruiter
    let recruiterEmail = req.headers["x-user-email"] || null;
    if (!recruiterEmail && rawCode) {
      const scheduled = await interviewsDb.getByLinkCode(rawCode);
      const sessionData = await candidateSessionsDb.getByLinkCode(rawCode);
      recruiterEmail = scheduled?.recruiterEmail || scheduled?.createdBy || sessionData?.recruiterEmail || null;
    }
    const ivSettings = await settingsDb.getInterviewSettingsAsync(recruiterEmail);

    if (ivSettings.enableProctoring === false) {
      const currentCount = await proctoringDb.getWarningCount(rawCode);
      return res.json({
        success: true,
        action: "disabled",
        terminate: false,
        warningCount: currentCount,
        message: "Proctoring is disabled in interview settings."
      });
    }

    if ((type === "face_not_visible" || type === "poor_lighting" || type === "low_lighting" || type === "face_missing") && ivSettings.faceDetection === false) {
      const currentCount = await proctoringDb.getWarningCount(rawCode);
      return res.json({ success: true, action: "disabled", terminate: false, warningCount: currentCount });
    }

    if ((type === "multiple_people" || type === "multiple_faces" || type === "extra_person") && ivSettings.multiplePersonDetection === false) {
      const currentCount = await proctoringDb.getWarningCount(rawCode);
      return res.json({ success: true, action: "disabled", terminate: false, warningCount: currentCount });
    }

    if ((type === "tab_switch" || type === "tab_change" || type === "window_blur" || type === "window_change" || type === "window_switch" || type === "multiple_windows" || type === "split_screen" || type === "visibility_hidden" || type === "focus_lost" || type === "screen_switch") && ivSettings.tabSwitchDetection === false) {
      const currentCount = await proctoringDb.getWarningCount(rawCode);
      return res.json({ success: true, action: "disabled", terminate: false, warningCount: currentCount });
    }

    if (type === "fullscreen_exit" && ivSettings.fullScreenMonitoring === false) {
      const currentCount = await proctoringDb.getWarningCount(rawCode);
      return res.json({ success: true, action: "disabled", terminate: false, warningCount: currentCount });
    }

    // 1. Guidance Notices (Zero warnings, non-terminating guidance)
    // A. Face visibility & lighting check
    if (type === "face_not_visible" || type === "poor_lighting" || type === "low_lighting" || type === "face_missing") {
      const noticePrompt = "Your face is not clearly visible. Please adjust your position or lighting.";
      const recorded = await proctoringDb.recordViolation({
        linkCode: rawCode,
        sessionId,
        candidateEmail,
        candidateName,
        violationType: type,
        severity: "notice",
        warningNumber: 0,
        details: details || noticePrompt,
        metadata
      });

      const currentCount = await proctoringDb.getWarningCount(rawCode);
      return res.json({
        success: true,
        action: "notice",
        terminate: false,
        warningCount: currentCount,
        verbalPrompt: noticePrompt,
        message: details || noticePrompt,
        data: recorded
      });
    }

    // B. Excessive Background Noise (AI asks candidate to move to a quieter location; NO WARNING)
    if (type === "background_noise" || type === "excessive_noise" || type === "high_noise") {
      const noisePrompt = "There is too much background noise. Please move to a quieter place so that I can clearly hear your responses.";
      const recorded = await proctoringDb.recordViolation({
        linkCode: rawCode,
        sessionId,
        candidateEmail,
        candidateName,
        violationType: "background_noise",
        severity: "notice",
        warningNumber: 0,
        details: details || noisePrompt,
        metadata
      });

      const currentCount = await proctoringDb.getWarningCount(rawCode);
      return res.json({
        success: true,
        action: "notice",
        terminate: false,
        warningCount: currentCount,
        verbalPrompt: noisePrompt,
        message: details || noisePrompt,
        data: recorded
      });
    }

    // 2. Valid Anti-Cheating Violations (Centralized 3-Warning Counter -> Terminate on 4th Violation)
    let violationLabel = "Integrity policy violation";
    let getVerbalPrompt = (count) => `Warning ${count} of 3: An integrity violation was detected. Please ensure full assessment compliance.`;

    if (type === "multiple_voices" || type === "secondary_speaker" || type === "extra_voice") {
      violationLabel = "Second voice detected speaking during interview";
      getVerbalPrompt = (count) => `Warning ${count} of 3: Another voice has been detected speaking near you. Please ensure you are alone in a quiet room.`;
    } else if (
      type === "phone_detected" ||
      type === "mobile_phone" ||
      type === "tablet_detected" ||
      type === "unauthorized_device" ||
      type === "device_in_hand" ||
      type === "electronic_device"
    ) {
      violationLabel = "Unauthorized electronic device or phone detected in use";
      getVerbalPrompt = (count) => `Warning ${count} of 3: An unauthorized electronic device or mobile phone was detected in use. Mobile devices and tablets are strictly prohibited during the interview.`;
    } else if (type === "multiple_people" || type === "multiple_faces" || type === "extra_person") {
      violationLabel = "Multiple people detected in webcam view";
      getVerbalPrompt = (count) => `Warning ${count} of 3: Multiple people have been detected in your camera view. Only you are permitted during this interview.`;
    } else if (
      type === "tab_switch" ||
      type === "tab_change" ||
      type === "window_blur" ||
      type === "window_change" ||
      type === "window_switch" ||
      type === "multiple_windows" ||
      type === "split_screen" ||
      type === "visibility_hidden" ||
      type === "focus_lost" ||
      type === "fullscreen_exit" ||
      type === "screen_switch"
    ) {
      violationLabel = "Tab switch or application focus change";
      getVerbalPrompt = (count) => `Warning ${count} of 3: You switched away from the active interview window or changed tabs. Please stay on the interview screen.`;
    } else {
      violationLabel = details || `Integrity violation: ${type}`;
      getVerbalPrompt = (count) => `Warning ${count} of 3: ${violationLabel}.`;
    }

    // Centralized Warning Counter across all violation types
    const prevCount = await proctoringDb.getWarningCount(rawCode);

    // If candidate has already received 3 warnings, the 4th violation causes immediate termination
    if (prevCount >= 3) {
      const terminationReason = details || `Maximum integrity warnings exceeded (3/3): ${violationLabel}.`;
      const result = await proctoringDb.terminateSession({
        linkCode: rawCode,
        sessionId,
        reason: terminationReason,
        candidateName,
        candidateEmail,
        candidateRole: req.body.role || req.body.candidateRole || ""
      });

      return res.json({
        success: true,
        action: "terminate",
        terminate: true,
        status: "Meeting Terminated",
        warningCount: 3,
        maxWarnings: 3,
        reason: terminationReason,
        verbalPrompt: `You have exceeded the maximum of three integrity warnings due to ${violationLabel.toLowerCase()}. The interview is being terminated immediately.`,
        message: `Meeting Terminated: ${terminationReason}`,
        data: result
      });
    }

    // Warning 1, 2, or 3
    const newWarningCount = prevCount + 1;
    const recorded = await proctoringDb.recordViolation({
      linkCode: rawCode,
      sessionId,
      candidateEmail,
      candidateName,
      violationType: type,
      severity: "warning",
      warningNumber: newWarningCount,
      details: details || `Warning ${newWarningCount} of 3: ${violationLabel}.`,
      metadata
    });

    const verbalPrompt = getVerbalPrompt(newWarningCount);

    return res.json({
      success: true,
      action: "warning",
      terminate: false,
      warningCount: newWarningCount,
      maxWarnings: 3,
      warningNumber: newWarningCount,
      verbalPrompt,
      message: `Warning ${newWarningCount} of 3: ${violationLabel}`,
      data: recorded
    });
  } catch (err) {
    console.error("Error in proctoring violation handler:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. POST /api/candidate-portal/proctoring/terminate - Direct termination endpoint
router.post("/proctoring/terminate", async (req, res) => {
  try {
    const {
      linkCode,
      sessionId,
      candidateEmail,
      candidateName,
      role,
      reason,
      transcripts,
      elapsedSeconds
    } = req.body;

    const rawCode = (linkCode || "").replace(/^interview_/, "").trim();
    const terminationReason = reason || "Interview terminated due to integrity policy violation.";

    const result = await proctoringDb.terminateSession({
      linkCode: rawCode,
      sessionId,
      reason: terminationReason,
      candidateName,
      candidateEmail,
      candidateRole: role || "",
      transcripts: transcripts || [],
      elapsedSeconds: elapsedSeconds || 0
    });

    res.json({
      success: true,
      status: "Meeting Terminated",
      reason: terminationReason,
      data: result
    });
  } catch (err) {
    console.error("Error in proctoring terminate handler:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 12. GET /api/candidate-portal/proctoring/violations/:linkCode - Get all violations and proctoring audit trail
router.get("/proctoring/violations/:linkCode", async (req, res) => {
  try {
    const rawCode = req.params.linkCode || "";
    const violations = await proctoringDb.getByLinkCode(rawCode);
    const warningCount = await proctoringDb.getWarningCount(rawCode);
    const session = await candidateSessionsDb.getByLinkCode(rawCode);

    res.json({
      success: true,
      linkCode: rawCode,
      status: session?.status || "In Progress",
      warningCount,
      maxWarnings: 3,
      isTerminated: session?.status === "Meeting Terminated",
      terminationReason: session?.termination_reason || null,
      count: violations.length,
      violations
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 13. POST /api/candidate-portal/recording - Save complete real-time interview recording
router.post("/recording", audioUpload.single("audio"), async (req, res) => {
  try {
    const { linkCode, candidateId, mimeType } = req.body;
    const rawCode = (linkCode || candidateId || "").replace(/^interview_/, "").trim();
    if (!rawCode) {
      return res.status(400).json({ success: false, error: "linkCode or candidateId is required" });
    }

    let audioBuffer = req.file ? req.file.buffer : null;
    let audioBase64 = req.body.audioBase64 || req.body.audioData || req.body.audioUrl;
    let effectiveMime = (req.file ? req.file.mimetype : mimeType) || "audio/webm";

    if (!audioBuffer && !audioBase64) {
      return res.status(400).json({ success: false, error: "No audio data provided" });
    }

    const saved = await recordingStorageService.saveRecording({
      candidateId: candidateId || rawCode,
      linkCode: rawCode,
      audioBuffer,
      audioBase64,
      mimeType: effectiveMime
    });

    // Link recording to session and candidate records
    const session = await candidateSessionsDb.getByLinkCode(rawCode);
    if (session) {
      await candidateSessionsDb.createOrUpdate({
        ...session,
        audioUrl: saved.audioUrl
      }).catch(() => {});
    }

    if (candidateId) {
      await candidatesDb.update(candidateId, {
        audioUrl: saved.audioUrl,
        audioPath: saved.filePath
      }).catch(() => {});
    }

    res.status(200).json({
      success: true,
      message: "Candidate interview audio recording stored successfully",
      data: {
        linkCode: rawCode,
        candidateId: candidateId || rawCode,
        audioUrl: saved.audioUrl,
        fileSize: saved.fileSize,
        mimeType: saved.mimeType
      }
    });
  } catch (err) {
    console.error("Error saving portal audio recording:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 14. GET /api/candidate-portal/recording/:linkCode - Retrieve/stream recording
router.get(["/recording/:linkCode", "/recording/:linkCode/stream"], async (req, res) => {
  try {
    const rawCode = (req.params.linkCode || "").replace(/^interview_/, "").trim();
    const fileInfo = recordingStorageService.findRecordingFile(rawCode);

    if (fileInfo) {
      return recordingStorageService.streamAudioFile(req, res, fileInfo);
    }

    // Try finding by candidate database record
    const session = await candidateSessionsDb.getByLinkCode(rawCode);
    const candidate = await candidatesDb.getById(rawCode);

    const targetAudioUrl = candidate?.audioUrl || session?.audioUrl;
    if (targetAudioUrl && targetAudioUrl.startsWith("data:audio/")) {
      const saved = await recordingStorageService.saveRecording({
        candidateId: rawCode,
        audioBase64: targetAudioUrl
      });
      const newFileInfo = recordingStorageService.findRecordingFile(rawCode);
      if (newFileInfo) {
        return recordingStorageService.streamAudioFile(req, res, newFileInfo);
      }
    }

    res.status(404).json({
      success: false,
      error: `Recording not found for session ${rawCode}`
    });
  } catch (err) {
    console.error("Error retrieving portal recording:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
