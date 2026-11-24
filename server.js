import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import submissionRoutes from "./routes/submissions.js";
import miscRoutes from "./routes/misc.js";

dotenv.config();
const app = express();

app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api", miscRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err.message || err);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err.message || err);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`CRETA API listening on port ${PORT}`));
