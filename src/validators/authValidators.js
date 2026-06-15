const { body } = require("express-validator");

exports.registerValidator = [
  body("fullName").trim().notEmpty().withMessage("Full name is required"),

  body("phone")
    .matches(/^\d{10}$/)
    .withMessage("Phone number must be 10 digits"),

  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),

  body("role")
    .optional()
    .isIn(["household/individual buyer", "bulk/shop buyer"])
    .withMessage("Invalid role"),
];

exports.loginValidator = [
  body("phone")
    .matches(/^\d{10}$/)
    .withMessage("Invalid phone number"),

  body("password").notEmpty().withMessage("Password is required"),
];

