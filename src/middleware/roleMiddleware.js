const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Access denied",
      });
    }

    next();
  };
};

const allowedRoles = ["household/individual", "bulk/shop"];

const validateRegistrationRole = (req, res, next) => {
  const { role } = req.body;

  if (!role) {
    req.body.role = "household/individual";
    return next();
  }

  if (!allowedRoles.includes(role)) {
    return res.status(400).json({
      message: "Invalid role selected",
    });
  }

  next();
};

((module.exports = validateRegistrationRole), authorize);


