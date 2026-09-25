const crypto = require("crypto");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const { sendResetEmail } = require("./passwordResetMailService");

const hashResetToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const isValidPassword = (password) => typeof password === "string" &&
  password.length >= 8 && Buffer.byteLength(password, "utf8") <= 72 &&
  /[A-Z]/.test(password) && /[0-9]/.test(password);

const createPasswordResetService = ({ UserModel = User, sendMail = sendResetEmail,
  now = () => new Date() } = {}) => ({
  async requestReset(email, configuration) {
    const user = await UserModel.findOne({ email });
    if (!user) return;
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(token);
    await UserModel.updateOne({ _id: user._id }, { $set: {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: new Date(now().getTime() + 15 * 60 * 1000),
    } });
    try {
      const delivery = await sendMail({ email: user.email, token, configuration });
      return { emailAccepted: delivery?.accepted === true };
    } catch (error) {
      // A failed older delivery must not invalidate a newer request.
      await UserModel.updateOne({ _id: user._id, passwordResetTokenHash: tokenHash }, {
        $unset: { passwordResetTokenHash: "", passwordResetExpiresAt: "" },
      });
      const safeError = new Error("Password recovery email delivery failed.");
      const safeCodes = ["EAUTH", "ETIMEDOUT", "ECONNECTION", "ESOCKET", "ETLS", "EENVELOPE", "EMESSAGE", "EDNS"];
      safeError.deliveryCode = safeCodes.includes(error?.code) ? error.code : "UNAVAILABLE";
      throw safeError;
    }
  },
  async resetPassword(token, password) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token) || !isValidPassword(password)) {
      return null;
    }
    const tokenHash = hashResetToken(token);
    const match = { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { $gt: now() } };
    if (!await UserModel.exists(match)) return null;
    const passwordHash = await bcrypt.hash(password, 12);
    // Atomic consume prevents concurrent submissions from reusing the same token.
    // Query updates do not run User's pre-save hashing hook.
    return UserModel.findOneAndUpdate({ ...match, passwordResetExpiresAt: { $gt: now() } }, {
      $set: { password: passwordHash },
      $unset: { passwordResetTokenHash: "", passwordResetExpiresAt: "" },
      $inc: { authVersion: 1 },
    }, { new: true });
  },
});

module.exports = { createPasswordResetService, hashResetToken, isValidPassword };
