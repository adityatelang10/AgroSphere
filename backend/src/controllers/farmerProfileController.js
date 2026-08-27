const { deleteFromCloudinary, uploadBufferToCloudinary } = require("../config/cloudinary");
const FarmerProfile = require("../models/FarmerProfile");

const PROFILE_IMAGE_FOLDER = "agrosphere/farmer-profiles";

const detectedImageType = (buffer) => {
  if (!Buffer.isBuffer(buffer)) {
    return null;
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
};

const getOwnFarmerProfile = async (req, res, next) => {
  try {
    const profile = await FarmerProfile.findOne({ user: req.user._id })
      .select("farmName location bio averageRating totalReviews createdAt updatedAt")
      .lean();

    return res.status(200).json({
      success: true,
      profile,
    });
  } catch (error) {
    return next(error);
  }
};

const updateProfileImage = async (req, res, next) => {
  if (!req.file?.buffer?.length) {
    return res.status(400).json({
      success: false,
      message: "Select a JPEG, PNG, or WEBP image to upload",
    });
  }

  const actualMimeType = detectedImageType(req.file.buffer);

  if (!actualMimeType || actualMimeType !== req.file.mimetype) {
    return res.status(400).json({
      success: false,
      message: "The selected file is not a valid JPEG, PNG, or WEBP image",
    });
  }

  let uploadedImage = null;

  try {
    const previousPublicId = req.user.profileImage?.publicId;
    uploadedImage = await uploadBufferToCloudinary(req.file.buffer, PROFILE_IMAGE_FOLDER);

    req.user.profileImage = {
      url: uploadedImage.secure_url,
      publicId: uploadedImage.public_id,
    };
    await req.user.save();

    if (previousPublicId && previousPublicId !== uploadedImage.public_id) {
      deleteFromCloudinary(previousPublicId).catch((error) => {
        console.warn("Could not remove previous farmer profile image:", error.message);
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile photo updated successfully",
      profileImage: req.user.profileImage,
    });
  } catch (error) {
    if (uploadedImage?.public_id) {
      await deleteFromCloudinary(uploadedImage.public_id).catch(() => null);
    }

    return next(error);
  }
};

module.exports = {
  getOwnFarmerProfile,
  updateProfileImage,
};
