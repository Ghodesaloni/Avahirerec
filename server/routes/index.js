const express = require("express");
const router = express.Router();

const jobsRoutes = require("./jobsRoutes");
const resumesRoutes = require("./resumesRoutes");
const interviewsRoutes = require("./interviewsRoutes");
const candidatesRoutes = require("./candidatesRoutes");
const emailCenterRoutes = require("./emailCenterRoutes");
const dashboardRoutes = require("./dashboardRoutes");
const settingsRoutes = require("./settingsRoutes");
const authRoutes = require("./authRoutes");
const usersRoutes = require("./usersRoutes");
const candidatePortalRoutes = require("./candidatePortalRoutes");
const livekitRoutes = require("./livekitRoutes");
const reportsRoutes = require("./reportsRoutes");
const notificationsRoutes = require("./notificationsRoutes");

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/jobs", jobsRoutes);
router.use("/resumes", resumesRoutes);
router.use("/interviews", interviewsRoutes);
router.use("/candidates", candidatesRoutes);
router.use("/candidate-portal", candidatePortalRoutes);
router.use("/notifications", notificationsRoutes);
router.use("/livekit", livekitRoutes);
router.use("/token", livekitRoutes);
router.use("/reports", reportsRoutes);
router.use("/emails", emailCenterRoutes);
router.use("/email-center", emailCenterRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/settings", settingsRoutes);

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "AvaHire HR Portal Backend",
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
