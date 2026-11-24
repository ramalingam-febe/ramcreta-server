import { Router } from "express";
import bcrypt from "bcryptjs";
import { query } from "../db/pool.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// ── Districts with activity stats ─────────────────────────────
router.get("/districts", async (req, res) => {
  try {
    const rows = await query(
      `SELECT d.id, d.code, d.name, d.state,
              COUNT(s.id) AS total_submissions,
              SUM(CASE WHEN s.status = 'pending' AND s.deleted_at IS NULL THEN 1 ELSE 0 END) AS pending_count,
              MAX(s.submitted_at) AS last_submission_at
       FROM districts d
       LEFT JOIN submissions s ON s.district_id = d.id
       GROUP BY d.id ORDER BY d.name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load districts" });
  }
});

router.get("/districts/:id/stats", requireAdmin, async (req, res) => {
  try {
    const rows = await query(
      `SELECT status, COUNT(*) AS count FROM submissions
       WHERE district_id = ? AND deleted_at IS NULL GROUP BY status`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load stats" });
  }
});

// ── Form templates ─────────────────────────────────────────────
router.get("/form-templates", async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM form_templates WHERE is_active = TRUE ORDER BY form_type_code`
    );
    res.json(rows.map((r) => ({
      ...r,
      schema_json: typeof r.schema_json === "string" ? JSON.parse(r.schema_json) : r.schema_json,
    })));
  } catch (err) {
    res.status(500).json({ error: "Failed to load templates" });
  }
});

router.post("/admin/form-templates", requireAdmin, async (req, res) => {
  try {
    const { form_type_code, form_type_name, schema } = req.body;
    await query(
      `INSERT INTO form_templates (form_type_code, form_type_name, schema_json, created_by) VALUES (?, ?, ?, ?)`,
      [form_type_code, form_type_name, JSON.stringify(schema), req.user.id]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to create template" });
  }
});

router.put("/admin/form-templates/:id", requireAdmin, async (req, res) => {
  try {
    const { form_type_name, schema, is_active } = req.body;
    await query(
      `UPDATE form_templates SET form_type_name = ?, schema_json = ?, is_active = ? WHERE id = ?`,
      [form_type_name, JSON.stringify(schema), is_active ?? true, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update template" });
  }
});

// ── User management ────────────────────────────────────────────
router.get("/admin/users", requireAdmin, async (req, res) => {
  try {
    const rows = await query(
      `SELECT u.id, u.username, u.role, u.full_name, u.email, u.district_id,
              u.is_active, u.last_login_at, d.name AS district_name
       FROM users u LEFT JOIN districts d ON d.id = u.district_id
       ORDER BY u.role, d.name`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load users" });
  }
});

router.post("/admin/users", requireAdmin, async (req, res) => {
  try {
    const { username, password, role, district_id, full_name, email } = req.body;
    if (!username || !password || !role)
      return res.status(400).json({ error: "username, password, role required" });
    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (username, password_hash, role, district_id, full_name, email) VALUES (?, ?, ?, ?, ?, ?)`,
      [username, hash, role, role === "district" ? district_id : null, full_name || null, email || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Username already exists" });
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.put("/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    const { full_name, email, is_active } = req.body;
    await query(
      `UPDATE users SET full_name = ?, email = ?, is_active = ? WHERE id = ?`,
      [full_name, email, is_active ?? true, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

router.post("/admin/users/:id/reset-password", requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8)
      return res.status(400).json({ error: "Password too short" });
    const hash = await bcrypt.hash(newPassword, 12);
    await query(`UPDATE users SET password_hash = ? WHERE id = ?`, [hash, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Reset failed" });
  }
});

// ── Reports ────────────────────────────────────────────────────
router.get("/admin/reports/summary", requireAdmin, async (req, res) => {
  try {
    const [byStatus, byDistrict, byFormType, trend] = await Promise.all([
      query(`SELECT status, COUNT(*) AS count FROM submissions WHERE deleted_at IS NULL GROUP BY status`),
      query(
        `SELECT d.name AS district_name, COUNT(*) AS count FROM submissions s
         JOIN districts d ON d.id = s.district_id WHERE s.deleted_at IS NULL
         GROUP BY d.id ORDER BY count DESC LIMIT 10`
      ),
      query(`SELECT form_type_code, COUNT(*) AS count FROM submissions WHERE deleted_at IS NULL GROUP BY form_type_code`),
      query(
        `SELECT DATE(created_at) AS day, COUNT(*) AS count FROM submissions
         WHERE deleted_at IS NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY DATE(created_at) ORDER BY day`
      ),
    ]);
    res.json({ byStatus, byDistrict, byFormType, trend });
  } catch (err) {
    res.status(500).json({ error: "Failed to load summary" });
  }
});

router.get("/district/reports/summary", async (req, res) => {
  try {
    if (req.user.role !== "district") return res.status(403).json({ error: "Forbidden" });
    const byStatus = await query(
      `SELECT status, COUNT(*) AS count FROM submissions
       WHERE district_id = ? AND deleted_at IS NULL GROUP BY status`,
      [req.user.district_id]
    );
    res.json({ byStatus });
  } catch (err) {
    res.status(500).json({ error: "Failed to load summary" });
  }
});

// ── Audit log ──────────────────────────────────────────────────
router.get("/admin/audit-log", requireAdmin, async (req, res) => {
  try {
    const rows = await query(
      `SELECT a.*, u.full_name AS actor_name FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load audit log" });
  }
});

export default router;
