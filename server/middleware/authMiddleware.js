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
      if (!req.user) return res.status(401).json({ error: "Not authorized" });
      next();
    } catch (err) {
      res.status(401).json({ error: "Not authorized" });
    }
  }
  if (!token) res.status(401).json({ error: "Not authorized, no token" });
};
