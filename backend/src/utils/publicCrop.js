const publicLocation = (location) =>
  location
    ? { district: location.district, state: location.state }
    : null;

// Allowlist public fields instead of spreading MongoDB documents. Keep the IDs
// used by crop/profile links and the existing My Crops ownership filter.
const serializePublicCrop = (crop) => {
  const farmer = crop.farmer;
  const user = farmer?.user;

  return {
    _id: crop._id,
    traceabilityId: crop.traceabilityId,
    name: crop.name,
    category: crop.category,
    description: crop.description,
    price: crop.price,
    unit: crop.unit,
    stockQuantity: crop.stockQuantity,
    season: crop.season,
    harvestDate: crop.harvestDate,
    isOrganic: crop.isOrganic,
    location: publicLocation(crop.location),
    images: (crop.images || []).map((image) => ({ url: image.url })),
    averageRating: crop.averageRating,
    totalReviews: crop.totalReviews,
    createdAt: crop.createdAt,
    updatedAt: crop.updatedAt,
    farmer: farmer
      ? {
          _id: farmer._id,
          farmName: farmer.farmName,
          location: publicLocation(farmer.location),
          bio: farmer.bio,
          averageRating: farmer.averageRating,
          totalReviews: farmer.totalReviews,
          user: user
            ? {
                _id: user._id,
                name: user.name,
                profileImage: user.profileImage?.url
                  ? { url: user.profileImage.url }
                  : null,
              }
            : null,
        }
      : null,
  };
};

module.exports = { serializePublicCrop };
