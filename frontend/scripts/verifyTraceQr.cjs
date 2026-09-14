const assert = require("node:assert/strict");

const jsQR = require("jsqr");
const { PNG } = require("pngjs");
const QRCode = require("qrcode");

const traceUrl =
  process.argv[2] ||
  "http://localhost:5173/trace/AGS-TOM-0123456789ABCDEF";

const verifyTraceQr = async () => {
  const imageBuffer = await QRCode.toBuffer(traceUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 288,
  });
  const png = PNG.sync.read(imageBuffer);
  const decoded = jsQR(
    new Uint8ClampedArray(png.data),
    png.width,
    png.height
  );

  assert.ok(decoded, "The generated PNG could not be decoded as a QR code");
  assert.equal(decoded.data, traceUrl);

  console.log(`Decoded trace URL: ${decoded.data}`);
};

verifyTraceQr().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
