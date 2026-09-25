const nodemailer = require("nodemailer");

const getMailConfiguration = (environment = process.env) => {
  const port = Number(environment.SMTP_PORT || 587);
  const secure = environment.SMTP_SECURE === "true";
  const clientUrl = new URL(environment.CLIENT_URL || "http://localhost:5173");
  const localHttp = clientUrl.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(clientUrl.hostname) &&
    environment.NODE_ENV !== "production";
  if (!environment.SMTP_HOST || !environment.SMTP_USER || !environment.SMTP_PASS ||
      !environment.SMTP_FROM || !Number.isInteger(port) || port < 1 || port > 65535 ||
      (clientUrl.protocol !== "https:" && !localHttp) || clientUrl.username || clientUrl.password ||
      (environment.SMTP_SECURE && !["true", "false"].includes(environment.SMTP_SECURE))) {
    throw new Error("Password recovery email is not configured.");
  }
  return {
    from: environment.SMTP_FROM,
    clientOrigin: clientUrl.origin,
    transport: {
      host: environment.SMTP_HOST,
      port,
      secure,
      requireTLS: !secure,
      auth: { user: environment.SMTP_USER, pass: environment.SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      disableFileAccess: true,
      disableUrlAccess: true,
    },
  };
};

const sendResetEmail = async ({ email, token, configuration }) => {
  const transport = nodemailer.createTransport(configuration.transport);
  // Fragment tokens are not sent in HTTP request URLs or Referer headers.
  const link = `${configuration.clientOrigin}/reset-password#token=${token}`;
  const result = await transport.sendMail({
    from: configuration.from,
    to: email,
    subject: "Reset your AgroSphere password",
    text: `A password reset was requested for your AgroSphere account.\n\nOpen this link within 15 minutes:\n${link}\n\nThe link works once. If you did not request it, ignore this email. Your password has not changed.\nNever share this link.`,
  });
  if (!result?.accepted?.length) throw new Error("SMTP did not accept the reset email.");
  // Never return raw provider responses, recipients or the message content.
  return { accepted: true };
};

const sendPasswordChangedEmail = async ({ email, configuration }) => {
  await nodemailer.createTransport(configuration.transport).sendMail({
    from: configuration.from,
    to: email,
    subject: "Your AgroSphere password was changed",
    text: "Your AgroSphere password was reset and previous sessions were invalidated. If you did not make this change, secure your email account and contact the AgroSphere operator. This email never contains your password.",
  });
};

module.exports = { getMailConfiguration, sendResetEmail, sendPasswordChangedEmail };
