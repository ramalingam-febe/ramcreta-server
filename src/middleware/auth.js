import { verifyAccessToken } from "../utils/tokens.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin access required" });
  next();
}

// Forces any district-scoped query to use the token's own district_id,
// never a client-supplied value. This is the core multi-tenant security rule.
export function scopeDistrict(req, res, next) {
  if (req.user.role === "district") {
    req.scopedDistrictId = req.user.district_id;
  } else {
    req.scopedDistrictId = req.query.district_id ? Number(req.query.district_id) : null;
  }
  next();
}
