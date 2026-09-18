const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "dist");
const SEED_FILE = path.join(__dirname, "data", "board.json");
const DATA_FILE = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : SEED_FILE;
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "s.vento85@gmail.com").trim().toLowerCase();
const APP_URL = (process.env.APP_URL || "").replace(/\/+$/, "");
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".ico": "image/x-icon"
};

function sendJson(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}

async function readRequestBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error("PAYLOAD_TOO_LARGE");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function cleanText(value, max = 500) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function validSupplier(supplier) { return supplier && typeof supplier.id === "string" && typeof supplier.name === "string" && supplier.name.trim(); }
function validBoard(value) {
  return value && Array.isArray(value.columns) && value.columns.every((column) => column &&
    typeof column.id === "string" && typeof column.name === "string" && typeof column.color === "string" &&
    Array.isArray(column.suppliers) && column.suppliers.every(validSupplier));
}
function normalizeBoard(value) {
  if (validBoard(value)) return value;
  if (value && Array.isArray(value.lebedeva) && Array.isArray(value.terekhova) && Array.isArray(value.kuznetsova)) {
    return { columns: [
      { id: "lebedeva", name: "Светлана Лебедева", color: "#cf6c32", suppliers: value.lebedeva },
      { id: "terekhova", name: "Светлана Терехова", color: "#31695d", suppliers: value.terekhova },
      { id: "kuznetsova", name: "Дарья Кузнецова", color: "#506da8", suppliers: value.kuznetsova }
    ] };
  }
  throw new Error("INVALID_BOARD_FILE");
}

let writeQueue = Promise.resolve();
async function readFileBoard() { return normalizeBoard(JSON.parse(await fs.readFile(DATA_FILE, "utf8"))); }
function writeFileBoard(board) {
  writeQueue = writeQueue.then(async () => {
    const temporary = `${DATA_FILE}.tmp`;
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(temporary, `${JSON.stringify(board, null, 2)}\n`, "utf8");
    await fs.rename(temporary, DATA_FILE);
  });
  return writeQueue;
}

async function supabaseRequest(pathname, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...options,
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`SUPABASE_${response.status}: ${(await response.text()).slice(0, 500)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function authRequest(pathname, options = {}, accessToken = SUPABASE_SERVICE_ROLE_KEY) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${pathname}`, {
    ...options,
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.msg || data?.message || `AUTH_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function readBoard() {
  if (!USE_SUPABASE) return readFileBoard();
  const rows = await supabaseRequest("board_state?id=eq.main&select=data");
  if (rows.length) return normalizeBoard(rows[0].data);
  const seed = normalizeBoard(JSON.parse(await fs.readFile(SEED_FILE, "utf8")));
  await writeBoard(seed);
  return seed;
}
function writeBoard(board) {
  if (!USE_SUPABASE) return writeFileBoard(board);
  writeQueue = writeQueue.then(() => supabaseRequest("board_state?on_conflict=id", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: "main", data: board, updated_at: new Date().toISOString() })
  }));
  return writeQueue;
}

function inactiveColumn(name) {
  const normalized = name.toLocaleLowerCase("ru");
  return normalized.includes("не работаем") || normalized.includes("не используем");
}
function workspaceFromBoard(board) {
  const now = new Date().toISOString();
  const employees = board.columns.filter((column) => !inactiveColumn(column.name)).map((column) => ({
    id: column.id, name: column.name,
    email: column.name.toLocaleLowerCase("ru").includes("лебедева") ? ADMIN_EMAIL : "",
    color: column.color, active: true, isBuyer: true, department: "Закупки",
    accessGroup: column.name.toLocaleLowerCase("ru").includes("лебедева") ? "admin" : "buyer",
    role: column.name.toLocaleLowerCase("ru").includes("лебедева") ? "admin" : "member", userId: ""
  }));
  const suppliers = board.columns.flatMap((column) => column.suppliers.map((supplier) => ({
    id: supplier.id, name: supplier.name, ownerEmployeeId: inactiveColumn(column.name) ? "" : column.id,
    active: !inactiveColumn(column.name), contract: Boolean(supplier.contract), deliveryTerms: "",
    paymentDeferral: "", categories: [], brands: [], contacts: [], notes: "", createdAt: now, updatedAt: now
  })));
  return { version: 2, revision: 1, departments: ["Закупки", "Руководство", "Оптовые продажи", "Маркетплейсы", "Склад"], employees, suppliers, tasks: [], createdAt: now, updatedAt: now };
}
function workspaceToBoard(workspace) {
  const columns = workspace.employees.filter((employee) => employee.active && employee.isBuyer !== false).map((employee) => ({
    id: employee.id, name: employee.name, color: employee.color,
    suppliers: workspace.suppliers.filter((supplier) => supplier.active && supplier.ownerEmployeeId === employee.id)
      .map(({ id, name, contract }) => ({ id, name, contract }))
  }));
  const inactive = workspace.suppliers.filter((supplier) => !supplier.active);
  if (inactive.length) columns.push({ id: "inactive", name: "Не работаем", color: "#7c7c7c",
    suppliers: inactive.map(({ id, name, contract }) => ({ id, name, contract })) });
  return { columns };
}
function validWorkspace(value) {
  return value && typeof value === "object" && Array.isArray(value.employees) && Array.isArray(value.suppliers) &&
    Array.isArray(value.tasks) && value.employees.length <= 100 && value.suppliers.length <= 5000 && value.tasks.length <= 10000;
}
function normalizeWorkspace(workspace) {
  workspace.departments = Array.isArray(workspace.departments) ? workspace.departments : ["Закупки", "Руководство", "Оптовые продажи", "Маркетплейсы", "Склад"];
  workspace.employees.forEach((employee) => {
    if (!employee.department) employee.department = employee.isBuyer !== false ? "Закупки" : "";
    if (!employee.accessGroup) employee.accessGroup = employee.role === "admin" ? "admin" : employee.isBuyer !== false ? "buyer" : "member";
  });
  return workspace;
}
async function readWorkspace() {
  if (!USE_SUPABASE) {
    const workspaceFile = `${DATA_FILE}.workspace.json`;
    try { return normalizeWorkspace(JSON.parse(await fs.readFile(workspaceFile, "utf8"))); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      const workspace = workspaceFromBoard(await readFileBoard());
      await fs.writeFile(workspaceFile, JSON.stringify(workspace, null, 2), "utf8");
      return workspace;
    }
  }
  const rows = await supabaseRequest("board_state?id=eq.workspace&select=data");
  if (rows.length) return normalizeWorkspace(rows[0].data);
  const board = await readBoard();
  const workspace = workspaceFromBoard(board);
  await supabaseRequest("board_state?on_conflict=id", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([
      { id: `backup-${Date.now()}`, data: board, updated_at: new Date().toISOString() },
      { id: "workspace", data: workspace, updated_at: new Date().toISOString() }
    ])
  });
  return workspace;
}
async function writeWorkspace(workspace) {
  workspace.updatedAt = new Date().toISOString();
  if (!USE_SUPABASE) await fs.writeFile(`${DATA_FILE}.workspace.json`, JSON.stringify(workspace, null, 2), "utf8");
  else await supabaseRequest("board_state?on_conflict=id", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: "workspace", data: workspace, updated_at: workspace.updatedAt })
  });
  await writeBoard(workspaceToBoard(workspace));
}

async function requireUser(req) {
  if (!USE_SUPABASE) return { id: "local-admin", email: ADMIN_EMAIL, user_metadata: { full_name: "Администратор" } };
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) { const error = new Error("Требуется вход"); error.status = 401; throw error; }
  try { return await authRequest("user", {}, token); }
  catch (error) { error.status = 401; throw error; }
}
function userEmployee(workspace, user) {
  return workspace.employees.find((employee) => employee.userId === user.id) ||
    workspace.employees.find((employee) => employee.email && employee.email.toLowerCase() === user.email?.toLowerCase());
}
function isAdmin(workspace, user) { return user.email?.toLowerCase() === ADMIN_EMAIL || userEmployee(workspace, user)?.role === "admin"; }
function canViewSuppliers(workspace, user) {
  const employee = userEmployee(workspace, user);
  return isAdmin(workspace, user) || ["management", "buyer"].includes(employee?.accessGroup);
}
function workspaceForUser(workspace, user) {
  if (canViewSuppliers(workspace, user)) return workspace;
  return { ...workspace, suppliers: [] };
}

async function serveStatic(req, res) {
  const urlPath = new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname;
  const requested = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath.slice(1));
  let filePath = path.resolve(PUBLIC_DIR, requested);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && filePath !== path.join(PUBLIC_DIR, "index.html")) {
    res.writeHead(403); return res.end("Forbidden");
  }
  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(body);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    try {
      const body = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
      res.writeHead(200, { "Content-Type": CONTENT_TYPES[".html"], "Cache-Control": "no-cache" }); res.end(body);
    } catch { res.writeHead(404); res.end("Build not found. Run npm run build."); }
  }
}

async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;
    if (pathname === "/api/health" && req.method === "GET") return sendJson(res, 200, { ok: true, storage: USE_SUPABASE ? "supabase" : "file" });

    if (pathname === "/api/auth/bootstrap" && req.method === "POST") {
      if (!USE_SUPABASE) return sendJson(res, 200, { local: true });
      const body = await readRequestBody(req);
      const email = cleanText(body.email, 200).toLowerCase();
      const password = cleanText(body.password, 200);
      const name = cleanText(body.name, 100);
      if (email !== ADMIN_EMAIL || password.length < 8) return sendJson(res, 400, { error: "Укажите почту администратора и пароль не короче 8 символов" });
      const users = await authRequest("admin/users?page=1&per_page=1000");
      if (users.users?.some((user) => user.email?.toLowerCase() === email)) return sendJson(res, 409, { error: "Администратор уже зарегистрирован. Используйте вход." });
      await authRequest("admin/users", { method: "POST", body: JSON.stringify({ email, password, email_confirm: true,
        user_metadata: { full_name: name || "Светлана Лебедева" } }) });
      return sendJson(res, 201, { ok: true });
    }
    if (pathname === "/api/auth/login" && req.method === "POST") {
      if (!USE_SUPABASE) return sendJson(res, 200, { access_token: "local", user: { id: "local-admin", email: ADMIN_EMAIL } });
      const body = await readRequestBody(req);
      return sendJson(res, 200, await authRequest("token?grant_type=password", { method: "POST",
        body: JSON.stringify({ email: cleanText(body.email, 200), password: cleanText(body.password, 200) }) }));
    }
    if (pathname === "/api/auth/me" && req.method === "GET") {
      const user = await requireUser(req);
      const workspace = await readWorkspace();
      let employee = userEmployee(workspace, user);
      if (employee && !employee.userId) { employee.userId = user.id; await writeWorkspace(workspace); }
      return sendJson(res, 200, { user: { id: user.id, email: user.email }, employee, isAdmin: isAdmin(workspace, user), canViewSuppliers: canViewSuppliers(workspace, user),
        mustChangePassword: Boolean(user.user_metadata?.must_change_password) });
    }
    if (pathname === "/api/auth/password" && req.method === "PUT") {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      const user = await requireUser(req);
      const body = await readRequestBody(req);
      if (cleanText(body.password, 200).length < 8) return sendJson(res, 400, { error: "Пароль должен содержать не менее 8 символов" });
      await authRequest("user", { method: "PUT", body: JSON.stringify({ password: body.password,
        data: { ...(user.user_metadata || {}), must_change_password: false } }) }, token);
      return sendJson(res, 200, { ok: true });
    }
    if (pathname === "/api/admin/temporary-access" && req.method === "POST") {
      const user = await requireUser(req);
      const workspace = await readWorkspace();
      if (!isAdmin(workspace, user)) return sendJson(res, 403, { error: "Только администратор может создавать доступ" });
      const body = await readRequestBody(req);
      const email = cleanText(body.email, 200).toLowerCase();
      const name = cleanText(body.name, 100);
      if (!email) return sendJson(res, 400, { error: "Укажите электронную почту" });
      const temporaryPassword = `${crypto.randomBytes(9).toString("base64url")}aA1!`;
      const users = await authRequest("admin/users?page=1&per_page=1000");
      const existing = users.users?.find((item) => item.email?.toLowerCase() === email);
      const attributes = { password: temporaryPassword, email_confirm: true,
        user_metadata: { ...(existing?.user_metadata || {}), full_name: name, must_change_password: true } };
      if (existing) await authRequest(`admin/users/${existing.id}`, { method: "PUT", body: JSON.stringify(attributes) });
      else await authRequest("admin/users", { method: "POST", body: JSON.stringify({ email, ...attributes }) });
      return sendJson(res, 200, { ok: true, temporaryPassword });
    }
    if (pathname === "/api/admin/invite" && req.method === "POST") {
      const user = await requireUser(req);
      const workspace = await readWorkspace();
      if (!isAdmin(workspace, user)) return sendJson(res, 403, { error: "Только администратор может приглашать сотрудников" });
      const body = await readRequestBody(req);
      const email = cleanText(body.email, 200).toLowerCase();
      if (!email) return sendJson(res, 400, { error: "Укажите электронную почту" });
      const forwardedProtocol = cleanText(req.headers["x-forwarded-proto"], 20).split(",")[0] || url.protocol.replace(":", "");
      const redirectTo = new URL(APP_URL || `${forwardedProtocol}://${url.host}`);
      redirectTo.searchParams.set("react", "1");
      await authRequest(`invite?redirect_to=${encodeURIComponent(redirectTo)}`, { method: "POST",
        body: JSON.stringify({ email, data: { full_name: cleanText(body.name, 100) } }) });
      return sendJson(res, 200, { ok: true });
    }
    if (pathname === "/api/workspace" && req.method === "GET") {
      const user = await requireUser(req);
      const workspace = await readWorkspace();
      if (!userEmployee(workspace, user) && user.email?.toLowerCase() !== ADMIN_EMAIL) return sendJson(res, 403, { error: "Пользователь не добавлен в список сотрудников" });
      return sendJson(res, 200, workspaceForUser(workspace, user));
    }
    if (pathname === "/api/workspace" && req.method === "PUT") {
      const user = await requireUser(req);
      const current = await readWorkspace();
      if (!userEmployee(current, user) && user.email?.toLowerCase() !== ADMIN_EMAIL) return sendJson(res, 403, { error: "Нет доступа" });
      const incoming = await readRequestBody(req);
      if (!validWorkspace(incoming)) return sendJson(res, 400, { error: "Некорректные данные приложения" });
      if (Number(incoming.revision) !== Number(current.revision)) return sendJson(res, 409, { error: "Данные уже изменил другой сотрудник. Обновите страницу." });
      if (!isAdmin(current, user)) {
        incoming.employees = current.employees;
        incoming.departments = current.departments;
      }
      if (!canViewSuppliers(current, user)) incoming.suppliers = current.suppliers;
      incoming.revision = Number(current.revision || 0) + 1;
      await writeWorkspace(incoming);
      return sendJson(res, 200, workspaceForUser(incoming, user));
    }
    if (pathname === "/board" && req.method === "GET") return sendJson(res, 200, await readBoard());
    if (pathname === "/board" && req.method === "POST") {
      const board = await readRequestBody(req);
      if (!validBoard(board)) return sendJson(res, 400, { error: "Некорректные данные доски" });
      await writeBoard(board); return sendJson(res, 200, { ok: true });
    }
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
    sendJson(res, 405, { error: "Метод не поддерживается" });
  } catch (error) {
    const status = error.status || (error.message === "PAYLOAD_TOO_LARGE" ? 413 : 500);
    console.error(error);
    sendJson(res, status, { error: status === 500 ? "Ошибка сервера" : error.message });
  }
}

if (require.main === module) {
  http.createServer(handler).listen(PORT, HOST, () => {
    console.log(`Team workspace is running at http://localhost:${PORT}`);
    console.log(USE_SUPABASE ? "Data storage: Supabase" : `Data storage: ${DATA_FILE}`);
  });
}

module.exports = { handler };
