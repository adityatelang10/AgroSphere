const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  farmer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  cropContext: { type: mongoose.Schema.Types.ObjectId, ref: "Crop", default: null },
  lastMessage: { type: String, default: "", maxlength: 2000 },
  lastMessageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
  lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });
schema.index({ customer: 1, farmer: 1 }, { unique: true });
schema.index({ customer: 1, lastMessageAt: -1, _id: -1 });
schema.index({ farmer: 1, lastMessageAt: -1, _id: -1 });
module.exports = mongoose.models.Conversation || mongoose.model("Conversation", schema);
