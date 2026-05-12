const mongoose = require("mongoose");

const farmerLocationSchema = new mongoose.Schema(
  {
    district: {
      type: String,
      trim: true,
      required: [true, "District is required"],
      maxlength: [80, "District cannot exceed 80 characters"],
    },
    state: {
      type: String,
      trim: true,
      required: [true, "State is required"],
      maxlength: [80, "State cannot exceed 80 characters"],
    },
  },
  { _id: false }
);

const farmerProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Farmer user reference is required"],
      unique: true,
      index: true,
    },
    farmName: {
      type: String,
      trim: true,
      required: [true, "Farm name is required"],
      minlength: [2, "Farm name must be at least 2 characters"],
      maxlength: [120, "Farm name cannot exceed 120 characters"],
    },
    location: {
      type: farmerLocationSchema,
      required: [true, "Farm location is required"],
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [1000, "Bio cannot exceed 1000 characters"],
      default: "",
    },
    averageRating: {
      type: Number,
      min: [0, "Average rating cannot be less than 0"],
      max: [5, "Average rating cannot be more than 5"],
      default: 0,
    },
    totalReviews: {
      type: Number,
      min: [0, "Total reviews cannot be less than 0"],
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

farmerProfileSchema.index({ "location.state": 1, "location.district": 1 });
farmerProfileSchema.index({ averageRating: -1, totalReviews: -1 });

module.exports =
  mongoose.models.FarmerProfile ||
  mongoose.model("FarmerProfile", farmerProfileSchema);
