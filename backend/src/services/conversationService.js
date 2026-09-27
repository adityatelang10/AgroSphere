const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const FarmerProfile = require("../models/FarmerProfile");
const User = require("../models/User");
const Crop = require("../models/Crop");

const fail = (statusCode, message) => { throw Object.assign(new Error(message), { statusCode }); };
const validId = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
const identity = (user) => {
  const id = String(user?._id || user?.id || "");
  if (!validId(id) || !["CUSTOMER", "FARMER"].includes(user?.role)) fail(401, "Authentication required");
  return { id, role: user.role };
};
const messageDTO = (m) => ({ _id: String(m._id), conversation: String(m.conversation), sender: String(m.sender),
  senderRole: m.senderRole, text: m.text, readAt: m.readAt, createdAt: m.createdAt, updatedAt: m.updatedAt });
const personDTO = (u) => u ? { id: String(u._id), name: u.name, imageUrl: u.profileImage?.url || "" } : null;

// Both transports call this same service. Only these two collections are written.
function createConversationService(models = { Conversation, Message, FarmerProfile, User, Crop }) {
  const { Conversation: C, Message: M, FarmerProfile: F, User: U, Crop: P } = models;
  async function member(user, id) {
    const actor = identity(user);
    if (!validId(id)) fail(400, "Invalid conversation ID");
    const conversation = await C.findOne({ _id: id, [actor.role === "CUSTOMER" ? "customer" : "farmer"]: actor.id }).lean();
    if (!conversation) fail(404, "Conversation not found or unavailable");
    return conversation;
  }
  async function describe(conversations, user) {
    const actor = identity(user);
    if (!conversations.length) return [];
    const ids = conversations.map((c) => c._id);
    const [users, farms, crops, counts] = await Promise.all([
      U.find({ _id: { $in: conversations.flatMap((c) => [c.customer, c.farmer]) } }).select("name profileImage.url").lean(),
      F.find({ user: { $in: conversations.map((c) => c.farmer) } }).select("user farmName").lean(),
      P.find({ _id: { $in: conversations.map((c) => c.cropContext).filter(Boolean) } }).select("name price unit images.url removedAt").lean(),
      M.aggregate([{ $match: { conversation: { $in: ids }, sender: { $ne: new mongoose.Types.ObjectId(actor.id) }, readAt: null } },
        { $group: { _id: "$conversation", count: { $sum: 1 } } }]),
    ]);
    return conversations.map((c) => {
      const farmer = users.find((u) => String(u._id) === String(c.farmer));
      const farm = farms.find((f) => String(f.user) === String(c.farmer));
      const crop = crops.find((p) => String(p._id) === String(c.cropContext));
      return { _id: String(c._id), customer: personDTO(users.find((u) => String(u._id) === String(c.customer))),
        farmer: { ...personDTO(farmer), farmName: farm?.farmName || "" },
        cropContext: crop ? { _id: String(crop._id), name: crop.name, price: crop.price, unit: crop.unit,
          imageUrl: crop.images?.[0]?.url || "", removed: Boolean(crop.removedAt) } : null,
        lastMessage: c.lastMessage, lastMessageAt: c.lastMessageAt,
        unreadCount: counts.find((n) => String(n._id) === String(c._id))?.count || 0 };
    });
  }
  async function start(user, payload = {}) {
    const actor = identity(user);
    if (actor.role !== "CUSTOMER") fail(403, "Only customers can start a farmer conversation");
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail(400, "Invalid conversation request");
    if (!validId(payload.farmerProfileId)) fail(400, "Invalid farmer profile ID");
    const farm = await F.findById(payload.farmerProfileId).select("user").lean();
    const farmer = farm && await U.findById(farm.user).select("role").lean();
    if (!farmer || farmer.role !== "FARMER" || String(farmer._id) === actor.id) fail(404, "Farmer not found");
    const update = { $setOnInsert: { customer: actor.id, farmer: farmer._id } };
    if (payload.cropId !== undefined) {
      if (!validId(payload.cropId)) fail(400, "Invalid crop ID");
      const crop = await P.findOne({ _id: payload.cropId, farmer: farm._id, removedAt: null }).select("_id").lean();
      if (!crop) fail(400, "This active crop does not belong to that farmer");
      update.$set = { cropContext: crop._id };
    }
    const pair = { customer: actor.id, farmer: farmer._id };
    let conversation;
    try {
      conversation = await C.findOneAndUpdate(pair, update, { upsert: true, new: true, runValidators: true }).lean();
    } catch (error) {
      if (error.code !== 11000) throw error;
      conversation = await C.findOneAndUpdate(pair, update.$set ? { $set: update.$set } : { $setOnInsert: pair }, { new: true }).lean();
    }
    return { conversation: (await describe([conversation], user))[0], participants: conversation };
  }
  async function list(user, offset = "0") {
    const actor = identity(user);
    if (!/^\d{1,6}$/.test(String(offset))) fail(400, "Invalid conversation offset");
    const filter = { [actor.role === "CUSTOMER" ? "customer" : "farmer"]: actor.id };
    const rows = await C.find(filter).sort({ lastMessageAt: -1, _id: -1 }).skip(Number(offset)).limit(51).lean();
    // Aggregate over all own conversations for an accurate navbar total, even with pagination.
    const total = await C.aggregate([{ $match: { [Object.keys(filter)[0]]: new mongoose.Types.ObjectId(actor.id) } },
      { $lookup: { from: "messages", let: { chat: "$_id" }, pipeline: [
        { $match: { $expr: { $eq: ["$conversation", "$$chat"] }, readAt: null, sender: { $ne: new mongoose.Types.ObjectId(actor.id) } } },
        { $count: "count" }], as: "unread" } },
      { $group: { _id: null, count: { $sum: { $ifNull: [{ $arrayElemAt: ["$unread.count", 0] }, 0] } } } }]);
    return { conversations: await describe(rows.slice(0, 50), user), hasMore: rows.length > 50, unreadCount: total[0]?.count || 0 };
  }
  async function history(user, id, before) {
    const conversation = await member(user, id);
    if (before && !validId(before)) fail(400, "Invalid message cursor");
    const rows = await M.find({ conversation: id, ...(before ? { _id: { $lt: before } } : {}) }).sort({ _id: -1 }).limit(51).lean();
    return { messages: rows.slice(0, 50).reverse().map(messageDTO), hasMore: rows.length > 50,
      conversation: (await describe([conversation], user))[0] };
  }
  async function send(user, id, payload = {}) {
    const actor = identity(user);
    const conversation = await member(user, id);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail(400, "Invalid message request");
    if (typeof payload.text !== "string" || !payload.text.trim() || payload.text.length > 2000) fail(400, "Message must contain 1–2000 characters");
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(payload.text)) fail(400, "Message contains invalid control characters");
    if (typeof payload.clientMessageId !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(payload.clientMessageId)) fail(400, "A valid message request ID is required");
    const key = { conversation: id, sender: actor.id, clientMessageId: payload.clientMessageId };
    let saved = await M.findOne(key).lean();
    if (!saved) {
      try { saved = await M.create({ ...key, senderRole: actor.role, text: payload.text.trim() }); }
      catch (error) { if (error.code !== 11000) throw error; saved = await M.findOne(key).lean(); }
    }
    if (saved.text !== payload.text.trim()) fail(409, "This message request ID has already been used");
    // Out-of-order concurrent requests must never replace a newer sidebar preview.
    await C.updateOne({ _id: id, $or: [{ lastMessageId: null }, { lastMessageId: { $lte: saved._id } }] },
      { $set: { lastMessage: saved.text, lastMessageAt: saved.createdAt, lastMessageId: saved._id } });
    return { message: messageDTO(saved), participants: conversation };
  }
  async function read(user, id, throughMessageId) {
    const actor = identity(user);
    const conversation = await member(user, id);
    if (!validId(throughMessageId)) fail(400, "A valid last visible message ID is required");
    const boundary = await M.findOne({ _id: throughMessageId, conversation: id }).select("_id").lean();
    if (!boundary) fail(400, "Message does not belong to this conversation");
    const readAt = new Date();
    await M.updateMany({ conversation: id, sender: { $ne: actor.id }, readAt: null, _id: { $lte: boundary._id } }, { $set: { readAt } });
    return { conversationId: id, readerId: actor.id, throughMessageId, readAt, participants: conversation };
  }
  return { member, start, list, history, send, read };
}
module.exports = { createConversationService, conversationService: createConversationService(), validId };
