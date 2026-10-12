const express = require("express");
const router = express.Router();
const dashboardDb = require("../db/dashboardDb");
const { requireAuth } = require("../middleware/authMiddleware");

// GET /api/dashboard/stats - get aggregated live stats for the dashboard scoped to authenticated recruiter
router.get("/stats", requireAuth, async (req, res) => {
  try {
    const stats = await dashboardDb.getStats(req.user);
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
