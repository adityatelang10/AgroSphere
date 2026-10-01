const express = require("express");
const multer = require("multer");

const {
  getOwnFarmerProfile,
  updateFarmerBio,
  updateProfileImage,
  getPublicFarmerProfile,
  addGalleryImages,
  removeGalleryImage,
} = require("../controllers/farmerProfileController");
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");
const { getFarmContext } = require("../controllers/farmContextController");

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

const galleryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 8, fileSize: 5 * 1024 * 1024, fields: 0 },
  fileFilter: (req, file, callback) => callback(
    allowedMimeTypes.has(file.mimetype) ? null : new Error("Choose JPEG, PNG, or WEBP images"),
    allowedMimeTypes.has(file.mimetype)
  ),
}).array("images", 8);

const uploadGalleryImages = (req, res, next) => galleryUpload(req, res, (error) => {
  if (!error) return next();
  return res.status(400).json({
    success: false,
    message: error.code === "LIMIT_FILE_SIZE"
      ? "Each gallery photo must be 5 MB or smaller"
      : "Upload up to 8 JPEG, PNG, or WEBP images using the images field",
  });
});

router.get("/public/:id", getPublicFarmerProfile);
router.use(authMiddleware, requireRole("FARMER"));
router.get("/context", getFarmContext);
router.get("/profile", getOwnFarmerProfile);
router.patch("/profile", updateFarmerBio);
router.put("/profile/image", uploadSingleProfileImage, updateProfileImage);
router.post("/profile/gallery", uploadGalleryImages, addGalleryImages);
router.delete("/profile/gallery/:imageId", removeGalleryImage);

module.exports = router;
