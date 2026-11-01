require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const apiRouter = require("./routes");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// AWS Cloud Server Identification Header
app.use((req, res, next) => {
  res.setHeader("X-Server-Provider", "Amazon Web Services (AWS)");
  res.setHeader("X-Server-Environment", "AWS-Production");
  next();
});

const { getConnectionStatus } = require("./db/postgres");

// AWS Health & Database Status Check
app.get(["/health", "/api/health"], (req, res) => {
  const dbStatus = getConnectionStatus();
  res.status(200).json({
    status: "healthy",
    provider: "Amazon Web Services (AWS)",
    service: "AWS App Runner / EC2",
    region: process.env.AWS_REGION || "us-east-1",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    database: dbStatus,
    modules: {
      compute: "AWS EC2 / App Runner",
      database: dbStatus.connected ? "AWS RDS PostgreSQL (Connected)" : "Local JSON Engine (Dual-Layer Fallback)",
      storage: "AWS S3",
      messaging: process.env.SMTP_USER ? `SMTP (${process.env.SMTP_USER})` : "SMTP"
    }
  });
});

app.get("/api/db-status", (req, res) => {
  res.status(200).json(getConnectionStatus());
});

// Mount API routes
app.use("/api", apiRouter);

// Serve static frontend build in production (supporting both dist and build directories across any AWS runtime)
const candidateDirs = [
  path.resolve(__dirname, "../dist"),
  path.resolve(__dirname, "../build"),
  path.resolve(process.cwd(), "dist"),
  path.resolve(process.cwd(), "build"),
];
const fs = require("fs");
const staticDir = candidateDirs.find((d) => fs.existsSync(path.join(d, "index.html")));

if (staticDir) {
  console.log(`[AWS SERVER] Serving static production build from: ${staticDir}`);
  app.use(express.static(staticDir));
}

// Fallback for React Router SPA routes
app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "Endpoint not found" });
  }
  if (staticDir) {
    const indexPath = path.join(staticDir, "index.html");
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }
  return res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>AvaHire Server</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; display: flex; justify-content: center; align-items: center; min-height: 80vh; margin: 0; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 32px; max-width: 580px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3); }
        h1 { font-size: 24px; color: #38bdf8; margin-top: 0; }
        p { color: #cbd5e1; line-height: 1.6; }
        code { background: #0f172a; padding: 4px 8px; border-radius: 6px; color: #a5f3fc; font-family: monospace; font-size: 14px; }
        .btn { display: inline-block; margin-top: 16px; background: #2563eb; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 500; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>AvaHire Backend Server Running</h1>
        <p>The Express API backend is actively listening on port <strong>${PORT}</strong> and responding to <code>/api</code> endpoints.</p>
        <p><strong>Running in VS Code for development?</strong></p>
        <p>Please run the development command in your VS Code terminal:</p>
        <p><code>npm run dev</code></p>
        <p>This will start the live Webpack/CRA development server with hot-reloading at <code>http://localhost:3000</code>.</p>
        <p style="font-size: 13px; color: #94a3b8; margin-top: 24px;">Note: To serve the static frontend via <code>npm start</code>, first run <code>npm run build</code>.</p>
      </div>
    </body>
    </html>
  `);
});

process.on("unhandledRejection", (reason, promise) => {
  console.warn("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.warn("Uncaught Exception:", err);
});

const automatedEmailService = require("./services/automatedEmailService");

// Start 1-Hour Interview Reminder Background Scheduler
automatedEmailService.startReminderScheduler();

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AvaHire HR Portal server listening on port ${PORT}`);
  });
}

module.exports = app;

