// Passenger entrypoint — see apps/api/server.js for the same pattern.
const { createServer } = require("http");
const next = require("next");

const port = process.env.PORT || 3004;
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, (err) => {
    if (err) throw err;
    console.log(`> oyklane.com (www) ready on port ${port}`);
  });
});
