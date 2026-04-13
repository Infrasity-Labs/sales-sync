const http = require("http");
const fs   = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../dashboard");
const PORT = 3000;

const MIME = {
  ".html": "text/html",
  ".js":   "application/javascript",
  ".css":  "text/css",
  ".json": "application/json",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
};

http.createServer((req, res) => {
  let filePath = path.join(ROOT, req.url === "/" ? "index.html" : req.url);

  // Prevent path traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end(`Not found: ${req.url}`);
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`Dashboard → http://localhost:${PORT}`);
  console.log("Ctrl+C to stop");
});
