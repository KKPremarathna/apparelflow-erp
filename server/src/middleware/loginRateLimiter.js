import { rateLimit } from "express-rate-limit";

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,

  // Successful demo logins do not consume the failure allowance.
  skipSuccessfulRequests: true,

  message: {
    message:
      "Too many failed login attempts. Please try again in 15 minutes.",
  },
});