const { socketAuthMiddleware } = require("../middleware/socketAuthMiddleware");
const { conversationService } = require("./conversationService");
const { notifyMessage, notifyRead } = require("./conversationEvents");

function configureConversationSocket(io, service = conversationService) {
  io.on("connection", (socket) => {
    let lastTypingAt = 0;
    const action = (name, handler) => socket.on(name, async (payload, ack) => {
      if (typeof ack !== "function") return;
      try {
        // Reuse session verification for long-lived connections (expiry / password reset).
        await new Promise((resolve, reject) => socketAuthMiddleware(socket, (error) => error ? reject(error) : resolve()));
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw Object.assign(new Error("Invalid chat request"), { statusCode: 400 });
        const data = await handler(payload);
        ack({ success: true, ...data });
      } catch (error) {
        ack({ success: false, message: error.statusCode ? error.message : "Unable to complete chat request. Check your session and connection." });
        if (error.message === "Authentication required") socket.disconnect(true);
      }
    });
    action("conversation:join", async ({ conversationId }) => {
      await service.member(socket.data.user, conversationId);
      // One open conversation per connection; other inbox updates use the private user room.
      for (const room of socket.rooms) if (room.startsWith("conversation:")) socket.leave(room);
      await socket.join(`conversation:${conversationId}`);
      return { conversationId };
    });
    action("conversation:leave", async ({ conversationId }) => {
      await service.member(socket.data.user, conversationId);
      await socket.leave(`conversation:${conversationId}`);
      return {};
    });
    action("message:send", async (payload) => {
      const result = await service.send(socket.data.user, payload.conversationId, payload);
      notifyMessage(io, result);
      return { message: result.message };
    });
    action("conversation:read", async ({ conversationId, throughMessageId }) => {
      const result = await service.read(socket.data.user, conversationId, throughMessageId);
      notifyRead(io, result);
      const { participants, ...receipt } = result;
      return receipt;
    });
    action("conversation:typing", async ({ conversationId, typing }) => {
      if (typeof typing !== "boolean") throw Object.assign(new Error("Invalid typing state"), { statusCode: 400 });
      if (typing && Date.now() - lastTypingAt < 1000) return {};
      await service.member(socket.data.user, conversationId);
      lastTypingAt = Date.now();
      socket.to(`conversation:${conversationId}`).emit("conversation:typing", { conversationId, userId: socket.data.user.id, typing });
      return {};
    });
  });
}
module.exports = { configureConversationSocket };
