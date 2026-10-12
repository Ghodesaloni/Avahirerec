const express = require("express");
const router = express.Router();
const emailCenterDb = require("../db/emailCenterDb");
const emailService = require("../services/emailService");
const postgresDb = require("../db/postgres");
const { requireAuth } = require("../middleware/authMiddleware");

// GET /api/emails/templates - get templates
router.get("/templates", requireAuth, (req, res) => {
  try {
    const templates = emailCenterDb.getTemplates();
    res.json({ success: true, data: templates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/emails/templates - create template
router.post("/templates", requireAuth, (req, res) => {
  try {
    const newTemplate = emailCenterDb.createTemplate(req.body);
    res.status(201).json({ success: true, data: newTemplate, message: "Template created" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/emails/status - verify active SMTP connection status
router.get("/status", requireAuth, async (_req, res) => {
  try {
    const status = await emailService.verifySmtpConnection();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/emails/sent - sent emails are not shown in Email Center
router.get("/sent", requireAuth, async (_req, res) => {
  res.json({ success: true, data: [], message: "Sent emails are not shown in Email Center" });
});

// GET /api/emails/smtp-all - sent emails are not shown in Email Center
router.get("/smtp-all", requireAuth, async (_req, res) => {
  res.json({ success: true, data: [], count: 0 });
});

// POST /api/emails/send - send an email via AWS SES / SMTP without displaying in Email Center
router.post("/send", requireAuth, async (req, res) => {
  try {
    const { recipient, recipientName, subject, body, templateId } = req.body;
    if (!recipient) {
      return res.status(400).json({ success: false, error: "Recipient email is required" });
    }

    const authorEmail = req.user.email;
    const authorId = req.user.id;

    // Deliver via AWS SES / SMTP
    const sendResult = await emailService.sendCommunicationEmail({
      toEmail: recipient,
      recipientName: recipientName || "Candidate",
      subject: subject || "Update on your application",
      body: body || "",
      senderEmail: authorEmail,
      templateId,
    });

    // Update template use count if a template was used
    if (templateId) {
      emailCenterDb.storeSmtpEmail({ templateId });
    }

    res.status(200).json({
      success: true,
      data: {
        recipient,
        recipientName: recipientName || "Candidate",
        subject: subject || "Update on your application",
        status: "Dispatched",
        sentAt: "Just now",
      },
      mode: sendResult.mode,
      message: "Email dispatched successfully",
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const automatedEmailService = require("../services/automatedEmailService");

// GET /api/emails/automated-logs - delivery history for automated emails scoped to authenticated recruiter
router.get("/automated-logs", requireAuth, (req, res) => {
  try {
    const logs = automatedEmailService.getAutomatedEmailLogs();
    const userLogs = logs.filter(l => {
      const hEmail = (l.hrEmail || l.userEmail || "").toLowerCase().trim();
      return !hEmail || hEmail === req.user.email;
    });
    res.json({ success: true, count: userLogs.length, data: userLogs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/emails/trigger-automated - manually or programmatically invoke an automated email trigger
router.post("/trigger-automated", requireAuth, async (req, res) => {
  try {
    const { triggerType, candidate, interview, company, jobTitle } = req.body;
    const hrEmail = req.body.hrEmail || req.user.email;
    const hrName = req.body.hrName || req.user.name;
    let result = null;

    switch (triggerType) {
      case "candidate_shortlisted":
        result = await automatedEmailService.sendCandidateShortlistedEmail({ candidate, hrEmail, hrName, company, jobTitle, req });
        break;
      case "interview_scheduled":
        result = await automatedEmailService.sendInterviewScheduledEmail({ interview, hrEmail, hrName, company, req });
        break;
      case "interview_reminder_1h":
        result = await automatedEmailService.sendInterviewReminderEmail({ interview, hrEmail, hrName, company, req });
        break;
      case "candidate_congratulations":
        result = await automatedEmailService.sendCongratulationsEmail({ candidate, hrEmail, hrName, company, jobTitle, req });
        break;
      default:
        return res.status(400).json({ success: false, error: `Invalid triggerType: ${triggerType}. Expected one of: candidate_shortlisted, interview_scheduled, interview_reminder_1h, candidate_congratulations` });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

