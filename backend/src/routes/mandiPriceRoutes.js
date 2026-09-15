const express = require("express");
const { getLatestMandiPrice } = require("../controllers/mandiPriceController");
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();
router.get("/mandi/latest", authMiddleware, requireRole("FARMER"), getLatestMandiPrice);

module.exports = router;
