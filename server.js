const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const SEED_FILE = path.join(__dirname, "data", "board.json");
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : SEED_FILE;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendJson(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(value));
}

function validSupplier(supplier) {
  return (
    supplier &&
    typeof supplier.id === "string" &&
    supplier.id.length <= 100 &&
    typeof supplier.name === "string" &&
    supplier.name.trim().length > 0 &&
    supplier.name.length <= 160
  );
}

function validBoard(value) {
  return (
    value &&
    typeof value === "object" &&
    Array.isArray(value.columns) &&
    value.columns.length <= 30 &&
    value.columns.every(
      (column) =>
        column &&
        typeof column.id === "string" &&
        column.id.length <= 100 &&
        typeof column.name === "string" &&
        column.name.trim().length > 0 &&
        column.name.length <= 80 &&
        typeof column.color === "string" &&
        /^#[0-9a-f]{6}$/i.test(column.color) &&
        Array.isArray(column.suppliers) &&
        column.suppliers.every(validSupplier)
    )
  );
}

function normalizeBoard(value) {
  if (validBoard(value)) return value;
  if (value && Array.isArray(value.lebedeva) && Array.isArray(value.terekhova) && Array.isArray(value.kuznetsova)) {
    return {
      columns: [
        { id: "lebedeva", name: "Светлана Лебедева", color: "#cf6c32", suppliers: value.lebedeva },
        { id: "terekhova", name: "Светлана Терехова", color: "#31695d", suppliers: value.terekhova },
        { id: "kuznetsova", name: "Дарья Кузнецова", color: "#506da8", suppliers: value.kuznetsova }
      ]
    };
  }
  throw new Error("INVALID_BOARD_FILE");
}

async function readBoard() {
  try {
    return normalizeBoard(JSON.parse(await fs.readFile(DATA_FILE, "utf8")));
  } catch (error) {
    if (error.code !== "ENOENT" || DATA_FILE === SEED_FILE) throw error;
    const seed = normalizeBoard(JSON.parse(await fs.readFile(SEED_FILE, "utf8")));
    await writeBoard(seed);
    return seed;
  }
}

let writeQueue = Promise.resolve();
function writeBoard(board) {
  writeQueue = writeQueue.then(async () => {
    const temporary = `${DATA_FILE}.tmp`;
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(temporary, `${JSON.stringify(board, null, 2)}\n`, "utf8");
    await fs.rename(temporary, DATA_FILE);
  });
  return writeQueue;
}

async function readRequestBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 250_000) throw new Error("PAYLOAD_TOO_LARGE");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(req, res) {
  const urlPath = new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname;
  const requested = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath.slice(1));
  const filePath = path.resolve(PUBLIC_DIR, requested);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname;

    if (pathname === "/board" && req.method === "GET") {
      return sendJson(res, 200, await readBoard());
    }

    if (pathname === "/board" && req.method === "POST") {
      const board = await readRequestBody(req);
      if (!validBoard(board)) {
        return sendJson(res, 400, { error: "Некорректные данные доски" });
      }
      await writeBoard(board);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" || req.method === "HEAD") {
      return serveStatic(req, res);
    }

    sendJson(res, 405, { error: "Метод не поддерживается" });
  } catch (error) {
    const status = error.message === "PAYLOAD_TOO_LARGE" ? 413 : 500;
    console.error(error);
    sendJson(res, status, { error: status === 413 ? "Слишком большой запрос" : "Ошибка сервера" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Supplier board is running at http://localhost:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});
