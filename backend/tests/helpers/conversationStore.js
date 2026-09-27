const mongoose = require("mongoose");
const Message = require("../../src/models/Message");

// A query-compatible persistence double: never opens a real database connection.
function makeConversationStore() {
  const state = { users: [], farms: [], crops: [], conversations: [], messages: [] };
  const equal = (a, b) => String(a ?? "") === String(b ?? "");
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some((clause) => matches(row, clause));
    if (value && typeof value === "object" && !value._bsontype && !(value instanceof Date)) {
      return Object.entries(value).every(([op, expected]) => {
        if (op === "$in") return expected.some((v) => equal(row[key], v));
        if (op === "$ne") return !equal(row[key], expected);
        if (op === "$lt") return String(row[key]) < String(expected);
        if (op === "$lte") return String(row[key]) <= String(expected);
        throw Error(`Unsupported operator ${op}`);
      });
    }
    return equal(row[key], value);
  });
  function query(get) {
    let order, skip = 0, limit = Infinity;
    const q = { select() { return q; }, lean() { return q; }, sort(value) { order = value; return q; },
      skip(value) { skip = value; return q; }, limit(value) { limit = value; return q; },
      then(resolve, reject) { return Promise.resolve().then(get).then((result) => {
        if (!Array.isArray(result)) return result ? { ...result } : null;
        const copy = result.map((r) => ({ ...r }));
        if (order) copy.sort((a, b) => { for (const [key, direction] of Object.entries(order)) {
          const comparison = a[key] instanceof Date ? a[key] - b[key] : String(a[key]).localeCompare(String(b[key]));
          if (comparison) return comparison * direction;
        } return 0; });
        return copy.slice(skip, skip + limit);
      }).then(resolve, reject); },
    }; return q;
  }
  const model = (key) => ({
    find: (filter) => query(() => state[key].filter((row) => matches(row, filter))),
    findOne: (filter) => query(() => state[key].find((row) => matches(row, filter))),
    findById: (id) => query(() => state[key].find((row) => equal(row._id, id))),
  });
  const Conversation = { ...model("conversations"),
    findOneAndUpdate: (filter, update, options = {}) => query(() => {
      let row = state.conversations.find((r) => matches(r, filter));
      if (!row && options.upsert) {
        row = { _id: new mongoose.Types.ObjectId(), ...filter, ...update.$setOnInsert, lastMessage: "", lastMessageId: null, lastMessageAt: new Date() };
        state.conversations.push(row);
      }
      if (row) Object.assign(row, update.$set || {});
      return row;
    }),
    updateOne: async (filter, update) => {
      const row = state.conversations.find((r) => matches(r, filter));
      if (row) Object.assign(row, update.$set);
      return { matchedCount: row ? 1 : 0 };
    },
    aggregate: async (pipeline) => {
      const own = state.conversations.filter((r) => matches(r, pipeline[0].$match));
      const senderFilter = pipeline[1].$lookup.pipeline[0].$match.sender;
      const count = state.messages.filter((m) => own.some((c) => equal(c._id, m.conversation)) && matches(m, { sender: senderFilter, readAt: null })).length;
      return [{ count }];
    },
  };
  const Messages = { ...model("messages"),
    create: async (data) => {
      const doc = new Message(data); await doc.validate();
      if (state.messages.some((r) => matches(r, { conversation: data.conversation, sender: data.sender, clientMessageId: data.clientMessageId }))) throw Object.assign(Error("Duplicate"), { code: 11000 });
      const row = { ...doc.toObject(), createdAt: new Date(), updatedAt: new Date() }; state.messages.push(row); return row;
    },
    updateMany: async (filter, update) => state.messages.filter((r) => matches(r, filter)).forEach((r) => Object.assign(r, update.$set)),
    aggregate: async (pipeline) => {
      const counts = new Map();
      state.messages.filter((m) => matches(m, pipeline[0].$match)).forEach((m) => counts.set(String(m.conversation), (counts.get(String(m.conversation)) || 0) + 1));
      return [...counts].map(([_id, count]) => ({ _id, count }));
    },
  };
  return { state, models: { Conversation, Message: Messages, FarmerProfile: model("farms"), User: model("users"), Crop: model("crops") } };
}
module.exports = { makeConversationStore };
