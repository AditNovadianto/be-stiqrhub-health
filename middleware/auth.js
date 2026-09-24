import jwt from "jsonwebtoken";

export function verifyToken(req, res, next) {
  // Ambil token dari header Authorization: "Bearer <token>"
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ")
    ? auth.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      error: "Token missing",
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET,
    );

    // Simpan payload token ke request
    req.user = decoded;

    return next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Token expired",
      });
    }

    return res.status(403).json({
      error: "Invalid token",
    });
  }
}