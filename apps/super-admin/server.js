// Passenger entrypoint — see apps/api/server.js for the same pattern.
const { createServer } = require("http");
const next = require("next");

const port = process.env.PORT || 3003;
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, (err) => {
    if (err) throw err;
    console.log(`> superadmin.oyklane.com ready on port ${port}`);
  });
});
