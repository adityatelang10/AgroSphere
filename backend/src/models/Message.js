const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, immutable: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  senderRole: { type: String, enum: ["CUSTOMER", "FARMER"], required: true, immutable: true },
  text: { type: String, trim: true, required: true, maxlength: 2000 },
  // An acknowledgement can be lost after MongoDB saves. Retrying the same draft is idempotent.
  clientMessageId: { type: String, required: true, maxlength: 80, immutable: true },
  readAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ conversation: 1, _id: -1 });
schema.index({ conversation: 1, readAt: 1, sender: 1 });
schema.index({ conversation: 1, sender: 1, clientMessageId: 1 }, { unique: true });
module.exports = mongoose.models.Message || mongoose.model("Message", schema);
