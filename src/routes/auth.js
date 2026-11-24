import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { query } from "../db/pool.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/tokens.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

function setCookie(res, token) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("creta_refresh", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Username and password required" });

    const rows = await query(
      `SELECT u.*, d.name AS district_name, d.code AS district_code
       FROM users u LEFT JOIN districts d ON d.id = u.district_id
       WHERE u.username = ? AND u.is_active = TRUE`,
      [username]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Invalid username or password" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid username or password" });

    await query(`UPDATE users SET last_login_at = NOW() WHERE id = ?`, [user.id]);
    await query(
      `INSERT INTO audit_log (actor_id, action, target_type, target_id, ip_address) VALUES (?, 'login', 'user', ?, ?)`,
      [user.id, user.id, req.ip]
    );

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    setCookie(res, refreshToken);

    res.json({
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.full_name,
        districtId: user.district_id,
        districtName: user.district_name,
        districtCode: user.district_code,
      },
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/refresh", async (req, res) => {
  const token = req.cookies?.creta_refresh;
  if (!token) return res.status(401).json({ error: "No refresh token" });
  try {
    const payload = verifyRefreshToken(token);
    const rows = await query(`SELECT * FROM users WHERE id = ? AND is_active = TRUE`, [payload.id]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "User not found" });
    const accessToken = signAccessToken(user);
    setCookie(res, signRefreshToken(user)); // rotate refresh token
    res.json({ accessToken });
  } catch {
    res.clearCookie("creta_refresh");
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("creta_refresh");
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT u.id, u.username, u.role, u.full_name, u.email, u.district_id,
              d.name AS district_name, d.code AS district_code
       FROM users u LEFT JOIN districts d ON d.id = u.district_id WHERE u.id = ?`,
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to get user" });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { username } = req.body;
    const rows = await query(`SELECT * FROM users WHERE username = ?`, [username]);
    const user = rows[0];
    if (!user) return res.json({ ok: true }); // don't leak usernames

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
      [user.id, tokenHash, expiresAt]
    );
    // In production: send email. For now, log the reset link.
    console.log(`[CRETA] Password reset for ${username}: ${process.env.CLIENT_URL}/reset-password/${rawToken}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Request failed" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword || newPassword.length < 8)
      return res.status(400).json({ error: "Valid token and password (min 8 chars) required" });

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const rows = await query(
      `SELECT * FROM password_resets WHERE token_hash = ? AND used = FALSE AND expires_at > NOW()`,
      [tokenHash]
    );
    const reset = rows[0];
    if (!reset) return res.status(400).json({ error: "Reset link is invalid or has expired" });

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await query(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, reset.user_id]);
    await query(`UPDATE password_resets SET used = TRUE WHERE id = ?`, [reset.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Reset failed" });
  }
});

router.post("/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8)
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    const rows = await query(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    const user = rows[0];
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Current password is incorrect" });
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await query(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Change password failed" });
  }
});

export default router;
