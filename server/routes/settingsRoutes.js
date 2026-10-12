const express = require("express");
const router = express.Router();
const settingsDb = require("../db/settingsDb");
const awsService = require("../services/awsService");
const { requireAuth } = require("../middleware/authMiddleware");

// GET /api/settings/aws - get AWS cloud server configuration & status
router.get("/aws", requireAuth, (req, res) => {
  try {
    const config = awsService.getConfig();
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/settings/aws - update AWS server settings
router.put("/aws", requireAuth, (req, res) => {
  try {
    const updated = awsService.updateConfig(req.body);
    res.json({ success: true, data: updated, message: "AWS Cloud Server settings updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/settings/aws/test - test AWS connection (RDS, S3, SES, Compute)
router.post("/aws/test", requireAuth, async (req, res) => {
  try {
    const result = await awsService.testConnection();
    res.json({ success: true, data: result, message: "AWS Server diagnostics completed" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/settings - get organization & AI settings scoped to authenticated recruiter
router.get("/", requireAuth, async (req, res) => {
  try {
    const settings = await settingsDb.getSettingsAsync(req.user.email);
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/settings - update settings for authenticated recruiter
router.put("/", requireAuth, async (req, res) => {
  try {
    const updated = settingsDb.updateSettings(req.body, req.user.email);
    res.json({ success: true, data: updated, message: "Settings updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/settings/interview - get interview & proctoring settings
router.get("/interview", requireAuth, async (req, res) => {
  try {
    const settings = await settingsDb.getInterviewSettingsAsync(req.user.email);
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/settings/interview - update interview & proctoring settings
router.put("/interview", requireAuth, async (req, res) => {
  try {
    const updated = settingsDb.updateInterviewSettings(req.body, req.user.email);
    res.json({ success: true, data: updated, message: "Interview settings updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/settings/profile - get recruiter profile
router.get("/profile", requireAuth, (req, res) => {
  try {
    const profile = settingsDb.getProfile(req.user.email);
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/settings/profile - update recruiter profile
router.put("/profile", requireAuth, (req, res) => {
  try {
    const updated = settingsDb.updateProfile(req.body, req.user.email);
    res.json({ success: true, data: updated, message: "Profile updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
