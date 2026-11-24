import { Router } from "express";
import ExcelJS from "exceljs";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAuth, requireAdmin, scopeDistrict } from "../middleware/auth.js";
import { generateCustomerId } from "../utils/customerId.js";

const router = Router();
router.use(requireAuth);

const phoneRx = /^[6-9]\d{9}$/;
const coreSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(150),
  phone: z.string().regex(phoneRx, "Enter a valid 10-digit Indian mobile number"),
  email: z.string().email("Enter a valid email address").or(z.literal("")).optional(),
  taluk: z.string().min(1, "Taluk is required").max(100),
  state: z.string().min(1, "State is required").max(100),
  problem_description: z.string().min(10, "Problem description must be at least 10 characters").max(2000),
});

function validateFormData(data) {
  const result = coreSchema.safeParse(data);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`);
    return { valid: false, errors };
  }
  return { valid: true };
}

async function logHistory(submissionId, action, actorId, note = null, snapshot = null) {
  await query(
    `INSERT INTO submission_history (submission_id, action, actor_id, note, data_snapshot) VALUES (?, ?, ?, ?, ?)`,
    [submissionId, action, actorId, note, snapshot ? JSON.stringify(snapshot) : null]
  );
}

function parseJson(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

// ── List ───────────────────────────────────────────────────────
router.get("/", scopeDistrict, async (req, res) => {
  try {
    const { status, form_type, search, date_from, date_to } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const pageSize = Math.min(parseInt(req.query.pageSize) || 25, 100);
    const offset = (page - 1) * pageSize;
    const where = ["s.deleted_at IS NULL"];
    const params = [];
    if (req.scopedDistrictId) { where.push("s.district_id = ?"); params.push(req.scopedDistrictId); }
    if (status) { where.push("s.status = ?"); params.push(status); }
    if (form_type) { where.push("s.form_type_code = ?"); params.push(form_type); }
    if (search) {
      where.push("(s.customer_id LIKE ? OR s.name LIKE ? OR s.phone LIKE ?)");
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (date_from) { where.push("s.created_at >= ?"); params.push(date_from); }
    if (date_to) { where.push("s.created_at <= ?"); params.push(date_to); }
    const wc = where.join(" AND ");
    const rows = await query(
      `SELECT s.id, s.customer_id, s.form_type_code, s.status, s.name, s.phone, s.taluk,
              s.submitted_at, s.created_at, s.updated_at, d.name AS district_name, d.code AS district_code
       FROM submissions s JOIN districts d ON d.id = s.district_id
       WHERE ${wc} ORDER BY s.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );
    const countRows = await query(`SELECT COUNT(*) AS total FROM submissions s WHERE ${wc}`, params);
    res.json({ rows, total: parseInt(countRows[0]?.total) || 0, page, pageSize });
  } catch (err) {
    console.error("List error:", err.message);
    res.status(500).json({ error: "Failed to load submissions" });
  }
});

// ── Excel export ───────────────────────────────────────────────
router.get("/export/excel", scopeDistrict, async (req, res) => {
  try {
    const { status, form_type } = req.query;
    const where = ["s.deleted_at IS NULL"];
    const params = [];
    if (req.scopedDistrictId) { where.push("s.district_id = ?"); params.push(req.scopedDistrictId); }
    if (status) { where.push("s.status = ?"); params.push(status); }
    if (form_type) { where.push("s.form_type_code = ?"); params.push(form_type); }
    const rows = await query(
      `SELECT s.*, d.name AS district_name, d.code AS district_code
       FROM submissions s JOIN districts d ON d.id = s.district_id
       WHERE ${where.join(" AND ")} ORDER BY s.created_at DESC`,
      params
    );
    const extraKeys = new Set();
    rows.forEach((r) => Object.keys(parseJson(r.data_json)).forEach((k) => extraKeys.add(k)));
    const fixedKeys = new Set(["name","phone","email","taluk","state"]);
    const dynamicKeys = [...extraKeys].filter((k) => !fixedKeys.has(k));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("CRETA Submissions");
    sheet.columns = [
      { header: "Customer ID", key: "customer_id", width: 32 },
      { header: "Form Type", key: "form_type_code", width: 10 },
      { header: "Status", key: "status", width: 12 },
      { header: "District", key: "district_name", width: 18 },
      { header: "Name", key: "name", width: 20 },
      { header: "Phone", key: "phone", width: 14 },
      { header: "Email", key: "email", width: 26 },
      { header: "Taluk", key: "taluk", width: 16 },
      { header: "State", key: "state", width: 14 },
      ...dynamicKeys.map((k) => ({ header: k.replace(/_/g," ").replace(/\b\w/g,(c)=>c.toUpperCase()), key: `_${k}`, width: 22 })),
      { header: "Approval/Rejection Note", key: "approval_note", width: 36 },
      { header: "Rejection Reason", key: "rejection_reason", width: 36 },
      { header: "Submitted At", key: "submitted_at", width: 22 },
      { header: "Reviewed At", key: "reviewed_at", width: 22 },
      { header: "Processed At", key: "processed_at", width: 22 },
    ];
    const hr = sheet.getRow(1);
    hr.font = { bold: true, color: { argb: "FFFFFFFF" } };
    hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C2333" } };
    hr.height = 20;
    rows.forEach((r) => {
      const d = parseJson(r.data_json);
      const row = {
        customer_id: r.customer_id, form_type_code: r.form_type_code,
        status: r.status?.toUpperCase(), district_name: r.district_name,
        name: r.name || d.name, phone: r.phone || d.phone,
        email: r.email || d.email, taluk: r.taluk || d.taluk, state: d.state,
        approval_note: r.approval_note, rejection_reason: r.rejection_reason,
        submitted_at: r.submitted_at, reviewed_at: r.reviewed_at, processed_at: r.processed_at,
      };
      dynamicKeys.forEach((k) => { row[`_${k}`] = d[k] ?? ""; });
      sheet.addRow(row);
    });
    sheet.autoFilter = { from: "A1", to: { row: 1, column: sheet.columns.length } };
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="creta-${Date.now()}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Export error:", err.message);
    res.status(500).json({ error: "Export failed" });
  }
});

// ── Single ─────────────────────────────────────────────────────
router.get("/:id", scopeDistrict, async (req, res) => {
  try {
    const where = ["s.id = ?", "s.deleted_at IS NULL"];
    const params = [req.params.id];
    if (req.scopedDistrictId) { where.push("s.district_id = ?"); params.push(req.scopedDistrictId); }
    const rows = await query(
      `SELECT s.*, d.name AS district_name, d.code AS district_code
       FROM submissions s JOIN districts d ON d.id = s.district_id WHERE ${where.join(" AND ")}`, params
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    const history = await query(
      `SELECT h.*, u.full_name AS actor_name FROM submission_history h
       JOIN users u ON u.id = h.actor_id WHERE h.submission_id = ? ORDER BY h.created_at ASC`,
      [req.params.id]
    );
    res.json({ ...rows[0], history });
  } catch (err) {
    res.status(500).json({ error: "Failed to load submission" });
  }
});

// ── Create draft ───────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    if (req.user.role !== "district") return res.status(403).json({ error: "Forbidden" });
    const { form_type_code, data } = req.body;
    if (!form_type_code || !data) return res.status(400).json({ error: "form_type_code and data required" });
    const result = await query(
      `INSERT INTO submissions (district_id, form_type_code, created_by, status, data_json, name, phone, email, taluk)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
      [req.user.district_id, form_type_code, req.user.id, JSON.stringify(data),
       data.name || null, data.phone || null, data.email || null, data.taluk || null]
    );
    await logHistory(result.insertId, "created", req.user.id);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: "Failed to create" });
  }
});

// ── Update draft ───────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    if (req.user.role !== "district") return res.status(403).json({ error: "Forbidden" });
    const { data } = req.body;
    const rows = await query(
      `SELECT * FROM submissions WHERE id = ? AND district_id = ? AND deleted_at IS NULL`,
      [req.params.id, req.user.district_id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    if (rows[0].status !== "draft") return res.status(409).json({ error: "Cannot edit submitted records" });
    await query(
      `UPDATE submissions SET data_json = ?, name = ?, phone = ?, email = ?, taluk = ? WHERE id = ?`,
      [JSON.stringify(data), data.name || null, data.phone || null, data.email || null, data.taluk || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

// ── Submit with validation ─────────────────────────────────────
router.post("/:id/submit", async (req, res) => {
  try {
    if (req.user.role !== "district") return res.status(403).json({ error: "Forbidden" });
    const rows = await query(
      `SELECT s.*, d.code AS district_code FROM submissions s JOIN districts d ON d.id = s.district_id
       WHERE s.id = ? AND s.district_id = ? AND s.deleted_at IS NULL`,
      [req.params.id, req.user.district_id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    if (rows[0].status !== "draft") return res.status(409).json({ error: "Already submitted" });

    const data = parseJson(rows[0].data_json);
    const validation = validateFormData(data);
    if (!validation.valid) {
      return res.status(422).json({ error: "Validation failed", fields: validation.errors });
    }
    const customerId = await generateCustomerId(rows[0].district_code, rows[0].form_type_code);
    await query(
      `UPDATE submissions SET status = 'pending', customer_id = ?, submitted_at = NOW() WHERE id = ?`,
      [customerId, req.params.id]
    );
    await logHistory(req.params.id, "submitted", req.user.id);
    res.json({ ok: true, customerId });
  } catch (err) {
    console.error("Submit error:", err.message);
    res.status(500).json({ error: "Submit failed" });
  }
});

// ── Approve (mandatory note) ───────────────────────────────────
router.post("/:id/approve", requireAdmin, async (req, res) => {
  try {
    const { note } = req.body;
    if (!note?.trim() || note.trim().length < 5)
      return res.status(400).json({ error: "Approval reason is required (min 5 characters)" });
    const rows = await query(`SELECT * FROM submissions WHERE id = ? AND deleted_at IS NULL`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    if (rows[0].status !== "pending") return res.status(409).json({ error: "Only pending can be approved" });
    await query(
      `UPDATE submissions SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(), approval_note = ? WHERE id = ?`,
      [req.user.id, note, req.params.id]
    );
    await logHistory(req.params.id, "approved", req.user.id, note);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Approve failed" });
  }
});

// ── Reject (mandatory reason) ──────────────────────────────────
router.post("/:id/reject", requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim() || reason.trim().length < 5)
      return res.status(400).json({ error: "Rejection reason is required (min 5 characters)" });
    const rows = await query(`SELECT * FROM submissions WHERE id = ? AND deleted_at IS NULL`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    if (rows[0].status !== "pending") return res.status(409).json({ error: "Only pending can be rejected" });
    await query(
      `UPDATE submissions SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), rejection_reason = ? WHERE id = ?`,
      [req.user.id, reason, req.params.id]
    );
    await logHistory(req.params.id, "rejected", req.user.id, reason);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Reject failed" });
  }
});

// ── Process (mandatory note) ───────────────────────────────────
router.post("/:id/process", requireAdmin, async (req, res) => {
  try {
    const { note } = req.body;
    if (!note?.trim() || note.trim().length < 5)
      return res.status(400).json({ error: "Processing note is required (min 5 characters)" });
    const rows = await query(`SELECT * FROM submissions WHERE id = ? AND deleted_at IS NULL`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    if (rows[0].status !== "approved") return res.status(409).json({ error: "Only approved can be processed" });
    await query(
      `UPDATE submissions SET status = 'processed', processed_at = NOW(), approval_note = ? WHERE id = ?`,
      [note, req.params.id]
    );
    await logHistory(req.params.id, "processed", req.user.id, note);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Process failed" });
  }
});

// ── Admin edit ─────────────────────────────────────────────────
router.put("/:id/admin-edit", requireAdmin, async (req, res) => {
  try {
    const { data } = req.body;
    const rows = await query(`SELECT * FROM submissions WHERE id = ? AND deleted_at IS NULL`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    await logHistory(req.params.id, "edited", req.user.id, "Admin edit", parseJson(rows[0].data_json));
    await query(
      `UPDATE submissions SET data_json = ?, name = ?, phone = ?, email = ?, taluk = ? WHERE id = ?`,
      [JSON.stringify(data), data.name||null, data.phone||null, data.email||null, data.taluk||null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Edit failed" });
  }
});

// ── Soft delete ────────────────────────────────────────────────
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await query(`UPDATE submissions SET deleted_at = NOW() WHERE id = ?`, [req.params.id]);
    await logHistory(req.params.id, "deleted", req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
});

export default router;
