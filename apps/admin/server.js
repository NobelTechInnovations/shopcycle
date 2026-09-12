// Passenger entrypoint — see apps/api/server.js for the same pattern.
// Standard Next.js custom-server, listening on whatever port Passenger
// assigns via process.env.PORT.
const { createServer } = require("http");
const next = require("next");

const port = process.env.PORT || 3000;
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, (err) => {
    if (err) throw err;
    console.log(`> store.oyklane.com (admin) ready on port ${port}`);
  });
});
