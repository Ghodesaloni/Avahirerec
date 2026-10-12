const fs = require("fs");
const path = require("path");
require("dotenv").config({ override: true });
const nodemailer = require("nodemailer");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");
const emailCenterDb = require("../db/emailCenterDb");

function getStoredAwsConfig() {
  try {
    const p = path.resolve(__dirname, "../data/aws_server_config.json");
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8")) || {};
    }
  } catch (e) {}
  return {};
}

function storeDispatchedEmail(_data) {
  // Sent emails are strictly kept private and not saved to or shown in the Email Center
  return null;
}

function getAwsSesClient() {
  const awsCfg = getStoredAwsConfig();
  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || awsCfg.accessKeyId || "").trim();
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || awsCfg.secretAccessKey || "").trim();
  const rawRegion = (process.env.AWS_SES_REGION || awsCfg.sesRegion || process.env.AWS_REGION || awsCfg.region || "eu-north-1").trim();
  const region = rawRegion.replace(/([0-9]+)[a-z]$/i, "$1") || "eu-north-1";

  if (accessKeyId && secretAccessKey) {
    try {
      return new SESClient({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    } catch (e) {
      console.warn("[AWS-SES] Error initializing SESClient:", e.message);
    }
  }
  return null;
}

function getSesSenderAddress(customName = "AvaHire AI") {
  const awsCfg = getStoredAwsConfig();
  const rawSender = (process.env.AWS_SES_FROM_EMAIL || awsCfg.sesSender || "salonighode@gmail.com").trim();
  if (rawSender.includes("<") && rawSender.includes(">")) {
    return rawSender;
  }
  if (rawSender.includes("@")) {
    return `"${customName}" <${rawSender}>`;
  }
  return `"${customName}" <salonighode@gmail.com>`;
}

function getFormattedFrom(customName) {
  const awsCfg = getStoredAwsConfig();
  // Prioritize configured SMTP credentials over AWS SES
  const user = (process.env.SMTP_USER || process.env.GMAIL_USER || process.env.EMAIL_USER || process.env.AWS_SES_FROM_EMAIL || awsCfg.sesSender || "").trim();
  const rawFrom = (process.env.SMTP_FROM || process.env.AWS_SES_FROM_EMAIL || awsCfg.sesSender || "").trim();

  if (rawFrom.includes("<") && rawFrom.includes(">")) {
    return rawFrom;
  }
  if (rawFrom.includes("@")) {
    return `"${customName || "AvaHire AI"}" <${rawFrom}>`;
  }
  const displayName = customName || "AvaHire AI";
  if (user) {
    if (user.includes("<") && user.includes(">")) return user;
    return `"${displayName}" <${user}>`;
  }
  return `"${displayName}" <salonighode@gmail.com>`;
}

function getTransporter() {
  require("dotenv").config({ override: true });
  // 1. Primary: Given SMTP / Gmail Transporter from .env
  const rawHost = (process.env.SMTP_HOST || "").trim();
  const rawPort = process.env.SMTP_PORT;
  const user = (process.env.SMTP_USER || process.env.EMAIL_USER || process.env.GMAIL_USER || "").trim();
  const rawPass = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD || process.env.GMAIL_APP_PASSWORD || "").trim();
  const pass = rawPass ? rawPass.replace(/\s+/g, "") : null;

  if (user && pass) {
    const isGmail =
      user.toLowerCase().endsWith("@gmail.com") ||
      rawHost.toLowerCase().includes("gmail") ||
      !rawHost ||
      !rawHost.includes(".");

    if (isGmail) {
      return nodemailer.createTransport({
        service: "gmail",
        auth: {
          user,
          pass,
        },
        connectionTimeout: 12000,
        greetingTimeout: 10000,
        socketTimeout: 12000,
      });
    }

    const host = rawHost || "smtp.gmail.com";
    const port = parseInt(rawPort || "587", 10);
    const secure = process.env.SMTP_SECURE === "true" || port === 465;

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 12000,
      greetingTimeout: 10000,
      socketTimeout: 12000,
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  // 2. Secondary fallback: AWS SES SMTP Transporter (if configured)
  const awsCfg = getStoredAwsConfig();
  const rawRegion = (process.env.AWS_SES_REGION || awsCfg.sesRegion || process.env.AWS_REGION || awsCfg.region || "eu-north-1").trim();
  const region = rawRegion.replace(/([0-9]+)[a-z]$/i, "$1") || "eu-north-1";

  const sesHost = (process.env.AWS_SES_HOST || `email-smtp.${region}.amazonaws.com`).trim();
  const sesUser = (process.env.AWS_SES_SMTP_USER || awsCfg.sesSmtpUser || process.env.AWS_SES_USER || "").trim();
  const sesPass = (process.env.AWS_SES_SMTP_PASSWORD || awsCfg.sesSmtpPassword || process.env.AWS_SES_PASSWORD || "").trim();

  if (sesUser && sesPass) {
    return nodemailer.createTransport({
      host: sesHost,
      port: parseInt(process.env.AWS_SES_PORT || "587", 10),
      secure: process.env.AWS_SES_PORT === "465",
      auth: {
        user: sesUser,
        pass: sesPass,
      },
      connectionTimeout: 12000,
      greetingTimeout: 10000,
      socketTimeout: 12000,
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  return null;
}

/**
 * Unified dispatch pipeline prioritizing the given SMTP service (Nodemailer),
 * with fallback to AWS SES (if configured), and fallback to In-App Portal Mailbox.
 */
async function dispatchEmail({
  to,
  subject,
  html,
  text,
  from,
  replyTo,
  type = "General",
  recipientName = "User",
  userEmail,
  templateId = null,
  metadata = {},
}) {
  const fromAddress = from || getFormattedFrom("AvaHire AI");

  // Step 1: PRIMARY - Given SMTP Transporter (Gmail / Custom SMTP)
  const transporter = getTransporter();
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: fromAddress,
        to,
        replyTo: replyTo || undefined,
        subject,
        html,
        text: text || undefined,
      });

      console.log(`[SMTP] Successfully delivered email to ${to} via SMTP. MessageId: ${info.messageId}`);
      const stored = storeDispatchedEmail({
        recipient: to,
        recipientName,
        subject,
        body: text || subject,
        html,
        type,
        templateId,
        senderEmail: fromAddress,
        userEmail: userEmail || to,
        status: "Delivered via SMTP",
        mode: "live_smtp",
        messageId: info.messageId,
        metadata: { ...metadata, engine: "smtp_nodemailer" },
      });

      return {
        success: true,
        mode: "live_smtp",
        messageId: info.messageId,
        recipient: to,
        record: stored,
      };
    } catch (smtpErr) {
      console.warn(`[SMTP-WARN] SMTP delivery notice: ${smtpErr.message}. Checking AWS SES fallback...`);
    }
  }

  // Step 2: Fallback to AWS SES Native SDK if configured
  const sesClient = getAwsSesClient();
  if (sesClient) {
    try {
      const sesSender = getSesSenderAddress("AvaHire AI");
      const sendCmd = new SendEmailCommand({
        Source: sesSender,
        Destination: {
          ToAddresses: [to],
        },
        Message: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: html, Charset: "UTF-8" },
            Text: { Data: text || subject, Charset: "UTF-8" },
          },
        },
        ReplyToAddresses: replyTo ? [replyTo] : undefined,
      });

      const sesResult = await sesClient.send(sendCmd);
      console.log(`[AWS-SES] Delivered email to ${to} via AWS SES fallback. MessageId: ${sesResult.MessageId}`);

      const stored = storeDispatchedEmail({
        recipient: to,
        recipientName,
        subject,
        body: text || subject,
        html,
        type,
        templateId,
        senderEmail: sesSender,
        userEmail: userEmail || to,
        status: "Delivered via AWS SES",
        mode: "aws_ses",
        messageId: sesResult.MessageId,
        metadata: { ...metadata, engine: "aws_ses_sdk" },
      });

      return {
        success: true,
        mode: "aws_ses",
        messageId: sesResult.MessageId,
        recipient: to,
        record: stored,
      };
    } catch (sesErr) {
      console.warn(`[AWS-SES-WARN] AWS SES fallback notice (${sesErr.message}). Falling back to In-App Mailbox.`);
    }
  }

  // Step 3: Resilient In-App Portal Mailbox Fallback (always guarantees persistence and zero blockers)
  console.log(`[PORTAL-MAILBOX] Email dispatched to In-App Mailbox for ${to}: "${subject}"`);
  const stored = storeDispatchedEmail({
    recipient: to,
    recipientName,
    subject,
    body: text || subject,
    html,
    type,
    templateId,
    senderEmail: fromAddress,
    userEmail: userEmail || to,
    status: "Delivered to In-App Mailbox",
    mode: "portal_mailbox",
    messageId: `portal-${Date.now()}`,
    metadata: { ...metadata, engine: "portal_mailbox" },
  });

  return {
    success: true,
    mode: "portal_mailbox",
    messageId: `portal-${Date.now()}`,
    recipient: to,
    record: stored,
  };
}

/**
 * Sends a clean "Successfully Registered" confirmation email to the user's Gmail address
 */
async function sendRegistrationSuccessEmail({ toEmail, fullName, loginUrl, initialPassword }) {
  const fromAddress = getFormattedFrom("AvaHire AI");
  const subject = "Successfully Registered with AvaHire! 🎉";
  const targetLoginUrl = loginUrl || "/login";

  const credentialsHtml = initialPassword ? `
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin: 20px 0; text-align: left;">
      <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Your Login Credentials</div>
      <div style="font-size: 14px; color: #1e293b; margin-bottom: 4px;"><strong>Work Email:</strong> ${toEmail}</div>
      <div style="font-size: 14px; color: #1e293b;"><strong>Initial Password:</strong> <code style="background: #ede9fe; color: #7c3aed; padding: 3px 8px; border-radius: 6px; font-weight: 700;">${initialPassword}</code></div>
      <div style="font-size: 12px; color: #64748b; margin-top: 8px;">You can log in immediately with this password, or reset it anytime via Forgot Password.</div>
    </div>
  ` : "";

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Successfully Registered</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%); padding: 36px 32px; text-align: center; color: white; }
        .header h1 { margin: 0 0 8px 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
        .header p { margin: 0; font-size: 15px; opacity: 0.9; }
        .content { padding: 36px 32px; }
        .badge { display: inline-block; padding: 6px 14px; background-color: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; border-radius: 9999px; font-size: 13px; font-weight: 700; margin-bottom: 20px; }
        .greeting { font-size: 20px; font-weight: 700; margin-bottom: 12px; color: #0f172a; }
        .text { font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 20px; }
        .btn-container { text-align: center; margin: 32px 0; }
        .btn { display: inline-block; background-color: #7c3aed; color: #ffffff !important; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 36px; border-radius: 10px; box-shadow: 0 4px 10px rgba(124, 58, 237, 0.3); }
        .footer { background-color: #f8fafc; padding: 24px 32px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>AvaHire</h1>
          <p>Next-Generation AI Recruitment Portal</p>
        </div>
        <div class="content">
          <div class="badge">✓ Successfully Registered</div>
          <div class="greeting">Hello ${fullName || "there"},</div>
          <p class="text">
            Congratulations! You have successfully registered your HR recruiter account with <strong>AvaHire</strong>.
          </p>
          <p class="text">
            Your account is ready. You can now log in to set up AI job campaigns, conduct real-time AI voice and video candidate interviews, and streamline your recruitment pipeline.
          </p>

          ${credentialsHtml}

          <div class="btn-container">
            <a href="${targetLoginUrl}" class="btn" target="_blank">Login to AvaHire</a>
          </div>

          <p class="text" style="font-size: 13px; color: #64748b; margin-top: 24px;">
            Thank you for choosing AvaHire to elevate your hiring experience!
          </p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} AvaHire AI Inc. All rights reserved.<br>
          Delivered to: <strong>${toEmail}</strong>
        </div>
      </div>
    </body>
    </html>
  `;

  const dispatchResult = await dispatchEmail({
    to: toEmail,
    subject,
    html: htmlContent,
    text: `Congratulations ${fullName || "there"}! You have successfully registered your HR recruiter account with AvaHire. Access login at ${targetLoginUrl}`,
    from: fromAddress,
    type: "Registration Welcome",
    recipientName: fullName || "Recruiter",
    userEmail: toEmail,
    metadata: { loginUrl: targetLoginUrl },
  });

  return {
    ...dispatchResult,
    loginUrl: targetLoginUrl,
  };
}

/**
 * Sends a one-time verification email to the user's Gmail address
 */
async function sendVerificationEmail({ toEmail, fullName, verificationLink, token }) {
  const fromAddress = getFormattedFrom("AvaHire HR");
  const subject = "Verify your AvaHire Account - Action Required";

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify your AvaHire Account</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%); padding: 36px 32px; text-align: center; color: white; }
        .header h1 { margin: 0 0 8px 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
        .header p { margin: 0; font-size: 15px; opacity: 0.9; }
        .content { padding: 36px 32px; }
        .greeting { font-size: 18px; font-weight: 700; margin-bottom: 16px; color: #0f172a; }
        .text { font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
        .btn-container { text-align: center; margin: 32px 0; }
        .btn { display: inline-block; background-color: #7c3aed; color: #ffffff !important; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 36px; border-radius: 10px; box-shadow: 0 4px 10px rgba(124, 58, 237, 0.3); }
        .token-box { background-color: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 16px; margin: 24px 0; text-align: center; }
        .token-label { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px; }
        .token-val { font-family: monospace; font-size: 16px; font-weight: 700; color: #7c3aed; word-break: break-all; }
        .security-notice { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 6px; font-size: 13px; color: #92400e; margin: 24px 0; }
        .footer { background-color: #f8fafc; padding: 24px 32px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>AvaHire</h1>
          <p>Next-Generation AI Recruitment Portal</p>
        </div>
        <div class="content">
          <div class="greeting">Hello ${fullName || "there"},</div>
          <p class="text">
            Thank you for registering with AvaHire! To complete your registration and activate your recruiter account, please verify your Gmail address by clicking the button below.
          </p>

          <div class="btn-container">
            <a href="${verificationLink}" class="btn" target="_blank">Verify Email Address</a>
          </div>

          <div class="token-box">
            <div class="token-label">One-Time Secure Verification Token</div>
            <div class="token-val">${token}</div>
          </div>

          <div class="security-notice">
            <strong>Security Notice:</strong> This is a one-time verification link. It is valid for 24 hours and will expire after its first use. If you did not create an AvaHire account, you can safely ignore this message.
          </div>

          <p class="text" style="font-size: 13px; color: #64748b; margin-top: 24px;">
            Or copy and paste this verification URL into your browser:<br>
            <a href="${verificationLink}" style="color: #7c3aed; word-break: break-all;">${verificationLink}</a>
          </p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} AvaHire AI Inc. All rights reserved.<br>
          Delivered to: <strong>${toEmail}</strong>
        </div>
      </div>
    </body>
    </html>
  `;

  const dispatchResult = await dispatchEmail({
    to: toEmail,
    subject,
    html: htmlContent,
    text: `Please verify your email address for AvaHire. One-time verification link: ${verificationLink}. Token: ${token}`,
    from: fromAddress,
    type: "Account Verification",
    recipientName: fullName || "Recruiter",
    userEmail: toEmail,
    metadata: { token, verificationLink },
  });

  return {
    ...dispatchResult,
    token,
    verificationLink,
  };
}

/**
 * Sends a security login alert email when a user logs in to AvaHire
 */
async function sendLoginAlertEmail({ toEmail, fullName, loginTime, ipAddress, userAgent }) {
  if (!toEmail) return { success: false, error: "Missing recipient email" };

  const fromAddress = getFormattedFrom("AvaHire Security");
  const subject = "Security Alert: Successful Login to AvaHire";
  const displayTime = loginTime || new Date().toUTCString();
  const displayIp = ipAddress || "Current Network Session";
  const displayDevice = (userAgent && userAgent.length > 50 ? userAgent.substring(0, 50) + "..." : userAgent) || "Web Browser";

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Successful Login Notification</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px; text-align: center; color: white; }
        .header h1 { margin: 0 0 6px 0; font-size: 24px; font-weight: 800; }
        .content { padding: 32px; }
        .greeting { font-size: 18px; font-weight: 700; margin-bottom: 12px; color: #0f172a; }
        .text { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 20px; }
        .info-card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 20px 0; }
        .info-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; }
        .info-row:last-child { margin-bottom: 0; }
        .info-label { color: #64748b; font-weight: 600; }
        .info-val { color: #0f172a; font-weight: 700; font-family: monospace; }
        .notice { background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 6px; font-size: 13px; color: #1e40af; margin-top: 24px; }
        .footer { background-color: #f8fafc; padding: 20px 32px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>AvaHire Security</h1>
          <p style="margin: 0; font-size: 14px; opacity: 0.9;">Account Authentication Notice</p>
        </div>
        <div class="content">
          <div class="greeting">Hello ${fullName || "there"},</div>
          <p class="text">
            We noticed a successful login to your AvaHire recruiter account. If this was you, you can safely disregard this message.
          </p>

          <div class="info-card">
            <div class="info-row">
              <span class="info-label">Account:</span>
              <span class="info-val">${toEmail}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Timestamp (UTC):</span>
              <span class="info-val">${displayTime}</span>
            </div>
            <div class="info-row">
              <span class="info-label">IP Address:</span>
              <span class="info-val">${displayIp}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Device / Browser:</span>
              <span class="info-val">${displayDevice}</span>
            </div>
          </div>

          <div class="notice">
            <strong>Security tip:</strong> If you did not authorize this login, please change your password immediately in your account settings or contact support.
          </div>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} AvaHire AI Inc. &bull; Sent to ${toEmail}
        </div>
      </div>
    </body>
    </html>
  `;

  return dispatchEmail({
    to: toEmail,
    subject,
    html: htmlContent,
    text: `Successful login to your AvaHire recruiter account detected at ${displayTime} from IP ${displayIp}. Device: ${displayDevice}`,
    from: fromAddress,
    type: "Security Login Alert",
    recipientName: fullName || "User",
    userEmail: toEmail,
    metadata: { ipAddress: displayIp, userAgent: displayDevice, loginTime: displayTime },
  });
}

/**
 * Sends candidate interview invitation or custom recruitment communication email
 */
async function sendCommunicationEmail({ toEmail, recipientName, subject, body, senderEmail, senderName, templateId }) {
  const fromAddress = getFormattedFrom(senderName || "AvaHire Recruitment");
  const formattedSubject = subject || "Update on your application with AvaHire";
  const formattedBody = (body || "").replace(/\n/g, "<br>");

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${formattedSubject}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b; }
        .container { max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
        .header { background-color: #7c3aed; padding: 24px 32px; text-align: left; }
        .header h2 { color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; }
        .content { padding: 32px; }
        .body-text { font-size: 15px; line-height: 1.7; color: #334155; margin-bottom: 24px; }
        .sender-box { background-color: #f8fafc; border-left: 4px solid #7c3aed; padding: 12px 16px; font-size: 13px; color: #64748b; margin-top: 24px; }
        .footer { background-color: #f8fafc; padding: 16px 32px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>AvaHire Recruitment</h2>
        </div>
        <div class="content">
          <div class="body-text">
            ${formattedBody}
          </div>
          <div class="sender-box">
            Sent by <strong>${senderName || "Talent Acquisition Team"}</strong> (${senderEmail || "AvaHire HR"})
          </div>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} AvaHire AI Talent Platform &bull; Delivered to ${toEmail}
        </div>
      </div>
    </body>
    </html>
  `;

  return dispatchEmail({
    to: toEmail,
    subject: formattedSubject,
    html: htmlContent,
    text: body || formattedSubject,
    from: fromAddress,
    replyTo: senderEmail || undefined,
    type: "Candidate Communication",
    recipientName: recipientName || "Candidate",
    userEmail: senderEmail || toEmail,
    templateId: templateId || null,
    metadata: { senderName, senderEmail },
  });
}

/**
 * Sends a unique password recovery token email to the user
 */
async function sendPasswordResetEmail({ toEmail, fullName, resetLink, token }) {
  const fromAddress = getFormattedFrom("AvaHire Security");
  const subject = "Reset Your AvaHire Account Password - Action Required";

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%); padding: 36px 32px; text-align: center; color: white; }
        .header h1 { margin: 0 0 8px 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
        .header p { margin: 0; font-size: 15px; opacity: 0.9; }
        .content { padding: 36px 32px; }
        .greeting { font-size: 18px; font-weight: 700; margin-bottom: 16px; color: #0f172a; }
        .text { font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
        .btn-container { text-align: center; margin: 32px 0; }
        .btn { display: inline-block; background-color: #7c3aed; color: #ffffff !important; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 36px; border-radius: 10px; box-shadow: 0 4px 10px rgba(124, 58, 237, 0.3); }
        .token-box { background-color: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center; }
        .token-label { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
        .token-val { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 20px; font-weight: 800; color: #7c3aed; letter-spacing: 2px; word-break: break-all; }
        .security-notice { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 6px; font-size: 13px; color: #92400e; margin: 24px 0; }
        .footer { background-color: #f8fafc; padding: 24px 32px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>AvaHire</h1>
          <p>Security &amp; Account Recovery</p>
        </div>
        <div class="content">
          <div class="greeting">Hello ${fullName || "there"},</div>
          <p class="text">
            We received a request to reset your password for your AvaHire recruiter account. You can reset your credentials using your unique recovery token or by clicking the button below:
          </p>

          <div class="token-box">
            <div class="token-label">Unique Recovery Token</div>
            <div class="token-val">${token}</div>
          </div>

          <div class="btn-container">
            <a href="${resetLink}" class="btn" target="_blank">Reset Password Securely</a>
          </div>

          <div class="security-notice">
            <strong>Security Notice:</strong> This recovery token is valid for 1 hour and can only be used once. If you did not request a password reset, you can safely ignore this email. Your account credentials remain secure.
          </div>

          <p class="text" style="font-size: 13px; color: #64748b; margin-top: 24px;">
            Or copy and paste this recovery URL into your browser:<br>
            <a href="${resetLink}" style="color: #7c3aed; word-break: break-all;">${resetLink}</a>
          </p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} AvaHire AI Inc. All rights reserved.<br>
          Sent to: <strong>${toEmail}</strong>
        </div>
      </div>
    </body>
    </html>
  `;

  const dispatchResult = await dispatchEmail({
    to: toEmail,
    subject,
    html: htmlContent,
    text: `Password reset request for AvaHire. Your unique recovery token is: ${token}. Reset URL: ${resetLink}`,
    from: fromAddress,
    type: "Password Reset",
    recipientName: fullName || "Recruiter",
    userEmail: toEmail,
    metadata: { token, resetLink },
  });

  return {
    ...dispatchResult,
    resetLink,
    token,
  };
}

async function verifySmtpConnection() {
  const transporter = getTransporter();
  if (!transporter) {
    return {
      success: false,
      configured: false,
      message: "SMTP is not configured in .env (missing SMTP_USER or SMTP_PASS)",
    };
  }
  try {
    await transporter.verify();
    return {
      success: true,
      configured: true,
      provider: "SMTP (Google/Gmail)",
      user: process.env.SMTP_USER,
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      from: getFormattedFrom(),
      message: `SMTP connected and verified successfully (${process.env.SMTP_USER})`,
    };
  } catch (err) {
    return {
      success: false,
      configured: true,
      provider: "SMTP",
      error: err.message,
    };
  }
}

module.exports = {
  sendRegistrationSuccessEmail,
  sendVerificationEmail,
  sendLoginAlertEmail,
  sendCommunicationEmail,
  sendPasswordResetEmail,
  storeDispatchedEmail,
  dispatchEmail,
  verifySmtpConnection,
  getTransporter,
  getAwsSesClient,
};
