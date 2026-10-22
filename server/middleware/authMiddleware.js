const jwt = require("jsonwebtoken");
const User = require("../model/user");

exports.protect = async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select("-password");
      if (!req.user || (decoded.rv ?? 0) !== (req.user.tokenVersion || 0)) {
        return res.status(401).json({ error: "Session expired. Please log in again." });
      }
      next();
    } catch (err) {
      res.status(401).json({ error: "Not authorized" });
    }
  }
  if (!token) res.status(401).json({ error: "Not authorized, no token" });
};

// Conversions remain available to guests. If a token is supplied, it must be
// valid and linked to a current account before any history can be recorded.
exports.optionalProtect = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return next();
  const match = /^Bearer ([^\s]+)$/i.exec(header);
  if (!match) return res.status(401).json({ error: "Session expired. Please log in again." });
  try {
    const decoded = jwt.verify(match[1], process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user || (decoded.rv ?? 0) !== (req.user.tokenVersion || 0)) {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }
    return next();
  } catch {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
};
