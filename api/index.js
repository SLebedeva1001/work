const { handler } = require("../server");

module.exports = async function vercelHandler(req, res) {
  const route = Array.isArray(req.query.path) ? req.query.path.join("/") : (req.query.path || "");
  const query = new URLSearchParams(req.query);
  query.delete("path");
  req.url = route === "board" ? "/board" : `/api/${route}`;
  if ([...query].length) req.url += `?${query.toString()}`;
  return handler(req, res);
};
