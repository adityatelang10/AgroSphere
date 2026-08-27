const express = require("express");
const multer = require("multer");

const {
  getOwnFarmerProfile,
  updateProfileImage,
} = require("../controllers/farmerProfileController");
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const profileImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: 3 * 1024 * 1024,
  },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      const error = new Error("Profile photo must be a JPEG, PNG, or WEBP image");
      error.statusCode = 400;
      return callback(error);
    }

    return callback(null, true);
  },
});

const uploadSingleProfileImage = (req, res, next) => {
  profileImageUpload.single("profileImage")(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "Profile photo must be 3 MB or smaller",
      });
    }

    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  });
};

router.use(authMiddleware, requireRole("FARMER"));
router.get("/profile", getOwnFarmerProfile);
router.put("/profile/image", uploadSingleProfileImage, updateProfileImage);

module.exports = router;
