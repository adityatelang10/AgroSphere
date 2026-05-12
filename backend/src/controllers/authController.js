const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");

const User = require("../models/User");

const JWT_EXPIRES_IN = "7d";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const USER_ROLES = ["FARMER", "CUSTOMER"];

const registerValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 80 })
    .withMessage("Name must be between 2 and 80 characters"),
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/[A-Z]/)
    .withMessage("Password must include at least one uppercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must include at least one number"),
  body("role")
    .notEmpty()
    .withMessage("Role is required")
    .isIn(USER_ROLES)
    .withMessage("Role must be either FARMER or CUSTOMER"),
  body("deliveryAddress").custom((value, { req }) => {
    if (req.body.role !== "CUSTOMER") {
      return true;
    }

    if (!value || typeof value !== "object") {
      throw new Error("Delivery address is required for customers");
    }

    const requiredFields = [
      "line1",
      "villageOrCity",
      "district",
      "state",
      "pincode",
    ];

    for (const field of requiredFields) {
      if (!value[field] || typeof value[field] !== "string" || !value[field].trim()) {
        throw new Error(`Delivery address ${field} is required for customers`);
      }
    }

    if (!/^\d{6}$/.test(value.pincode)) {
      throw new Error("Delivery address pincode must be a valid 6-digit Indian pincode");
    }

    return true;
  }),
];

const loginValidation = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
];

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: COOKIE_MAX_AGE,
});

const getCookieClearOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
});

const createToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing from environment variables.");
  }

  return jwt.sign(
    {
      userId: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN,
    }
  );
};

const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  deliveryAddress: user.deliveryAddress,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const handleValidation = (req, res) => {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return null;
  }

  return res.status(400).json({
    success: false,
    message: "Validation failed",
    errors: errors.array(),
  });
};

const register = async (req, res, next) => {
  const validationErrorResponse = handleValidation(req, res);
  if (validationErrorResponse) {
    return validationErrorResponse;
  }

  try {
    const { name, email, password, role, deliveryAddress } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const user = await User.create({
      name,
      email,
      password,
      role,
      deliveryAddress: role === "CUSTOMER" ? deliveryAddress : undefined,
    });

    const token = createToken(user);
    res.cookie("token", token, getCookieOptions());

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      user: sanitizeUser(user),
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    return next(error);
  }
};

const login = async (req, res, next) => {
  const validationErrorResponse = handleValidation(req, res);
  if (validationErrorResponse) {
    return validationErrorResponse;
  }

  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = createToken(user);
    res.cookie("token", token, getCookieOptions());

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: sanitizeUser(user),
    });
  } catch (error) {
    return next(error);
  }
};

const getCurrentUser = async (req, res) => {
  return res.status(200).json({
    success: true,
    user: sanitizeUser(req.user),
  });
};

const logout = async (req, res) => {
  res.clearCookie("token", getCookieClearOptions());

  return res.status(200).json({
    success: true,
    message: "Logout successful",
  });
};

module.exports = {
  registerValidation,
  loginValidation,
  register,
  login,
  getCurrentUser,
  logout,
};
