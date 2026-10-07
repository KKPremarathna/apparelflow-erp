const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function csrfProtection(req, res, next) {
  if (safeMethods.has(req.method)) {
    return next();
  }

  const allowedOrigin =
    process.env.CLIENT_URL || "http://localhost:5173";

  const origin = req.get("Origin");

  // If an Origin is present, it must exactly match our frontend.
  if (origin !== undefined && origin !== allowedOrigin) {
    return res.status(403).json({
      message: "Request origin is not allowed.",
    });
  }

  // Required even for requests without an Origin, e.g. Postman.
  if (req.get("X-CSRF-Protection") !== "1") {
    return res.status(403).json({
      message: "Required CSRF protection header is missing.",
    });
  }

  return next();
}