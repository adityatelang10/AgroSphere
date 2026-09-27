const express = require("express");
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");
const { conversationService } = require("../services/conversationService");
const { notifyConversation, notifyMessage, notifyRead } = require("../services/conversationEvents");

function createConversationRouter(service = conversationService) {
  const router = express.Router();
  router.use(authMiddleware, requireRole(["CUSTOMER", "FARMER"]));
  const handle = (action) => async (req, res, next) => {
    try { res.json({ success: true, ...await action(req) }); }
    catch (error) {
      if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
      // Never expose DB errors, query details, or session information.
      return res.status(503).json({ success: false, message: "Messages are temporarily unavailable. Please try again." });
    }
  };
  router.post("/", handle(async (req) => {
    const result = await service.start(req.user, req.body);
    notifyConversation(req.app.get("io"), result.participants);
    return { conversation: result.conversation };
  }));
  router.get("/", handle((req) => service.list(req.user, req.query.offset)));
  router.get("/:id/messages", handle((req) => service.history(req.user, req.params.id, req.query.before)));
  router.post("/:id/messages", handle(async (req) => {
    const result = await service.send(req.user, req.params.id, req.body);
    notifyMessage(req.app.get("io"), result);
    return { message: result.message };
  }));
  router.patch("/:id/read", handle(async (req) => {
    const result = await service.read(req.user, req.params.id, req.body?.throughMessageId);
    notifyRead(req.app.get("io"), result);
    const { participants, ...receipt } = result;
    return receipt;
  }));
  return router;
}
module.exports = { createConversationRouter };
