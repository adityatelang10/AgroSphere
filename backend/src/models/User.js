const bcrypt = require("bcrypt");
const mongoose = require("mongoose");

const SALT_ROUNDS = 12;

const deliveryAddressSchema = new mongoose.Schema(
  {
    line1: {
      type: String,
      trim: true,
      required: [true, "Address line 1 is required"],
      maxlength: [120, "Address line 1 cannot exceed 120 characters"],
    },
    line2: {
      type: String,
      trim: true,
      maxlength: [120, "Address line 2 cannot exceed 120 characters"],
    },
    villageOrCity: {
      type: String,
      trim: true,
      required: [true, "Village or city is required"],
      maxlength: [80, "Village or city cannot exceed 80 characters"],
    },
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
    pincode: {
      type: String,
      trim: true,
      required: [true, "Pincode is required"],
      match: [/^\d{6}$/, "Pincode must be a valid 6-digit Indian pincode"],
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      required: [true, "Name is required"],
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [80, "Name cannot exceed 80 characters"],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      required: [true, "Email is required"],
      unique: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    role: {
      type: String,
      enum: ["FARMER", "CUSTOMER"],
      required: [true, "Role is required"],
      index: true,
    },
    deliveryAddress: {
      type: deliveryAddressSchema,
      default: undefined,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) {
    return next();
  }

  try {
    this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
    return next();
  } catch (error) {
    return next(error);
  }
});

userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
