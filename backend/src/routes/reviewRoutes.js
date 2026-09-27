const express = require("express");

const {
  createReview,
  createReviewValidation,
  cropIdValidation,
  getCropReviews,
  replyToReview,
  replyValidation,
  updateReview,
  updateReviewValidation,
  getMyReviews,
} = require("../controllers/reviewController");
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", authMiddleware, requireRole("CUSTOMER"), createReviewValidation, createReview);
router.get("/mine", authMiddleware, requireRole("CUSTOMER"), getMyReviews);
router.patch("/:id", authMiddleware, requireRole("CUSTOMER"), updateReviewValidation, updateReview);
router.get("/crop/:id", cropIdValidation, getCropReviews);
router.patch(
  "/:id/reply",
  authMiddleware,
  requireRole("FARMER"),
  replyValidation,
  replyToReview
);

module.exports = router;
