const { deleteFromCloudinary, uploadBufferToCloudinary } = require("../config/cloudinary");
const FarmerProfile = require("../models/FarmerProfile");
const Crop = require("../models/Crop");
const { isObjectIdOrHexString } = require("mongoose");
const { serializePublicCrop } = require("../utils/publicCrop");
const { getCropRatingSummaries, getFarmerRatingSummary } = require("../services/reviewRatingService");

const PROFILE_IMAGE_FOLDER = "agrosphere/farmer-profiles";
const GALLERY_FOLDER = "agrosphere/farm-gallery";
const publicGallery = (images = []) => images.map((image) => ({ _id: image._id, url: image.url }));

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
      .select("farmName location bio gallery averageRating totalReviews createdAt updatedAt")
      .lean();

    return res.status(200).json({
      success: true,
      profile: profile ? {
        _id: profile._id, farmName: profile.farmName, bio: profile.bio,
        location: { district: profile.location?.district, state: profile.location?.state },
        averageRating: profile.averageRating, totalReviews: profile.totalReviews,
        createdAt: profile.createdAt, updatedAt: profile.updatedAt,
        gallery: publicGallery(profile.gallery),
      } : null,
    });
  } catch (error) {
    return next(error);
  }
};

const updateFarmerBio = async (req, res, next) => {
  if (typeof req.body?.bio !== "string" || req.body.bio.length > 500) {
    return res.status(400).json({ success: false, message: "Bio must be text with at most 500 characters" });
  }

  try {
    // Update this single field on the session owner's existing profile only.
    // Never accept a profile/user ID or other profile fields from the request.
    const profile = await FarmerProfile.findOneAndUpdate(
      { user: req.user._id },
      { $set: { bio: req.body.bio.trim() } },
      { new: true, runValidators: true }
    );
    if (!profile) return res.status(404).json({ success: false, message: "Farmer profile not found" });
    return res.json({ success: true, message: "Farm bio saved", bio: profile.bio });
  } catch (error) {
    return next(error);
  }
};

const getPublicFarmerProfile = async (req, res, next) => {
  if (!isObjectIdOrHexString(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid farmer profile ID" });
  }
  try {
    const profile = await FarmerProfile.findById(req.params.id)
      .populate({ path: "user", select: "name profileImage.url" }).lean();
    if (!profile) return res.status(404).json({ success: false, message: "Farmer profile not found" });
    const crops = await Crop.find({ farmer: profile._id, removedAt: null }).sort({ createdAt: -1 }).lean();
    const [ratingSummary, cropSummaries] = await Promise.all([
      getFarmerRatingSummary(profile._id), getCropRatingSummaries(crops.map((crop) => crop._id)),
    ]);
    return res.json({
      success: true,
      profile: {
        _id: profile._id,
        farmName: profile.farmName,
        bio: profile.bio,
        location: { district: profile.location?.district, state: profile.location?.state },
        user: {
          name: profile.user?.name || "Farmer",
          profileImage: profile.user?.profileImage?.url ? { url: profile.user.profileImage.url } : null,
        },
        gallery: publicGallery(profile.gallery),
        ...ratingSummary,
      },
      crops: crops.map((crop) => serializePublicCrop({ ...crop,
        ...(cropSummaries.get(String(crop._id)) || { averageRating: 0, totalReviews: 0 }),
        farmer: { ...profile, ...ratingSummary },
      })),
    });
  } catch (error) { return next(error); }
};

const addGalleryImages = async (req, res, next) => {
  const files = req.files || [];
  if (!files.length || files.length > 8 || files.some((file) =>
    !file.buffer?.length || file.buffer.length > 5 * 1024 * 1024 ||
    !detectedImageType(file.buffer) || detectedImageType(file.buffer) !== file.mimetype)) {
    return res.status(400).json({ success: false, message: "Select up to 8 valid JPEG, PNG, or WEBP images, 5 MB each" });
  }
  const uploaded = [];
  let saved = false;
  try {
    const profile = await FarmerProfile.findOne({ user: req.user._id });
    if (!profile) return res.status(404).json({ success: false, message: "Farmer profile not found" });
    if ((profile.gallery?.length || 0) + files.length > 8) {
      return res.status(400).json({ success: false, message: "Your farm gallery can contain at most 8 images" });
    }
    try {
      for (const file of files) {
        // Cloudinary decodes the image; signatures alone are not a full decoder.
        const image = await uploadBufferToCloudinary(file.buffer, GALLERY_FOLDER);
        uploaded.push({ url: image.secure_url, publicId: image.public_id });
      }
    } catch {
      return res.status(502).json({ success: false, message: "Photo upload failed. Check the images and try again." });
    }
    // The atomic capacity condition also protects against two simultaneous uploads.
    const updated = await FarmerProfile.findOneAndUpdate({
      _id: profile._id,
      user: req.user._id,
      $expr: { $lte: [{ $size: { $ifNull: ["$gallery", []] } }, 8 - uploaded.length] },
    }, { $push: { gallery: { $each: uploaded } } }, { new: true, runValidators: true });
    if (!updated) return res.status(409).json({ success: false, message: "Gallery changed. Refresh before adding more photos; the limit is 8." });
    saved = true;
    return res.status(201).json({ success: true, gallery: publicGallery(updated.gallery) });
  } catch (error) { return next(error); }
  finally {
    if (!saved) await Promise.allSettled(uploaded.map((image) => deleteFromCloudinary(image.publicId)));
  }
};

const removeGalleryImage = async (req, res, next) => {
  if (!isObjectIdOrHexString(req.params.imageId)) {
    return res.status(400).json({ success: false, message: "Invalid gallery image ID" });
  }
  try {
    const imageId = req.params.imageId.toLowerCase();
    // Ownership is derived from the session, never from a client-supplied farmer ID.
    const previous = await FarmerProfile.findOneAndUpdate({
      user: req.user._id, "gallery._id": imageId,
    }, { $pull: { gallery: { _id: imageId } } }, { new: false });
    if (!previous) return res.status(404).json({ success: false, message: "Gallery image not found in your profile" });
    const removed = previous.gallery.find((image) => String(image._id) === imageId);
    // Gallery uploads are separate assets. Never delete crop/profile-photo assets.
    if (removed?.publicId?.startsWith(`${GALLERY_FOLDER}/`)) {
      await deleteFromCloudinary(removed.publicId).catch(() => {
        console.warn("A removed gallery photo could not be cleaned up from image storage.");
      });
    }
    return res.json({ success: true, gallery: publicGallery(previous.gallery.filter((image) => String(image._id) !== imageId)) });
  } catch (error) { return next(error); }
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
  getPublicFarmerProfile,
  addGalleryImages,
  removeGalleryImage,
  getOwnFarmerProfile,
  updateFarmerBio,
  updateProfileImage,
};
