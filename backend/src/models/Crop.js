const mongoose = require("mongoose");

const CROP_UNITS = [
  "kg",
  "gram",
  "quintal",
  "dozen",
  "piece",
  "bundle",
  "packet",
  "litre",
];

const CROP_SEASONS = ["Kharif", "Rabi", "Zaid", "Year-round"];

const cropLocationSchema = new mongoose.Schema(
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

const cropImageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      trim: true,
      required: [true, "Image URL is required"],
    },
    publicId: {
      type: String,
      trim: true,
      required: [true, "Cloudinary publicId is required"],
    },
  },
  { _id: false }
);

const cropSchema = new mongoose.Schema(
  {
    farmer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FarmerProfile",
      required: [true, "Farmer profile reference is required"],
      index: true,
    },
    name: {
      type: String,
      trim: true,
      required: [true, "Crop name is required"],
      minlength: [2, "Crop name must be at least 2 characters"],
      maxlength: [120, "Crop name cannot exceed 120 characters"],
    },
    category: {
      type: String,
      trim: true,
      required: [true, "Category is required"],
      maxlength: [60, "Category cannot exceed 60 characters"],
      index: true,
    },
    description: {
      type: String,
      trim: true,
      required: [true, "Description is required"],
      minlength: [10, "Description must be at least 10 characters"],
      maxlength: [1500, "Description cannot exceed 1500 characters"],
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },
    unit: {
      type: String,
      required: [true, "Unit is required"],
      enum: {
        values: CROP_UNITS,
        message: "Unit must be one of the supported crop units",
      },
    },
    stockQuantity: {
      type: Number,
      required: [true, "Stock quantity is required"],
      min: [0, "Stock quantity cannot be negative"],
    },
    season: {
      type: String,
      required: [true, "Season is required"],
      enum: {
        values: CROP_SEASONS,
        message: "Season must be one of the supported Indian crop seasons",
      },
      index: true,
    },
    isOrganic: {
      type: Boolean,
      default: false,
      index: true,
    },
    location: {
      type: cropLocationSchema,
      required: [true, "Crop location is required"],
    },
    images: {
      type: [cropImageSchema],
      default: [],
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

cropSchema.index(
  { name: "text", description: "text" },
  {
    weights: {
      name: 5,
      description: 2,
    },
  }
);
cropSchema.index({ farmer: 1, createdAt: -1 });
cropSchema.index({ category: 1, createdAt: -1 });
cropSchema.index({ season: 1, createdAt: -1 });
cropSchema.index({ "location.state": 1, "location.district": 1, createdAt: -1 });

module.exports = mongoose.models.Crop || mongoose.model("Crop", cropSchema);
