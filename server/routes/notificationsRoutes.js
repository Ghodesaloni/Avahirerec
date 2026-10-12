const express = require("express");
const router = express.Router();
const notificationService = require("../services/notificationService");
const { requireAuth } = require("../middleware/authMiddleware");

// GET /api/notifications - List notifications for authenticated recruiter
router.get("/", requireAuth, async (req, res) => {
  try {
    const userRef = { id: req.user.id, email: req.user.email };
    const { type, unread, limit } = req.query;

    const list = await notificationService.getNotifications({
      userId: req.user.id,
      userEmail: req.user.email,
      type,
      unread,
      limit: limit ? parseInt(limit, 10) : 50
    });

    const unreadCount = await notificationService.getUnreadCount(userRef);

    res.json({
      success: true,
      count: list.length,
      unreadCount,
      data: list
    });
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ success: false, error: "Failed to load notifications" });
  }
});

// GET /api/notifications/unread-count - Fast badge counter
router.get("/unread-count", requireAuth, async (req, res) => {
  try {
    const userRef = { id: req.user.id, email: req.user.email };
    const unreadCount = await notificationService.getUnreadCount(userRef);
    res.json({ success: true, unreadCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/notifications/read-all - Mark all notifications as read
router.put("/read-all", requireAuth, async (req, res) => {
  try {
    const userRef = { id: req.user.id, email: req.user.email };
    await notificationService.markAllAsRead(userRef);
    const unreadCount = await notificationService.getUnreadCount(userRef);
    res.json({ success: true, unreadCount, message: "All notifications marked as read" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/notifications/:id/read - Mark single notification as read
router.put("/:id/read", requireAuth, async (req, res) => {
  try {
    const userRef = { id: req.user.id, email: req.user.email };
    const { id } = req.params;
    const updated = await notificationService.markAsRead(id, userRef);
    if (!updated) {
      return res.status(404).json({ success: false, error: "Notification not found or access denied" });
    }
    const unreadCount = await notificationService.getUnreadCount(userRef);
    res.json({ success: true, unreadCount, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/notifications/:id - Delete / dismiss single notification
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const userRef = { id: req.user.id, email: req.user.email };
    const { id } = req.params;
    const deleted = await notificationService.deleteNotification(id, userRef);
    if (!deleted) {
      return res.status(404).json({ success: false, error: "Notification not found or access denied" });
    }
    const unreadCount = await notificationService.getUnreadCount(userRef);
    res.json({ success: true, unreadCount, message: "Notification deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/notifications - Clear all notifications
router.delete("/", requireAuth, async (req, res) => {
  try {
    const userRef = { id: req.user.id, email: req.user.email };
    await notificationService.clearAll(userRef);
    res.json({ success: true, unreadCount: 0, message: "All notifications cleared" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
