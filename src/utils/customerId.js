import { query } from "../db/pool.js";

// Generates CRETA-{DISTRICT}-{FORMTYPE}-{YYYYMMDD}-{SEQ} atomically.
export async function generateCustomerId(districtCode, formTypeCode) {
  const today = new Date();
  const ymd = today.toISOString().slice(0, 10).replace(/-/g, "");
  const seqKey = `${districtCode}-${formTypeCode}-${ymd}`;

  await query(
    `INSERT INTO id_sequences (seq_key, seq_value) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE seq_value = seq_value + 1`,
    [seqKey]
  );
  const [row] = await query(`SELECT seq_value FROM id_sequences WHERE seq_key = ?`, [seqKey]);
  const seq = String(row.seq_value).padStart(5, "0");

  return `CRETA-${districtCode}-${formTypeCode}-${ymd}-${seq}`;
}
