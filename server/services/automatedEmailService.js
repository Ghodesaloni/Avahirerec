const { readData, writeData } = require("../db/dbEngine");
const emailCenterDb = require("../db/emailCenterDb");
const emailService = require("./emailService");
const interviewsDb = require("../db/interviewsDb");
const resumesDb = require("../db/resumesDb");
const candidatesDb = require("../db/candidatesDb");
const jobsDb = require("../db/jobsDb");
const { getPool, getUserByEmail } = require("../db/postgres");
const settingsDb = require("../db/settingsDb");

const LOGS_COLLECTION = "email_automated_logs";

/**
 * Parses date and time strings into a JavaScript Date object
 */
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

/**
 * Resolves HR User profile info (Name, Email, Company, Designation)
 */
async function resolveHrUser(emailHint, req) {
  let targetEmail = (
    emailHint ||
    req?.headers?.["x-user-email"] ||
    req?.body?.userEmail ||
    req?.body?.createdBy ||
    process.env.SMTP_USER ||
    ""
  ).toLowerCase().trim();

  // Try PostgreSQL lookup
  if (targetEmail) {
    try {
      const pgUser = await getUserByEmail(targetEmail);
      if (pgUser) {
        return {
          name: pgUser.name || "HR Manager",
          email: pgUser.email,
          company: pgUser.company || "AvaHire Talent AI",
          designation: pgUser.designation || pgUser.role || "Talent Acquisition Lead",
          phone: pgUser.phone || "+91 98765 43210"
        };
      }
    } catch (_) {}
  }

  // Fallback to in-memory/JSON users collection
  try {
    const users = readData("users", []);
    const user = targetEmail
      ? users.find(u => (u.email && u.email.toLowerCase().trim() === targetEmail) || u.uid === targetEmail)
      : users[0];

    if (user) {
      return {
        name: user.name || "HR Manager",
        email: user.email || targetEmail || "hr@avahire.ai",
        company: user.company || "AvaHire Talent AI",
        designation: user.designation || user.role || "Talent Acquisition Lead",
        phone: user.phone || "+91 98765 43210"
      };
    }
  } catch (_) {}

  return {
    name: "HR Manager",
    email: targetEmail || process.env.SMTP_USER || "hr@avahire.ai",
    company: "AvaHire Talent AI",
    designation: "Talent Acquisition Lead",
    phone: "+91 98765 43210"
  };
}

/**
 * Resolves the appropriate Email Center template dynamically
 */
function getTemplateForTrigger(triggerType) {
  const templates = emailCenterDb.getTemplates() || [];

  switch (triggerType) {
    case "candidate_shortlisted": {
      // Find Shortlist Confirmation template (ID 2 or category Status / matching name)
      const found = templates.find(t => 
        (t.category === "Status" && /shortlist/i.test(t.name)) ||
        t.id === 2 ||
        /shortlist/i.test(t.name)
      );
      return found || {
        id: 2,
        name: "Shortlist Confirmation",
        subject: "Great news! You've been shortlisted for {{role}} at {{company}}",
        body: "Dear {{candidateName}},\n\nCongratulations! Your profile has been shortlisted for the next stage of our recruitment process for {{role}} at {{company}}.\n\nOur Talent Acquisition team will be in touch shortly with interview scheduling details.\n\nWarm regards,\n{{hrName}}\n{{company}}"
      };
    }
    case "interview_scheduled": {
      // Find Interview Invitation template (ID 1 or category Interview)
      const found = templates.find(t => 
        (t.category === "Interview" && /invitation|interview/i.test(t.name)) ||
        t.id === 1 ||
        /interview/i.test(t.name)
      );
      return found || {
        id: 1,
        name: "Interview Invitation",
        subject: "You're invited to interview for {{role}} at {{company}}",
        body: "Hi {{candidateName}},\n\nWe were very impressed by your background and would like to invite you for an AI-powered technical interview for the {{role}} position.\n\nScheduled Date: {{interviewDate}}\nScheduled Time: {{interviewTime}}\nDuration: {{duration}}\n\nPlease join using your personalized link:\n{{interviewLink}}\n\nBest regards,\n{{hrName}}\n{{company}}"
      };
    }
    case "interview_reminder_1h": {
      // Find Interview Invitation / Reminder template
      const found = templates.find(t => 
        /reminder/i.test(t.name) ||
        (t.category === "Interview" && /invitation|interview/i.test(t.name)) ||
        t.id === 1
      );
      if (found) {
        return {
          ...found,
          subject: found.subject.startsWith("Reminder:") ? found.subject : `Reminder: Upcoming AI Interview for {{role}} at {{company}}`
        };
      }
      return {
        id: 1,
        name: "Interview Reminder",
        subject: "Reminder: Your AI Interview for {{role}} starts in 1 hour - {{company}}",
        body: "Hi {{candidateName}},\n\nThis is a friendly reminder that your AI-powered interview for {{role}} at {{company}} is scheduled in 1 hour.\n\nScheduled Time: {{interviewTime}} ({{interviewDate}})\nDuration: {{duration}}\n\nPlease join your interview room using the link below:\n{{interviewLink}}\n\nPlease ensure your camera and microphone are tested before joining.\n\nBest regards,\n{{hrName}}\n{{company}}"
      };
    }
    case "candidate_congratulations": {
      // Find Offer Letter / Selection template (ID 4 or category Offer)
      const found = templates.find(t => 
        t.category === "Offer" ||
        t.id === 4 ||
        /offer|congratulation|select/i.test(t.name)
      );
      return found || {
        id: 4,
        name: "Offer Letter",
        subject: "Congratulations! Official Selection & Offer for {{role}} at {{company}}",
        body: "Dear {{candidateName}},\n\nOn behalf of {{company}}, we are thrilled to congratulate you on your successful interview performance for {{role}}! We were deeply impressed by your skills and would love to welcome you aboard.\n\nOur HR team will reach out with the onboarding documentation.\n\nWelcome aboard,\n{{hrName}}\n{{company}}"
      };
    }
    default:
      return templates[0] || {
        id: 1,
        name: "General Notification",
        subject: "Update from {{company}} regarding {{role}}",
        body: "Hello {{candidateName}},\n\nThank you for applying for {{role}} at {{company}}.\n\nBest regards,\n{{hrName}}\n{{company}}"
      };
  }
}

/**
 * Replaces template variables dynamically (case-insensitive for both {var} and {{var}})
 */
function replaceTemplateVariables(text, vars = {}) {
  if (!text) return "";
  let result = String(text);

  const replacements = {
    candidateName: vars.candidateName || vars.name || "Candidate",
    name: vars.candidateName || vars.name || "Candidate",
    candidateEmail: vars.candidateEmail || vars.email || "",
    role: vars.role || vars.jobTitle || "Software Engineer",
    jobTitle: vars.jobTitle || vars.role || "Software Engineer",
    company: vars.company || vars.companyName || "AvaHire",
    companyName: vars.companyName || vars.company || "AvaHire",
    hrName: vars.hrName || "Talent Acquisition Team",
    hrEmail: vars.hrEmail || "",
    interviewDate: vars.interviewDate || vars.date || "Scheduled Date",
    date: vars.date || vars.interviewDate || "Scheduled Date",
    interviewTime: vars.interviewTime || vars.time || "Scheduled Time",
    time: vars.time || vars.interviewTime || "Scheduled Time",
    duration: vars.duration || "45 Minutes",
    interviewLink: vars.interviewLink || vars.portalLink || "",
    portalLink: vars.portalLink || vars.interviewLink || ""
  };

  for (const [key, value] of Object.entries(replacements)) {
    const valStr = String(value || "");
    // Match {{key}} or {key}
    const doubleCurly = new RegExp(`{{\\s*${key}\\s*}}`, "gi");
    const singleCurly = new RegExp(`{\\s*${key}\\s*}`, "gi");
    result = result.replace(doubleCurly, valStr).replace(singleCurly, valStr);
  }

  return result;
}

/**
 * Formats a clean, responsive HTML email matching AvaHire design aesthetics
 */
function formatAutomatedEmailHtml({
  subject,
  body,
  candidateName,
  hrName,
  hrEmail,
  company,
  role,
  interviewLink,
  interviewDate,
  interviewTime,
  duration,
  triggerType
}) {
  const formattedBody = (body || "").replace(/\n/g, "<br>");

  const ctaButtonHtml = interviewLink ? `
    <div style="text-align: center; margin: 32px 0;">
      <a href="${interviewLink}" style="display: inline-block; background-color: #7c3aed; color: #ffffff !important; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 36px; border-radius: 12px; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.35); letter-spacing: 0.02em;" target="_blank">
        ${triggerType === "interview_reminder_1h" ? "Enter Live Interview Room" : "Join AI Interview Room"}
      </a>
    </div>
  ` : "";

  const interviewDetailsBox = (interviewDate || interviewTime || interviewLink) ? `
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 24px 0;">
      <div style="font-size: 12px; font-weight: 700; color: #7c3aed; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">Interview Details</div>
      ${role ? `<div style="font-size: 14px; color: #1e293b; margin-bottom: 6px;"><strong>Position:</strong> ${role}</div>` : ""}
      ${interviewDate ? `<div style="font-size: 14px; color: #1e293b; margin-bottom: 6px;"><strong>Date:</strong> ${interviewDate}</div>` : ""}
      ${interviewTime ? `<div style="font-size: 14px; color: #1e293b; margin-bottom: 6px;"><strong>Time:</strong> ${interviewTime}</div>` : ""}
      ${duration ? `<div style="font-size: 14px; color: #1e293b; margin-bottom: 6px;"><strong>Duration:</strong> ${duration}</div>` : ""}
      ${interviewLink ? `<div style="font-size: 13px; color: #475569; margin-top: 10px; word-break: break-all;"><strong>Direct Link:</strong> <a href="${interviewLink}" style="color: #7c3aed;">${interviewLink}</a></div>` : ""}
    </div>
  ` : "";

  let badgeText = "Official Notification";
  let badgeBg = "#f1f5f9";
  let badgeColor = "#475569";

  if (triggerType === "candidate_shortlisted") {
    badgeText = "✓ Application Shortlisted";
    badgeBg = "#ecfdf5";
    badgeColor = "#059669";
  } else if (triggerType === "interview_scheduled") {
    badgeText = "📅 Interview Scheduled";
    badgeBg = "#ede9fe";
    badgeColor = "#7c3aed";
  } else if (triggerType === "interview_reminder_1h") {
    badgeText = "⏰ 1-Hour Reminder";
    badgeBg = "#fef3c7";
    badgeColor = "#d97706";
  } else if (triggerType === "candidate_congratulations") {
    badgeText = "🎉 Congratulations - Candidate Selected";
    badgeBg = "#ecfdf5";
    badgeColor = "#059669";
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b; }
        .container { max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%); padding: 32px; text-align: center; color: white; }
        .header h1 { margin: 0 0 6px 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
        .header p { margin: 0; font-size: 14px; opacity: 0.9; }
        .content { padding: 36px 32px; }
        .badge { display: inline-block; padding: 6px 14px; background-color: ${badgeBg}; color: ${badgeColor}; border-radius: 9999px; font-size: 12px; font-weight: 700; margin-bottom: 20px; }
        .body-text { font-size: 15px; line-height: 1.7; color: #334155; margin-bottom: 24px; }
        .sender-box { background-color: #f8fafc; border-left: 4px solid #7c3aed; padding: 14px 18px; border-radius: 6px; font-size: 13px; color: #475569; margin-top: 28px; }
        .footer { background-color: #f8fafc; padding: 20px 32px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${company || "AvaHire"}</h1>
          <p>AI-Powered Talent Acquisition</p>
        </div>
        <div class="content">
          <div class="badge">${badgeText}</div>
          <div class="body-text">
            ${formattedBody}
          </div>

          ${interviewDetailsBox}
          ${ctaButtonHtml}

          <div class="sender-box">
            Sent by <strong>${hrName || "Talent Acquisition Team"}</strong> (${hrEmail || "HR Department"})<br>
            <span style="font-size: 12px; color: #64748b;">${company || "AvaHire"} Recruitment Portal</span>
          </div>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} ${company || "AvaHire"}. All rights reserved.<br>
          Automated recruitment notification sent to: <strong>${candidateName}</strong>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Checks if an automated email was already sent (deduplication check)
 */
function isAlreadySent(idempotencyKey) {
  if (!idempotencyKey) return false;
  const logs = readData(LOGS_COLLECTION, []);
  return logs.some(log => log.idempotencyKey === idempotencyKey && log.status === "sent");
}

/**
 * Records an automated email delivery log in the backend
 */
function recordAutomatedEmailLog(logData) {
  const logs = readData(LOGS_COLLECTION, []);
  const newLog = {
    id: `auto-email-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    triggerType: logData.triggerType,
    idempotencyKey: logData.idempotencyKey,
    recipientEmail: logData.recipientEmail,
    recipientName: logData.recipientName,
    senderEmail: logData.senderEmail,
    senderName: logData.senderName,
    subject: logData.subject,
    templateId: logData.templateId,
    status: logData.status || "sent",
    mode: logData.mode || "live_smtp",
    messageId: logData.messageId || null,
    error: logData.error || null,
    metadata: logData.metadata || {},
    sentAt: new Date().toISOString()
  };

  logs.unshift(newLog);
  // Keep last 1000 logs
  if (logs.length > 1000) logs.length = 1000;
  writeData(LOGS_COLLECTION, logs);

  // Update template usage count if templateId is present
  if (logData.templateId && logData.status === "sent") {
    emailCenterDb.storeSmtpEmail({ templateId: logData.templateId });
  }

  return newLog;
}

/**
 * Returns all automated email delivery logs
 */
function getAutomatedEmailLogs() {
  return readData(LOGS_COLLECTION, []);
}

/**
 * Helper to construct base URL for candidate portal links
 */
function getBaseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (req) {
    const host = req.get ? req.get("host") : (req.headers?.host || "localhost:3000");
    const protocol = req.protocol || (req.secure ? "https" : "http");
    return `${protocol}://${host}`;
  }
  return "http://localhost:3000";
}

// ============================================================================
// THE 4 AUTOMATED EMAIL TRIGGERS
// ============================================================================

/**
 * TRIGGER 1: Candidate Shortlisted Email
 * Trigger when HR shortlists a candidate from Resume/Candidate page.
 */
async function sendCandidateShortlistedEmail({ candidate, hrEmail, hrName, company, jobTitle, req }) {
  try {
    if (!candidate || (!candidate.email && !candidate.candidateEmail)) {
      console.warn("[AUTOMATED-EMAIL] Shortlist email skipped: Candidate has no email address.");
      return { success: false, error: "Missing candidate email" };
    }

    const recipientEmail = (candidate.email || candidate.candidateEmail).toLowerCase().trim();
    const candidateName = candidate.name || candidate.candidateName || "Candidate";
    const candidateId = candidate.id || candidate.candidateId || recipientEmail;

    // Resolve HR profile
    const hr = await resolveHrUser(hrEmail || candidate.userEmail || candidate.createdBy, req);
    const resolvedCompany = company || candidate.company || hr.company || "AvaHire";
    const resolvedJobTitle = jobTitle || candidate.targetJobTitle || candidate.role || "Target Role";

    // Idempotency key: prevents duplicate shortlist emails for same candidate & job
    const idempotencyKey = `shortlisted_${candidateId}_${resolvedJobTitle.replace(/\s+/g, "_").toLowerCase()}`;
    if (isAlreadySent(idempotencyKey)) {
      console.log(`[AUTOMATED-EMAIL] Duplicate shortlist email skipped for ${recipientEmail} (key: ${idempotencyKey})`);
      return { success: true, duplicate: true, message: "Duplicate prevented" };
    }

    // Resolve Email Center template
    const template = getTemplateForTrigger("candidate_shortlisted");

    const templateVars = {
      candidateName,
      candidateEmail: recipientEmail,
      role: resolvedJobTitle,
      jobTitle: resolvedJobTitle,
      company: resolvedCompany,
      companyName: resolvedCompany,
      hrName: hr.name,
      hrEmail: hr.email
    };

    const finalSubject = replaceTemplateVariables(template.subject, templateVars);
    const finalBody = replaceTemplateVariables(template.body, templateVars);

    const htmlContent = formatAutomatedEmailHtml({
      subject: finalSubject,
      body: finalBody,
      candidateName,
      hrName: hr.name,
      hrEmail: hr.email,
      company: resolvedCompany,
      role: resolvedJobTitle,
      triggerType: "candidate_shortlisted"
    });

    const senderAddress = `"${hr.name} (${resolvedCompany})" <${hr.email}>`;

    const dispatchResult = await emailService.dispatchEmail({
      to: recipientEmail,
      subject: finalSubject,
      html: htmlContent,
      text: finalBody,
      from: senderAddress,
      replyTo: hr.email,
      type: "Candidate Shortlisted",
      recipientName: candidateName,
      userEmail: hr.email,
      templateId: template.id,
      metadata: { trigger: "candidate_shortlisted", candidateId, jobTitle: resolvedJobTitle }
    });

    recordAutomatedEmailLog({
      triggerType: "candidate_shortlisted",
      idempotencyKey,
      recipientEmail,
      recipientName: candidateName,
      senderEmail: hr.email,
      senderName: hr.name,
      subject: finalSubject,
      templateId: template.id,
      status: dispatchResult.success ? "sent" : "failed",
      mode: dispatchResult.mode,
      messageId: dispatchResult.messageId,
      metadata: { candidateId, jobTitle: resolvedJobTitle }
    });

    console.log(`[AUTOMATED-EMAIL] ✓ Shortlist confirmation email sent to ${recipientEmail} from ${hr.email}`);
    return { success: true, dispatchResult };
  } catch (err) {
    console.error("[AUTOMATED-EMAIL] Error sending shortlist email:", err);
    recordAutomatedEmailLog({
      triggerType: "candidate_shortlisted",
      idempotencyKey: `shortlisted_err_${candidate?.id || Date.now()}`,
      recipientEmail: candidate?.email || "unknown",
      recipientName: candidate?.name || "Candidate",
      senderEmail: hrEmail || "unknown",
      senderName: hrName || "HR",
      subject: "Shortlist Email Failed",
      status: "failed",
      error: err.message
    });
    return { success: false, error: err.message };
  }
}

/**
 * TRIGGER 2: Interview Scheduled Email
 * Trigger after HR schedules an interview and the interview link is successfully generated.
 */
async function sendInterviewScheduledEmail({ interview, hrEmail, hrName, company, req }) {
  try {
    if (!interview || (!interview.email && !interview.candidateEmail)) {
      console.warn("[AUTOMATED-EMAIL] Interview scheduled email skipped: Missing candidate email.");
      return { success: false, error: "Missing interview candidate email" };
    }

    const recipientEmail = (interview.email || interview.candidateEmail).toLowerCase().trim();
    const candidateName = interview.name || interview.candidateName || "Candidate";
    const interviewId = interview.id || `iv-${Date.now()}`;
    const linkCode = interview.linkCode || `ava${interviewId.replace(/\D/g, "").slice(-3) || "101"}`;

    const baseUrl = getBaseUrl(req);
    const interviewLink = `${baseUrl}/i/${linkCode}`;

    // Resolve HR profile
    const hr = await resolveHrUser(hrEmail || interview.userEmail || interview.createdBy, req);
    const resolvedCompany = company || interview.company || hr.company || "AvaHire";
    const resolvedRole = interview.role || interview.targetJobTitle || "Software Engineer";
    const interviewDate = interview.date || new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
    const interviewTime = interview.time || "11:00 AM IST";
    const duration = interview.duration || "45 Minutes";

    // Recruiter Interview Settings Enforcement: check if invitation email is enabled
    const ivSettings = settingsDb.getInterviewSettings(hr?.email || interview.userEmail || interview.createdBy);
    if (ivSettings && ivSettings.invitationEmail === false) {
      console.log(`[AUTOMATED-EMAIL] Interview invitation email disabled in settings for ${hr?.email || "recruiter"}`);
      return { success: true, skipped: true, message: "Interview invitation email disabled in settings" };
    }

    // Idempotency key: prevents duplicate scheduling emails for this interview
    const idempotencyKey = `interview_scheduled_${interviewId}_${linkCode}`;
    if (isAlreadySent(idempotencyKey)) {
      console.log(`[AUTOMATED-EMAIL] Duplicate interview scheduled email skipped for ${recipientEmail} (key: ${idempotencyKey})`);
      return { success: true, duplicate: true, message: "Duplicate prevented" };
    }

    // Resolve Email Center template
    const template = getTemplateForTrigger("interview_scheduled");

    const templateVars = {
      candidateName,
      candidateEmail: recipientEmail,
      role: resolvedRole,
      jobTitle: resolvedRole,
      company: resolvedCompany,
      companyName: resolvedCompany,
      hrName: hr.name,
      hrEmail: hr.email,
      interviewDate,
      date: interviewDate,
      interviewTime,
      time: interviewTime,
      duration,
      interviewLink,
      portalLink: interviewLink
    };

    const finalSubject = replaceTemplateVariables(template.subject, templateVars);
    const finalBody = replaceTemplateVariables(template.body, templateVars);

    const htmlContent = formatAutomatedEmailHtml({
      subject: finalSubject,
      body: finalBody,
      candidateName,
      hrName: hr.name,
      hrEmail: hr.email,
      company: resolvedCompany,
      role: resolvedRole,
      interviewLink,
      interviewDate,
      interviewTime,
      duration,
      triggerType: "interview_scheduled"
    });

    const senderAddress = `"${hr.name} (${resolvedCompany})" <${hr.email}>`;

    const dispatchResult = await emailService.dispatchEmail({
      to: recipientEmail,
      subject: finalSubject,
      html: htmlContent,
      text: `${finalBody}\n\nJoin link: ${interviewLink}`,
      from: senderAddress,
      replyTo: hr.email,
      type: "Interview Scheduled",
      recipientName: candidateName,
      userEmail: hr.email,
      templateId: template.id,
      metadata: { trigger: "interview_scheduled", interviewId, linkCode, interviewLink }
    });

    recordAutomatedEmailLog({
      triggerType: "interview_scheduled",
      idempotencyKey,
      recipientEmail,
      recipientName: candidateName,
      senderEmail: hr.email,
      senderName: hr.name,
      subject: finalSubject,
      templateId: template.id,
      status: dispatchResult.success ? "sent" : "failed",
      mode: dispatchResult.mode,
      messageId: dispatchResult.messageId,
      metadata: { interviewId, linkCode, interviewLink }
    });

    console.log(`[AUTOMATED-EMAIL] ✓ Interview scheduled email sent to ${recipientEmail} with link ${interviewLink}`);
    return { success: true, dispatchResult, interviewLink };
  } catch (err) {
    console.error("[AUTOMATED-EMAIL] Error sending interview scheduled email:", err);
    recordAutomatedEmailLog({
      triggerType: "interview_scheduled",
      idempotencyKey: `interview_scheduled_err_${interview?.id || Date.now()}`,
      recipientEmail: interview?.email || "unknown",
      recipientName: interview?.name || "Candidate",
      senderEmail: hrEmail || "unknown",
      senderName: hrName || "HR",
      subject: "Interview Scheduled Email Failed",
      status: "failed",
      error: err.message
    });
    return { success: false, error: err.message };
  }
}

/**
 * TRIGGER 3: Interview Reminder/Invitation Email (1 Hour Before)
 * Automatically send 1 hour before the scheduled interview time.
 */
async function sendInterviewReminderEmail({ interview, hrEmail, hrName, company, req }) {
  try {
    if (!interview || (!interview.email && !interview.candidateEmail)) {
      return { success: false, error: "Missing candidate email" };
    }

    const recipientEmail = (interview.email || interview.candidateEmail).toLowerCase().trim();
    const candidateName = interview.name || interview.candidateName || "Candidate";
    const interviewId = interview.id;
    const linkCode = interview.linkCode || `ava${String(interviewId).replace(/\D/g, "").slice(-3) || "101"}`;

    const baseUrl = getBaseUrl(req);
    const interviewLink = `${baseUrl}/i/${linkCode}`;

    // Idempotency key: prevents duplicate 1-hour reminders
    const idempotencyKey = `interview_reminder_1h_${interviewId}_${linkCode}`;
    if (isAlreadySent(idempotencyKey) || interview.reminderSent) {
      return { success: true, duplicate: true, message: "Reminder already dispatched" };
    }

    // Resolve HR profile
    const hr = await resolveHrUser(hrEmail || interview.userEmail || interview.createdBy, req);
    const resolvedCompany = company || interview.company || hr.company || "AvaHire";
    const resolvedRole = interview.role || interview.targetJobTitle || "Software Engineer";
    const interviewDate = interview.date || new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
    const interviewTime = interview.time || "11:00 AM IST";
    const duration = interview.duration || "45 Minutes";

    // Resolve Email Center template
    const template = getTemplateForTrigger("interview_reminder_1h");

    const templateVars = {
      candidateName,
      candidateEmail: recipientEmail,
      role: resolvedRole,
      jobTitle: resolvedRole,
      company: resolvedCompany,
      companyName: resolvedCompany,
      hrName: hr.name,
      hrEmail: hr.email,
      interviewDate,
      date: interviewDate,
      interviewTime,
      time: interviewTime,
      duration,
      interviewLink,
      portalLink: interviewLink
    };

    const finalSubject = replaceTemplateVariables(template.subject, templateVars);
    const finalBody = replaceTemplateVariables(template.body, templateVars);

    const htmlContent = formatAutomatedEmailHtml({
      subject: finalSubject,
      body: finalBody,
      candidateName,
      hrName: hr.name,
      hrEmail: hr.email,
      company: resolvedCompany,
      role: resolvedRole,
      interviewLink,
      interviewDate,
      interviewTime,
      duration,
      triggerType: "interview_reminder_1h"
    });

    const senderAddress = `"${hr.name} (${resolvedCompany})" <${hr.email}>`;

    const dispatchResult = await emailService.dispatchEmail({
      to: recipientEmail,
      subject: finalSubject,
      html: htmlContent,
      text: `${finalBody}\n\nDirect room link: ${interviewLink}`,
      from: senderAddress,
      replyTo: hr.email,
      type: "1-Hour Interview Reminder",
      recipientName: candidateName,
      userEmail: hr.email,
      templateId: template.id,
      metadata: { trigger: "interview_reminder_1h", interviewId, linkCode, interviewLink }
    });

    // Mark reminderSent in database
    try {
      await interviewsDb.update(interviewId, {
        reminderSent: true,
        reminderSentAt: new Date().toISOString()
      });
    } catch (_) {}

    recordAutomatedEmailLog({
      triggerType: "interview_reminder_1h",
      idempotencyKey,
      recipientEmail,
      recipientName: candidateName,
      senderEmail: hr.email,
      senderName: hr.name,
      subject: finalSubject,
      templateId: template.id,
      status: dispatchResult.success ? "sent" : "failed",
      mode: dispatchResult.mode,
      messageId: dispatchResult.messageId,
      metadata: { interviewId, linkCode, interviewLink }
    });

    console.log(`[AUTOMATED-EMAIL] ⏰ 1-Hour Interview reminder dispatched to ${recipientEmail} for interview ${interviewId}`);
    return { success: true, dispatchResult };
  } catch (err) {
    console.error("[AUTOMATED-EMAIL] Error sending 1-hour interview reminder:", err);
    return { success: false, error: err.message };
  }
}

/**
 * TRIGGER 4: Congratulations Email (Candidate Selection)
 * Trigger when HR clicks Select on candidate page after interview.
 */
async function sendCongratulationsEmail({ candidate, hrEmail, hrName, company, jobTitle, req }) {
  try {
    if (!candidate || (!candidate.email && !candidate.candidateEmail)) {
      console.warn("[AUTOMATED-EMAIL] Congratulations email skipped: Missing candidate email.");
      return { success: false, error: "Missing candidate email" };
    }

    const recipientEmail = (candidate.email || candidate.candidateEmail).toLowerCase().trim();
    const candidateName = candidate.name || candidate.candidateName || "Candidate";
    const candidateId = candidate.id || candidate.candidateId || recipientEmail;

    // Resolve HR profile
    const hr = await resolveHrUser(hrEmail || candidate.userEmail || candidate.createdBy, req);
    const resolvedCompany = company || candidate.company || hr.company || "AvaHire";
    const resolvedJobTitle = jobTitle || candidate.targetJobTitle || candidate.role || "Target Role";

    // Idempotency key: prevents duplicate congratulations emails
    const idempotencyKey = `congratulations_${candidateId}_${resolvedJobTitle.replace(/\s+/g, "_").toLowerCase()}`;
    if (isAlreadySent(idempotencyKey)) {
      console.log(`[AUTOMATED-EMAIL] Duplicate congratulations email skipped for ${recipientEmail} (key: ${idempotencyKey})`);
      return { success: true, duplicate: true, message: "Duplicate prevented" };
    }

    // Resolve Email Center template
    const template = getTemplateForTrigger("candidate_congratulations");

    const templateVars = {
      candidateName,
      candidateEmail: recipientEmail,
      role: resolvedJobTitle,
      jobTitle: resolvedJobTitle,
      company: resolvedCompany,
      companyName: resolvedCompany,
      hrName: hr.name,
      hrEmail: hr.email
    };

    const finalSubject = replaceTemplateVariables(template.subject, templateVars);
    const finalBody = replaceTemplateVariables(template.body, templateVars);

    const htmlContent = formatAutomatedEmailHtml({
      subject: finalSubject,
      body: finalBody,
      candidateName,
      hrName: hr.name,
      hrEmail: hr.email,
      company: resolvedCompany,
      role: resolvedJobTitle,
      triggerType: "candidate_congratulations"
    });

    const senderAddress = `"${hr.name} (${resolvedCompany})" <${hr.email}>`;

    const dispatchResult = await emailService.dispatchEmail({
      to: recipientEmail,
      subject: finalSubject,
      html: htmlContent,
      text: finalBody,
      from: senderAddress,
      replyTo: hr.email,
      type: "Candidate Congratulations",
      recipientName: candidateName,
      userEmail: hr.email,
      templateId: template.id,
      metadata: { trigger: "candidate_congratulations", candidateId, jobTitle: resolvedJobTitle }
    });

    recordAutomatedEmailLog({
      triggerType: "candidate_congratulations",
      idempotencyKey,
      recipientEmail,
      recipientName: candidateName,
      senderEmail: hr.email,
      senderName: hr.name,
      subject: finalSubject,
      templateId: template.id,
      status: dispatchResult.success ? "sent" : "failed",
      mode: dispatchResult.mode,
      messageId: dispatchResult.messageId,
      metadata: { candidateId, jobTitle: resolvedJobTitle }
    });

    console.log(`[AUTOMATED-EMAIL] 🎉 Congratulations / Selection email sent to ${recipientEmail} from ${hr.email}`);
    return { success: true, dispatchResult };
  } catch (err) {
    console.error("[AUTOMATED-EMAIL] Error sending congratulations email:", err);
    recordAutomatedEmailLog({
      triggerType: "candidate_congratulations",
      idempotencyKey: `congratulations_err_${candidate?.id || Date.now()}`,
      recipientEmail: candidate?.email || "unknown",
      recipientName: candidate?.name || "Candidate",
      senderEmail: hrEmail || "unknown",
      senderName: hrName || "HR",
      subject: "Congratulations Email Failed",
      status: "failed",
      error: err.message
    });
    return { success: false, error: err.message };
  }
}

// ============================================================================
// BACKGROUND SCHEDULER: 1-HOUR INTERVIEW REMINDER
// ============================================================================

let reminderSchedulerInterval = null;

async function checkAndSendUpcomingReminders() {
  try {
    const interviews = await interviewsDb.getAll();
    if (!Array.isArray(interviews) || interviews.length === 0) return;

    const now = new Date();

    for (const iv of interviews) {
      const status = String(iv.status || "").toLowerCase().trim();
      // Skip cancelled, completed, expired, or rejected
      if (status === "cancelled" || status === "completed" || status === "expired" || status === "rejected") {
        continue;
      }
      if (iv.reminderSent) {
        continue;
      }

      const interviewTime = parseDateTime(iv.date, iv.time);
      if (!interviewTime || isNaN(interviewTime.getTime())) {
        continue;
      }

      // Check recruiter settings for automatic reminder delivery and lead time
      const ivSettings = settingsDb.getInterviewSettings(iv.userEmail || iv.createdBy);
      if (ivSettings && ivSettings.reminderBeforeInterview === false) {
        continue;
      }

      const reminderTimeStr = String(ivSettings?.reminderTime || "15 Minutes").toLowerCase();
      let thresholdMins = 18;
      if (reminderTimeStr.includes("30")) thresholdMins = 35;
      else if (reminderTimeStr.includes("1 hour") || reminderTimeStr.includes("60")) thresholdMins = 65;
      else if (reminderTimeStr.includes("15")) thresholdMins = 18;
      else if (reminderTimeStr.includes("5")) thresholdMins = 8;

      // Trigger if scheduled between 0 and configured lead time from now
      if (diffMs > 0 && diffMins <= thresholdMins) {
        console.log(`[REMINDER-SCHEDULER] Upcoming interview detected in ${diffMins} mins for ${iv.name} (${iv.email}). Triggering reminder (configured lead: ${reminderTimeStr}).`);
        await sendInterviewReminderEmail({ interview: iv });
      }
    }
  } catch (err) {
    console.warn("[REMINDER-SCHEDULER] Notice during reminder scan:", err.message);
  }
}

function startReminderScheduler() {
  if (reminderSchedulerInterval) return;

  console.log("✓ AvaHire Automated Email Scheduler initialized (Scanning for 1-Hour reminders every 60s).");
  
  // Initial check after 5 seconds
  setTimeout(() => {
    checkAndSendUpcomingReminders().catch(() => {});
  }, 5000);

  // Recurring check every 60 seconds
  reminderSchedulerInterval = setInterval(() => {
    checkAndSendUpcomingReminders().catch(() => {});
  }, 60 * 1000);
}

function stopReminderScheduler() {
  if (reminderSchedulerInterval) {
    clearInterval(reminderSchedulerInterval);
    reminderSchedulerInterval = null;
  }
}

module.exports = {
  sendCandidateShortlistedEmail,
  sendInterviewScheduledEmail,
  sendInterviewReminderEmail,
  sendCongratulationsEmail,
  getAutomatedEmailLogs,
  getTemplateForTrigger,
  replaceTemplateVariables,
  formatAutomatedEmailHtml,
  startReminderScheduler,
  stopReminderScheduler,
  checkAndSendUpcomingReminders
};
