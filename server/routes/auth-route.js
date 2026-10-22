const express = require("express");
const { signup, login } = require("../controller/auth-controller");
const { forgotPassword, verifyResetCode, resetPassword } = require("../controller/password-reset-controller");
const { createAuthRateLimiter } = require("../middleware/auth-rate-limit");

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/forgot-password", createAuthRateLimiter({ limit: 5 }), forgotPassword);
router.post("/verify-reset-code", createAuthRateLimiter({ limit: 15 }), verifyResetCode);
router.post("/reset-password", createAuthRateLimiter({ limit: 15 }), resetPassword);

module.exports = router;
