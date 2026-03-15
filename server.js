import express from "express";
import cors from "cors";

/**
 * Creates and returns the Express app with the given data.
 * Separated from app.listen so the app can be tested without binding a port.
 */
export function createApp(gridData, iterationsData) {
  const app = express();
  app.use(cors());

  app.get("/api/grid", (req, res) => {
    res.json({ grid: gridData });
  });

  app.get("/api/iterations", (req, res) => {
    const rawPage = parseInt(req.query.page ?? "0", 10);
    const rawSize = parseInt(req.query.size ?? "3", 10);
    const page = Math.max(0, Number.isNaN(rawPage) ? 0 : rawPage);
    const size = Math.min(100, Math.max(1, Number.isNaN(rawSize) ? 3 : rawSize));
    const start = page * size;
    const slice = iterationsData.slice(start, start + size);

    res.json({
      iterations: slice,
      page,
      size,
      total: iterationsData.length,
      hasMore: start + size < iterationsData.length,
    });
  });

  return app;
}

// Only start the server if this file is run directly (not imported in tests)
if (process.argv[1].includes("server.js")) {
  import("fs").then(({ default: fs }) => {
    const rawData = fs.readFileSync("./data_test.json", "utf-8");
    const data = JSON.parse(rawData);
    const { grid: gridData, iterations: iterationsData } = data[0];
    const app = createApp(gridData, iterationsData);
    const port = 5001;
    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  });
}
