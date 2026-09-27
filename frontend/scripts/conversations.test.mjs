import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { transformSync } from "esbuild";
import { mergeMessages, chatDay, counterpart } from "../src/utils/conversations.js";

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const nodes = (node) => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
function fixture(path, props = {}, mocks = {}) {
  const { code } = transformSync(read(path), { loader: "jsx", format: "cjs", jsx: "automatic" });
  const slots = []; let cursor = 0;
  const react = {
    Fragment: "Fragment", useEffect() {}, useCallback: (fn) => fn,
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
  };
  const module = { exports: {} }; const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(code, { module, exports: module.exports, crypto: webcrypto, document: { visibilityState: "visible" },
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name.endsWith(".css")) return {};
      for (const [key, value] of Object.entries(mocks)) if (name.endsWith(key)) return value;
      throw Error(`Unexpected import: ${name}`);
    } });
  const render = () => { cursor = 0; return module.exports.default(props); };
  return { render, find: (predicate) => nodes(render()).find(predicate), all: () => nodes(render()) };
}
function composer(onSend = async () => {}) {
  const calls = [], typing = [];
  const f = fixture("components/messages/MessageComposer.jsx", { connected: true, onTyping: (v) => typing.push(v), onSend: async (v) => { calls.push(v); return onSend(v); } });
  return { ...f, calls, typing,
    enter: (value) => f.find((n) => n.type === "textarea").props.onChange({ target: { value } }),
    submit: () => f.find((n) => n.type === "form").props.onSubmit({ preventDefault() {} }),
  };
}
test("composer trims and sends once, clears only after saved acknowledgement", async () => {
  let resolve; const f = composer(() => new Promise((r) => { resolve = r; }));
  f.enter("  Fresh tomatoes?  "); const pending = f.submit(); await f.submit();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].text, "Fresh tomatoes?");
  assert.ok(f.calls[0].clientMessageId); assert.equal(f.find((n) => n.type === "textarea").props.disabled, true);
  assert.equal(f.find((n) => n.type === "textarea").props.value, "  Fresh tomatoes?  ");
  resolve(); await pending;
  assert.equal(f.find((n) => n.type === "textarea").props.value, "");
});
test("failed send retains text and the retry ID, editing generates a new ID", async () => {
  const f = composer(async () => { throw Error("Offline"); }); f.enter("Keep draft"); await f.submit();
  assert.equal(f.find((n) => n.type === "textarea").props.value, "Keep draft");
  assert.match(f.find((n) => n.props.role === "alert").props.children, /Offline/);
  await f.submit(); assert.equal(f.calls[0].clientMessageId, f.calls[1].clientMessageId);
  f.enter("Changed draft"); await f.submit(); assert.notEqual(f.calls[1].clientMessageId, f.calls[2].clientMessageId);
});
test("empty/oversized drafts don't send; Shift+Enter and IME preserve native editing", async () => {
  const f = composer(); f.enter(" \n "); await f.submit(); f.enter("x".repeat(2001)); await f.submit();
  assert.equal(f.calls.length, 0); f.enter("hello");
  const textarea = f.find((n) => n.type === "textarea"); assert.equal(textarea.props.maxLength, 2000);
  let prevented = 0;
  textarea.props.onKeyDown({ key: "Enter", shiftKey: true, preventDefault() { prevented++; } });
  textarea.props.onKeyDown({ key: "Enter", nativeEvent: { isComposing: true }, preventDefault() { prevented++; } });
  assert.equal(prevented, 0); assert.equal(f.calls.length, 0);
  textarea.props.onKeyDown({ key: "Enter", preventDefault() { prevented++; } });
  assert.equal(prevented, 1); assert.equal(f.calls.length, 1);
});
test("profile and crop entry points create/reuse chat with only validated references", async () => {
  for (const cropId of [undefined, "tomato"]) {
    const calls = [], navigation = [];
    const f = fixture("components/messages/MessageFarmerButton.jsx", { farmerProfileId: "farm-profile", cropId }, {
      AuthContext: { useAuth: () => ({ user: { id: "customer", role: "CUSTOMER" } }) }, ChatContext: { useChat: () => ({ refresh() {} }) },
      "react-router-dom": { useNavigate: () => (...args) => navigation.push(args), useLocation: () => ({ pathname: "/crop/tomato" }) },
      conversationService: { startConversation: async (...args) => { calls.push(args); return { conversation: { _id: "pair" } }; } },
    });
    await f.find((n) => n.type === "button").props.onClick();
    assert.deepEqual(calls, [["farm-profile", cropId]]); assert.equal(navigation[0][0], "/messages?conversation=pair");
  }
});
test("farmer cannot start chat; anonymous entry goes to login without creating records", async () => {
  for (const user of [null, { role: "FARMER" }]) {
    let calls = 0, destination;
    const f = fixture("components/messages/MessageFarmerButton.jsx", { farmerProfileId: "farm" }, {
      AuthContext: { useAuth: () => ({ user }) }, ChatContext: { useChat: () => null },
      "react-router-dom": { useNavigate: () => (path) => { destination = path; }, useLocation: () => ({ pathname: "/farmer/farm" }) },
      conversationService: { startConversation: () => { calls++; } },
    });
    if (user) assert.equal(f.render(), null); else { await f.find((n) => n.type === "button").props.onClick(); assert.equal(destination, "/login"); }
    assert.equal(calls, 0);
  }
});
test("navbar unread badge is numeric and accessible, zero doesn't show a badge", () => {
  for (const unreadCount of [0, 3, 101]) {
    const f = fixture("components/messages/MessagesNavLink.jsx", {}, { ChatContext: { useChat: () => ({ unreadCount }) }, "react-router-dom": { NavLink: "NavLink" } });
    assert.equal(f.render().props.to, "/messages");
    assert.equal(f.render().props["aria-label"], `Messages${unreadCount ? `, ${unreadCount} unread` : ""}`);
    assert.equal(f.all().some((n) => n.props.children === "99+"), unreadCount > 99);
  }
});
test("REST, repeated socket events and reconnection use canonical IDs without regressing read state", () => {
  const initial = [{ _id: "001", text: "hello", readAt: "2026-09-27" }];
  const result = mergeMessages(initial, [{ _id: "002", text: "reply" }, { _id: "001", text: "hello", readAt: null }, { _id: "002", text: "reply" }]);
  assert.equal(result.length, 2); assert.equal(result[0].readAt, "2026-09-27");
});
test("conversation list searches counterpart and opens mobile pane, with selected state", () => {
  const selected = [];
  const conversation = { _id: "chat1", farmer: { id: "f", name: "Test Farmer", farmName: "Green Farm" }, customer: { id: "c", name: "Customer" }, lastMessage: "Available", lastMessageAt: new Date().toISOString(), unreadCount: 2 };
  const f = fixture("pages/messages/MessagesPage.jsx", {}, {
    AuthContext: { useAuth: () => ({ user: { id: "c", role: "CUSTOMER" } }) },
    ChatContext: { useChat: () => ({ conversations: [conversation], unreadCount: 2 }) },
    "react-router-dom": { Link: "Link", useSearchParams: () => [new URLSearchParams(), (value) => selected.push(value)] },
    conversationService: {}, conversations: { counterpart, chatDay, mergeMessages, chatTime: () => "8:42 PM" },
    formatters: { formatCurrency: () => "₹40" }, MessageComposer: { default: "MessageComposer" },
  });
  assert.ok(f.all().some((n) => n.props.children === "Test Farmer"));
  f.find((n) => n.type === "button" && n.props.className?.startsWith("chat-conversation")).props.onClick();
  assert.equal(selected[0].conversation, "chat1");
  f.find((n) => n.type === "input").props.onChange({ target: { value: "no match" } });
  assert.ok(f.all().some((n) => n.props.children === "No matching conversations."));
});
test("dates are calendar-aware and farmer sees customer as counterpart", () => {
  const now = new Date(2026, 8, 27, 14);
  assert.equal(chatDay(new Date(2026, 8, 27, 1), now), "Today");
  assert.equal(chatDay(new Date(2026, 8, 26, 1), now), "Yesterday");
  assert.equal(counterpart({ customer: { name: "Customer" }, farmer: { name: "Farmer" } }, "FARMER").name, "Customer");
});
test("chat render escapes text, aligns by session sender, handles back and cleans listeners", () => {
  const page = read("pages/messages/MessagesPage.jsx");
  assert.match(page, /message.sender === user.id/); assert.match(page, /<p>\{message.text\}<\/p>/); assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
  assert.match(page, /onBack=\{\(\) => setParams\(\{\}\)\}/);
  for (const event of ["message:new", "conversation:read", "conversation:typing", "connect"]) assert.ok(page.includes(`socket?.off("${event}"`));
  assert.match(page, /document.removeEventListener/); assert.match(page, /visualViewport\?\.removeEventListener/);
});
test("scoped light/dark styles use split desktop and mobile list-to-pane without fixed overlapping composer", () => {
  const css = read("styles/messages.css");
  assert.match(css, /\.dark \.chat-workspace/); assert.match(css, /grid-template-columns:320px minmax\(0,1fr\)/);
  assert.match(css, /@media \(max-width:767px\)/); assert.match(css, /\.chat-workspace.has-selection \.chat-sidebar/);
  assert.match(css, /overflow-wrap:anywhere/); assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /position:fixed/);
  assert.match(read("services/realtimeConnection.js"), /withCredentials: true/);
  assert.match(read("hooks/useNotifications.js"), /acquireRealtimeConnection/);
});
