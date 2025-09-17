import { Router } from "express";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const publicDir  = path.join(__dirname, "..", "public");

// GET /local/ → serve the UI HTML (index.html)
router.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// GET /local/api/health → healthcheck for the local scope
router.get("/api/health", (_req, res) => {
  res.json({ ok: true, scope: "local", ts: new Date().toISOString() });
});

export default router;
