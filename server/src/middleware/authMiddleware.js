import jwt from "jsonwebtoken";
import prisma from "../db/prisma.js";

export async function requireAuth(req, res, next) {
  const token = req.cookies?.access_token;

  if (!token) {
    return res.status(401).json({
      message: "Please log in first.",
    });
  }

  let payload;

  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch {
    return res.status(401).json({
      message: "Invalid or expired session. Please log in again.",
    });
  }

  if (
    payload === null ||
    typeof payload !== "object" ||
    typeof payload.sub !== "string" ||
    payload.sub.trim() === ""
  ) {
    return res.status(401).json({
      message: "Invalid session.",
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: {
        id: payload.sub,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        message: "User no longer exists. Please log in again.",
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    console.error("Authentication lookup failed:", error.message);

    return res.status(500).json({
      message: "Unable to verify your session.",
    });
  }
}