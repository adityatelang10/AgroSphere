const rooms = (conversation) => [`conversation:${conversation._id}`, `user:${conversation.customer}`, `user:${conversation.farmer}`];
function notifyConversation(io, participants) {
  io?.to(rooms(participants)).emit("conversation:updated", { conversationId: String(participants._id) });
}
function notifyMessage(io, result) {
  // Union rooms delivers once per socket, including participants not on the Messages page.
  io?.to(rooms(result.participants)).emit("message:new", result.message);
  notifyConversation(io, result.participants);
}
function notifyRead(io, result) {
  const { participants, ...receipt } = result;
  io?.to(rooms(participants)).emit("conversation:read", receipt);
  notifyConversation(io, participants);
}
module.exports = { notifyConversation, notifyMessage, notifyRead };
