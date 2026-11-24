import jwt from "jsonwebtoken";

export function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, district_id: user.district_id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
}

export function signRefreshToken(user) {
  return jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}
