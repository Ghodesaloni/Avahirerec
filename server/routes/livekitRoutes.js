const express = require("express");
const router = express.Router();
const { AccessToken, RoomAgentDispatch, RoomConfiguration } = require("livekit-server-sdk");
const candidateSessionsDb = require("../db/candidateSessionsDb");
const interviewsDb = require("../db/interviewsDb");
const resumesDb = require("../db/resumesDb");
const candidatesDb = require("../db/candidatesDb");
const settingsDb = require("../db/settingsDb");
const { analyzeCandidateResumeForAgent } = require("../services/resumeQuestionService");

// Token generation endpoint for Candidate Live Interview & AI Agent Connection
router.all("/token", async (req, res) => {
  try {
    const API_KEY = process.env.LIVEKIT_API_KEY || "APInMsF4Zfvtpf4";
    const API_SECRET = process.env.LIVEKIT_API_SECRET || "fDPrINGnzH8u4anxN0AtUecjsjQu0nKr6VtCCm4Vhgp";
    const LIVEKIT_URL = process.env.LIVEKIT_URL || "wss://avahire-interview-odja2ewy.livekit.cloud";
    const AGENT_NAME = process.env.AGENT_NAME || "my-agent";

    const body = req.method === "POST" ? (req.body || {}) : (req.query || {});

    // Resolve room code
    const rawCode = body.code || body.room_name || body.room || body.linkCode || "akc123";
    const roomCode = String(rawCode).replace(/^interview_/, "").trim();
    const roomName = `interview_${roomCode}`;

    // Lookup session and interview from database to hydrate candidate identity
    let session = await candidateSessionsDb.getByLinkCode(roomCode);
    let scheduledInterview = await interviewsDb.getByLinkCode(roomCode);
    if (!scheduledInterview && session?.id) {
      scheduledInterview = await interviewsDb.getById(session.id).catch(() => null);
    }

    const allResumes = resumesDb.getAll() || [];
    let allCandidates = [];
    try {
      allCandidates = (await candidatesDb.getAll()) || [];
    } catch (e) {
      allCandidates = [];
    }

    const targetEmail = (session?.candidateEmail || scheduledInterview?.email || body.email || "").toLowerCase().trim();
    const targetName = (session?.candidateName || scheduledInterview?.name || body.participant_name || body.name || "").toLowerCase().trim();
    const targetId = session?.resumeId || scheduledInterview?.candidateId || scheduledInterview?.resumeId || null;

    // Search resumesDb and candidatesDb for rich resume data (projects, skills, raw text, etc.)
    let matchedResume = null;
    if (targetEmail) {
      matchedResume = allResumes.find(r => r.email && r.email.toLowerCase().trim() === targetEmail);
      if (!matchedResume) {
        matchedResume = allCandidates.find(c => c.email && c.email.toLowerCase().trim() === targetEmail);
      }
    }
    if (!matchedResume && targetId) {
      matchedResume = allResumes.find(r => r.id === targetId) || allCandidates.find(c => c.id === targetId);
    }
    if (!matchedResume && targetName && targetName !== "candidate") {
      matchedResume = allResumes.find(r => r.name && r.name.toLowerCase().trim() === targetName) ||
                      allCandidates.find(c => c.name && c.name.toLowerCase().trim() === targetName);
    }
    if (!matchedResume) {
      // Fallback: pick the first resume with rich project data or candidate record
      matchedResume = allResumes.find(r => r.projects?.length > 0 || r.rawText) || allResumes[0] || allCandidates[0] || null;
    }

    // Merge candidate data sources for deep resume analysis
    const combinedCandidateData = {
      name: body.participant_name || body.name || session?.candidateName || scheduledInterview?.name || matchedResume?.name || "Candidate",
      email: targetEmail || matchedResume?.email || "",
      phone: session?.candidatePhone || scheduledInterview?.phone || matchedResume?.phone || "",
      role: session?.role || scheduledInterview?.role || matchedResume?.role || matchedResume?.targetJobTitle || "Senior Full Stack Engineer",
      company: session?.company || scheduledInterview?.company || "AvaHire Technologies Pvt. Ltd.",
      skills: session?.skills || matchedResume?.skills || matchedResume?.allSkills || ["Full Stack", "JavaScript", "React", "Node.js"],
      allSkills: matchedResume?.allSkills || session?.skills || ["Full Stack", "JavaScript", "React", "Node.js"],
      all_normalized_skills: matchedResume?.all_normalized_skills || [],
      categorizedSkills: matchedResume?.categorizedSkills || {},
      experience: session?.experience || matchedResume?.experience || (matchedResume?.expYears ? `${matchedResume.expYears} Years` : "3+ Years"),
      expYears: matchedResume?.expYears || 3,
      education: matchedResume?.education || matchedResume?.educationEntries || "Bachelor of Technology in Computer Science",
      educationEntries: matchedResume?.educationEntries || [],
      experienceEntries: matchedResume?.experienceEntries || [],
      certifications: matchedResume?.certifications || [],
      projects: matchedResume?.projects || session?.projects || [],
      rawText: matchedResume?.rawText || matchedResume?.raw_text || session?.rawText || "",
      summary: matchedResume?.summary || session?.summary || "",
      resumeFileName: matchedResume?.resumeFileName || session?.resumeFileName || null
    };

    // Retrieve effective interview settings for this recruiter / scheduled session
    const recruiterEmail = scheduledInterview?.recruiterEmail || scheduledInterview?.createdBy || session?.recruiterEmail || body.recruiterEmail || body.userEmail || req.headers["x-user-email"] || null;
    const ivSettings = await settingsDb.getInterviewSettingsAsync(recruiterEmail);

    // Deeply analyze candidate resume to extract projects, motivations, architectures, and targeted questions
    const resumeAnalysis = analyzeCandidateResumeForAgent(combinedCandidateData, scheduledInterview, ivSettings);

    const participantIdentity = body.participant_identity || body.identity || `cand_${roomCode}_${Math.floor(Math.random() * 100000)}`;

    // Build rich candidate session metadata for LiveKit Room and AI Agent
    const candidateMetadata = {
      linkCode: roomCode,
      candidateName: resumeAnalysis.candidateName,
      candidateEmail: resumeAnalysis.candidateEmail,
      candidatePhone: resumeAnalysis.candidatePhone,
      role: resumeAnalysis.candidateRole,
      company: resumeAnalysis.candidateCompany,
      skills: resumeAnalysis.skills,
      experience: resumeAnalysis.experience,
      education: resumeAnalysis.education,
      certifications: resumeAnalysis.certifications,
      projects: resumeAnalysis.projects,
      projectHighlights: resumeAnalysis.projectHighlights,
      resumeSummary: resumeAnalysis.resumeSummary,
      resumeFileName: resumeAnalysis.resumeFileName,
      rawText: resumeAnalysis.rawResumeSnippet,
      questions: resumeAnalysis.generatedQuestions,
      resumeAnalysis,
      interviewSettings: ivSettings,
      aiAvatar: ivSettings.aiAvatar || "Ava (Female)",
      difficulty: ivSettings.difficulty || "Medium",
      language: ivSettings.language || "English (US)",
      askFollowUps: ivSettings.askFollowUps !== false,
      proctoringSettings: {
        enableProctoring: ivSettings.enableProctoring !== false,
        faceDetection: ivSettings.faceDetection !== false,
        multiplePersonDetection: ivSettings.multiplePersonDetection !== false,
        tabSwitchDetection: ivSettings.tabSwitchDetection !== false,
        fullScreenMonitoring: ivSettings.fullScreenMonitoring !== false,
        suspiciousThreshold: ivSettings.suspiciousThreshold || "Medium"
      },
      scheduledDate: scheduledInterview?.date || "Today",
      scheduledTime: scheduledInterview?.time || "Scheduled Slot",
      duration: scheduledInterview?.duration || `${ivSettings.interviewDuration || 45} Minutes`,
      authenticated: true,
      timestamp: Date.now()
    };

    const metadataStr = JSON.stringify(candidateMetadata);

    const at = new AccessToken(API_KEY, API_SECRET, {
      identity: participantIdentity,
      name: resumeAnalysis.candidateName,
      metadata: metadataStr,
      ttl: "2h",
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
    });

    const roomConfig = new RoomConfiguration();
    if (AGENT_NAME) {
      roomConfig.agents = [new RoomAgentDispatch({ agentName: AGENT_NAME, metadata: metadataStr })];
    }
    at.roomConfig = roomConfig;

    const participantToken = await at.toJwt();

    // Update session state in database to reflect room entry with verified resume data
    if (session) {
      await candidateSessionsDb.createOrUpdate({
        ...session,
        linkCode: roomCode,
        status: "In Live Interview",
        projects: resumeAnalysis.projects,
        skills: resumeAnalysis.skills,
        experience: resumeAnalysis.experience,
        questions: resumeAnalysis.generatedQuestions,
        startedAt: session.startedAt || new Date().toISOString()
      }).catch(err => console.warn("Live room session state update notice:", err.message));
    }

    if (scheduledInterview && scheduledInterview.status === "Scheduled") {
      await interviewsDb.update(scheduledInterview.id, { status: "Active" })
        .catch(err => console.warn("Live room interview status update notice:", err.message));
    }

    return res.json({
      success: true,
      serverUrl: LIVEKIT_URL,
      roomName,
      roomCode,
      participantName: resumeAnalysis.candidateName,
      participantIdentity,
      participantToken,
      metadata: candidateMetadata,
      agentName: AGENT_NAME,
      projects: resumeAnalysis.projects,
      questions: resumeAnalysis.generatedQuestions,
      resumeAnalysis
    });
  } catch (error) {
    console.error("Error generating LiveKit token:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to generate interview room token",
      details: error.message,
    });
  }
});

// GET /api/livekit/status - Check LiveKit configuration and agent status
router.get("/status", (req, res) => {
  const isConfigured = Boolean(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_URL);
  res.json({
    success: true,
    configured: isConfigured,
    serverUrl: process.env.LIVEKIT_URL || "wss://avahire-interview-odja2ewy.livekit.cloud",
    agentName: process.env.AGENT_NAME || "my-agent",
    service: "LiveKit Realtime Agent Service"
  });
});

// GET /api/livekit/session-info/:code - Get candidate live room context with resume analysis
router.get("/session-info/:code", async (req, res) => {
  try {
    const rawCode = req.params.code || "";
    const linkCode = rawCode.replace(/^interview_/, "").trim();
    const session = await candidateSessionsDb.getByLinkCode(linkCode);
    const scheduled = await interviewsDb.getByLinkCode(linkCode);
    
    const allResumes = resumesDb.getAll() || [];
    const targetEmail = (session?.candidateEmail || scheduled?.email || "").toLowerCase().trim();
    const targetName = (session?.candidateName || scheduled?.name || "").toLowerCase().trim();
    
    let matchedResume = null;
    if (targetEmail) {
      matchedResume = allResumes.find(r => r.email && r.email.toLowerCase().trim() === targetEmail);
    }
    if (!matchedResume && targetName && targetName !== "candidate") {
      matchedResume = allResumes.find(r => r.name && r.name.toLowerCase().trim() === targetName);
    }
    if (!matchedResume) {
      matchedResume = allResumes[0] || null;
    }

    const combinedCandidateData = {
      name: session?.candidateName || scheduled?.name || matchedResume?.name || "Candidate",
      email: targetEmail || matchedResume?.email || "",
      phone: session?.candidatePhone || scheduled?.phone || matchedResume?.phone || "",
      role: session?.role || scheduled?.role || matchedResume?.role || matchedResume?.targetJobTitle || "Senior Full Stack Engineer",
      company: session?.company || scheduled?.company || "AvaHire Technologies Pvt. Ltd.",
      skills: session?.skills || matchedResume?.skills || matchedResume?.allSkills || ["Full Stack", "JavaScript", "React", "Node.js"],
      allSkills: matchedResume?.allSkills || session?.skills || [],
      experience: session?.experience || matchedResume?.experience || "3+ Years",
      education: matchedResume?.education || "Bachelor of Technology",
      certifications: matchedResume?.certifications || [],
      projects: matchedResume?.projects || session?.projects || [],
      rawText: matchedResume?.rawText || session?.rawText || "",
      summary: matchedResume?.summary || session?.summary || "",
      resumeFileName: matchedResume?.resumeFileName || session?.resumeFileName || null
    };

    const recruiterEmail = scheduled?.recruiterEmail || scheduled?.createdBy || session?.recruiterEmail || req.headers["x-user-email"] || null;
    const ivSettings = await settingsDb.getInterviewSettingsAsync(recruiterEmail);

    const resumeAnalysis = analyzeCandidateResumeForAgent(combinedCandidateData, scheduled, ivSettings);

    res.json({
      success: true,
      data: {
        linkCode,
        roomName: `interview_${linkCode}`,
        candidateName: resumeAnalysis.candidateName,
        candidateEmail: resumeAnalysis.candidateEmail,
        role: resumeAnalysis.candidateRole,
        company: resumeAnalysis.candidateCompany,
        skills: resumeAnalysis.skills,
        experience: resumeAnalysis.experience,
        projects: resumeAnalysis.projects,
        projectHighlights: resumeAnalysis.projectHighlights,
        questions: resumeAnalysis.generatedQuestions,
        resumeAnalysis,
        interviewSettings: ivSettings,
        status: session?.status || scheduled?.status || "Ready"
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
