const express = require("express");
const multer = require("multer");

const {
  createCrop,
  createCropValidation,
  cropIdValidation,
  deleteCrop,
  getCropById,
  listCropValidation,
  listCrops,
  updateCrop,
  updateCropValidation,
} = require("../controllers/cropController");
const { authMiddleware, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 5,
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      const error = new Error("Only image files are allowed");
      error.statusCode = 400;
      return cb(error);
    }

    return cb(null, true);
  },
});

router.get("/", listCropValidation, listCrops);
router.get("/:id", cropIdValidation, getCropById);
router.post(
  "/",
  authMiddleware,
  requireRole("FARMER"),
  upload.array("images", 5),
  createCropValidation,
  createCrop
);
router.put(
  "/:id",
  authMiddleware,
  requireRole("FARMER"),
  upload.array("images", 5),
  updateCropValidation,
  updateCrop
);
router.delete("/:id", authMiddleware, requireRole("FARMER"), cropIdValidation, deleteCrop);

module.exports = router;
