import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const sslConfig = process.env.NODE_ENV === "production"
  ? { minVersion: "TLSv1.2", rejectUnauthorized: true }
  : { minVersion: "TLSv1.2", rejectUnauthorized: false };

export const pool = mysql.createPool({
  host: process.env.TIDB_HOST,
  port: Number(process.env.TIDB_PORT || 4000),
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DATABASE,
  ssl: sslConfig,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  dateStrings: true,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  connectTimeout: 20000,
});

// Keep connections alive — ping every 5 minutes so TiDB doesn't drop them
setInterval(async () => {
  try {
    await pool.query("SELECT 1");
  } catch (err) {
    console.warn("Keep-alive ping failed:", err.message);
  }
}, 5 * 60 * 1000);

export async function query(sql, params = []) {
  try {
    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (err) {
    // If connection was dropped, retry once with a fresh connection
    if (err.code === "ETIMEDOUT" || err.code === "ECONNRESET" || err.code === "PROTOCOL_CONNECTION_LOST") {
      console.warn("DB connection lost, retrying once...");
      const [rows] = await pool.execute(sql, params);
      return rows;
    }
    throw err;
  }
}