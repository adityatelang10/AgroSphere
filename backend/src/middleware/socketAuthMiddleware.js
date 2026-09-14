const cookieParser = require("cookie-parser");

const { getUserFromToken } = require("../utils/authToken");

const parseCookies = cookieParser();
const SOCKET_ROLES = ["FARMER", "CUSTOMER"];

const socketAuthMiddleware = async (socket, next) => {
  try {
    // Parse the handshake exactly like HTTP cookies, never client auth/query IDs.
    const request = { headers: socket.handshake.headers };
    await new Promise((resolve, reject) => {
      parseCookies(request, {}, (error) => (error ? reject(error) : resolve()));
    });

    const token = request.cookies?.token;
    if (!token) {
      return next(new Error("Authentication required"));
    }

    const user = await getUserFromToken(token);
    if (!user || !SOCKET_ROLES.includes(user.role)) {
      return next(new Error("Authentication required"));
    }

    socket.data.user = { id: String(user._id), role: user.role };
    return next();
  } catch (error) {
    // Do not send JWT, configuration, or database errors to the browser.
    return next(new Error("Authentication required"));
  }
};

const configureSocketAuthentication = (io) => {
  io.use(socketAuthMiddleware);
  io.on("connection", (socket) => {
    socket.join(`user:${socket.data.user.id}`);
  });
};

module.exports = { configureSocketAuthentication, socketAuthMiddleware };
