const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const candidatesDb = require("../db/candidatesDb");
const excelReportService = require("../services/excelReportService");
const recordingStorageService = require("../services/recordingStorageService");
const transcriptDocService = require("../services/transcriptDocService");

/**
 * Helper to construct base URL from request for absolute download links in Excel
 */
function getRequestBaseUrl(req) {
  const protocol = req.protocol || "http";
  const host = req.get("host") || "localhost:3000";
  return `${protocol}://${host}`;
}

/**
 * Extract active user email from query param or header for per-account separation
 */
function getUserEmail(req) {
  return (req.query.userEmail || req.headers["x-user-email"] || "").toLowerCase().trim();
}

// GET /api/reports/summary - Overview stats for HR Reports section (scoped per account)
router.get("/summary", async (req, res) => {
  try {
    const userEmail = getUserEmail(req);
    const candidates = await candidatesDb.getAll(userEmail ? { userEmail } : {});
    const selected = candidates.filter(c => c && c.status === "Selected");
    const datesSummary = excelReportService.getAvailableDatesSummary(candidates);
    const todayKey = excelReportService.formatDateKey(new Date());
    const todayEntry = datesSummary.find(d => d.dateKey === todayKey) || { candidateCount: 0 };

    res.json({
      success: true,
      data: {
        accountEmail: userEmail || "All Accounts",
        totalSelected: selected.length,
        todayDateKey: todayKey,
        todayDisplayDate: excelReportService.formatDisplayDate(new Date()),
        todaySelectedCount: todayEntry.candidateCount,
        availableDates: datesSummary,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error("[ReportsAPI] Error getting reports summary:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/selected-candidates/dates - List all report dates with candidate counts
router.get("/selected-candidates/dates", async (req, res) => {
  try {
    const userEmail = getUserEmail(req);
    const candidates = await candidatesDb.getAll(userEmail ? { userEmail } : {});
    const datesSummary = excelReportService.getAvailableDatesSummary(candidates);
    res.json({
      success: true,
      accountEmail: userEmail || "All Accounts",
      count: datesSummary.length,
      data: datesSummary
    });
  } catch (err) {
    console.error("[ReportsAPI] Error getting report dates:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/selected-candidates/today - Download or view today's selected candidates report
router.get("/selected-candidates/today", async (req, res) => {
  try {
    const userEmail = getUserEmail(req);
    const todayKey = excelReportService.formatDateKey(new Date());
    const candidates = await candidatesDb.getAll(userEmail ? { userEmail } : {});
    const baseUrl = getRequestBaseUrl(req);

    const report = await excelReportService.generateDailyReport(todayKey, candidates, baseUrl, userEmail);

    // If caller requests JSON metadata instead of binary download
    if (req.query.format === "json") {
      const todayCandidates = candidates.filter(c => {
        if (c.status !== "Selected") return false;
        return excelReportService.normalizeDateInfo(c.selectionDate).key === todayKey;
      });
      return res.json({
        success: true,
        accountEmail: userEmail || "All Accounts",
        reportDate: todayKey,
        displayDate: report.displayDate,
        candidateCount: report.candidateCount,
        filename: report.filename,
        downloadUrl: `/api/reports/selected-candidates/today?download=true${userEmail ? `&userEmail=${encodeURIComponent(userEmail)}` : ""}`,
        candidates: todayCandidates
      });
    }

    if (!fs.existsSync(report.filePath)) {
      return res.status(404).json({ success: false, error: "Report file could not be generated." });
    }

    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Length", report.fileSize);

    const stream = fs.createReadStream(report.filePath);
    stream.pipe(res);
  } catch (err) {
    console.error("[ReportsAPI] Error generating today report:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/selected-candidates/date/:date - Download selected candidates report for specific date
router.get("/selected-candidates/date/:date", async (req, res) => {
  try {
    const userEmail = getUserEmail(req);
    const rawDate = req.params.date;
    const norm = excelReportService.normalizeDateInfo(rawDate);
    const dateKey = norm.key;
    const candidates = await candidatesDb.getAll(userEmail ? { userEmail } : {});
    const baseUrl = getRequestBaseUrl(req);

    const report = await excelReportService.generateDailyReport(dateKey, candidates, baseUrl, userEmail);

    if (req.query.format === "json") {
      const dateCandidates = candidates.filter(c => {
        if (c.status !== "Selected") return false;
        return excelReportService.normalizeDateInfo(c.selectionDate).key === dateKey;
      });
      return res.json({
        success: true,
        accountEmail: userEmail || "All Accounts",
        reportDate: dateKey,
        displayDate: report.displayDate,
        candidateCount: report.candidateCount,
        filename: report.filename,
        downloadUrl: `/api/reports/selected-candidates/date/${dateKey}${userEmail ? `?userEmail=${encodeURIComponent(userEmail)}` : ""}`,
        candidates: dateCandidates
      });
    }

    if (!fs.existsSync(report.filePath)) {
      return res.status(404).json({ success: false, error: `Report file not found for date ${dateKey}` });
    }

    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Length", report.fileSize);

    const stream = fs.createReadStream(report.filePath);
    stream.pipe(res);
  } catch (err) {
    console.error(`[ReportsAPI] Error generating report for date ${req.params.date}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/selected-candidates/all - Download complete master report for all dates
router.get("/selected-candidates/all", async (req, res) => {
  try {
    const userEmail = getUserEmail(req);
    const candidates = await candidatesDb.getAll(userEmail ? { userEmail } : {});
    const baseUrl = getRequestBaseUrl(req);

    const report = await excelReportService.generateAllDatesReport(candidates, baseUrl, userEmail);

    if (req.query.format === "json") {
      const selected = candidates.filter(c => c.status === "Selected");
      return res.json({
        success: true,
        accountEmail: userEmail || "All Accounts",
        reportDate: "all",
        candidateCount: report.candidateCount,
        filename: report.filename,
        downloadUrl: `/api/reports/selected-candidates/all${userEmail ? `?userEmail=${encodeURIComponent(userEmail)}` : ""}`,
        candidates: selected
      });
    }

    if (!fs.existsSync(report.filePath)) {
      return res.status(404).json({ success: false, error: "Master report file not found" });
    }

    res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Length", report.fileSize);

    const stream = fs.createReadStream(report.filePath);
    stream.pipe(res);
  } catch (err) {
    console.error("[ReportsAPI] Error generating all-dates report:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/reports/regenerate - Force regenerate all Excel reports from database records
router.post("/regenerate", async (req, res) => {
  try {
    const userEmail = getUserEmail(req);
    const candidates = await candidatesDb.getAll(userEmail ? { userEmail } : {});
    const baseUrl = getRequestBaseUrl(req);
    const reports = await excelReportService.syncAllReports(candidates, baseUrl, userEmail);

    res.json({
      success: true,
      accountEmail: userEmail || "All Accounts",
      message: `Successfully regenerated ${reports.length} report files for account`,
      data: reports
    });
  } catch (err) {
    console.error("[ReportsAPI] Error regenerating reports:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
