import express from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "fixtures");

const app = express();
app.use(express.json());

// In-memory store for dynamically seeded fixtures
const seededFixtures = new Map();

// Request logging middleware
app.use((req, _res, next) => {
  console.log(`[TMDB Mock] ${req.method} ${req.originalUrl}`);
  next();
});

// ── Helper: load fixture from disk ──────────────────────────────────
async function loadFixture(filename) {
  const filePath = join(FIXTURES_DIR, filename);
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

// ── Helper: resolve fixture (seeded first, then disk) ───────────────
async function resolveFixture(key, diskFilename) {
  if (seededFixtures.has(key)) {
    return seededFixtures.get(key);
  }
  return loadFixture(diskFilename);
}

// ── Helper: TMDB-style 404 error ────────────────────────────────────
function tmdbNotFound(res, message = "The resource you requested could not be found.") {
  return res.status(404).json({
    success: false,
    status_code: 34,
    status_message: message,
  });
}

// ── POST /__seed — dynamic fixture seeding ──────────────────────────
// Body: { key: string, data: object }
// Example: { key: "search:matrix", data: { page: 1, results: [...] } }
app.post("/__seed", (req, res) => {
  const { key, data } = req.body;
  if (!key || !data) {
    return res.status(400).json({ error: "Both 'key' and 'data' are required" });
  }
  seededFixtures.set(key, data);
  console.log(`[TMDB Mock] Seeded fixture: ${key}`);
  return res.json({ ok: true, key });
});

// ── DELETE /__seed — clear all seeded fixtures ──────────────────────
app.delete("/__seed", (_req, res) => {
  seededFixtures.clear();
  console.log("[TMDB Mock] Cleared all seeded fixtures");
  return res.json({ ok: true });
});

// ── GET /3/search/movie ─────────────────────────────────────────────
app.get("/3/search/movie", async (req, res) => {
  const query = (req.query.query || "").toLowerCase().trim();

  if (!query) {
    return res.status(422).json({
      success: false,
      status_code: 22,
      status_message: "Invalid parameters: Your request parameters are incorrect.",
    });
  }

  try {
    const seedKey = `search:${query}`;
    const diskFile = `search-${query.replace(/\s+/g, "-")}.json`;
    const data = await resolveFixture(seedKey, diskFile);
    return res.json(data);
  } catch {
    // No fixture found for this query — return empty results
    try {
      const empty = await loadFixture("search-empty.json");
      return res.json(empty);
    } catch {
      return res.json({ page: 1, results: [], total_pages: 0, total_results: 0 });
    }
  }
});

// ── GET /3/movie/:id/videos ─────────────────────────────────────────
app.get("/3/movie/:id/videos", async (req, res) => {
  const { id } = req.params;

  try {
    const data = await resolveFixture(`videos:${id}`, `videos-${id}.json`);
    return res.json(data);
  } catch {
    return tmdbNotFound(res);
  }
});

// ── GET /3/movie/:id ────────────────────────────────────────────────
app.get("/3/movie/:id", async (req, res) => {
  const { id } = req.params;
  const appendToResponse = req.query.append_to_response || "";

  try {
    const data = await resolveFixture(`movie:${id}`, `movie-${id}.json`);

    // If append_to_response includes videos and the fixture doesn't already
    // have them, try to merge from videos fixture
    if (appendToResponse.includes("videos") && !data.videos) {
      try {
        const videos = await resolveFixture(`videos:${id}`, `videos-${id}.json`);
        return res.json({ ...data, videos });
      } catch {
        return res.json({ ...data, videos: { id: Number(id), results: [] } });
      }
    }

    return res.json(data);
  } catch {
    return tmdbNotFound(res);
  }
});

// ── GET /3/trending/:mediaType/:timeWindow ──────────────────────────
app.get("/3/trending/:mediaType/:timeWindow", async (req, res) => {
  const { mediaType, timeWindow } = req.params;
  const seedKey = `trending:${mediaType}:${timeWindow}`;
  const diskFile = `trending-${timeWindow}.json`;

  try {
    const data = await resolveFixture(seedKey, diskFile);
    return res.json(data);
  } catch {
    return tmdbNotFound(res);
  }
});

// ── GET /3/genre/movie/list ─────────────────────────────────────────
app.get("/3/genre/movie/list", async (_req, res) => {
  try {
    const data = await resolveFixture("genre:list", "genre-list.json");
    return res.json(data);
  } catch {
    return tmdbNotFound(res);
  }
});

// ── Catch-all 404 ───────────────────────────────────────────────────
app.use((_req, res) => {
  return tmdbNotFound(res, "The resource you requested could not be found.");
});

// ── Start server ────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[TMDB Mock] Listening on port ${PORT}`);
});
