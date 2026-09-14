const express = require("express");

const { getCurrentWeather } = require("../controllers/weatherController");
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", authMiddleware, requireRole("FARMER"), getCurrentWeather);

module.exports = router;
