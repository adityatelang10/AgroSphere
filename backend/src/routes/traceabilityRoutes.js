const express = require("express");

const { getTraceabilityRecord } = require("../controllers/traceabilityController");

const router = express.Router();

router.get("/:traceabilityId", getTraceabilityRecord);

module.exports = router;
