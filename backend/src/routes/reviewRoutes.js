const express = require("express");

const {
  createReview,
  createReviewValidation,
  cropIdValidation,
  getCropReviews,
  replyToReview,
  replyValidation,
} = require("../controllers/reviewController");
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", authMiddleware, requireRole("CUSTOMER"), createReviewValidation, createReview);
router.get("/crop/:id", cropIdValidation, getCropReviews);
router.patch(
  "/:id/reply",
  authMiddleware,
  requireRole("FARMER"),
  replyValidation,
  replyToReview
);

module.exports = router;
