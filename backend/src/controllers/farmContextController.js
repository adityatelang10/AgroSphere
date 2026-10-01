const FarmerProfile = require("../models/FarmerProfile");
const Crop = require("../models/Crop");

// Read-only, authenticated farm context. Identity never comes from request input.
const getFarmContext = async (req, res, next) => {
  try {
    const profile = await FarmerProfile.findOne({ user: req.user._id })
      .select("farmName location bio gallery averageRating totalReviews createdAt updatedAt").lean();
    const crops = profile ? await Crop.find({ farmer: profile._id, removedAt: null })
      .select("name unit stockQuantity location updatedAt").sort({ createdAt: -1 }).lean() : [];
    return res.json({ success: true,
      profile: profile ? { _id: profile._id, farmName: profile.farmName, location: { district: profile.location?.district, state: profile.location?.state },
        bio: profile.bio, averageRating: profile.averageRating, totalReviews: profile.totalReviews,
        createdAt: profile.createdAt, updatedAt: profile.updatedAt,
        gallery: (profile.gallery || []).map(({ _id, url }) => ({ _id, url })),
      } : null,
      crops: crops.map(({ _id, name, unit, stockQuantity, location, updatedAt }) => ({ _id, name, unit, stockQuantity, location: { district: location?.district, state: location?.state }, updatedAt })),
    });
  } catch (error) { return next(error); }
};

module.exports = { getFarmContext };
