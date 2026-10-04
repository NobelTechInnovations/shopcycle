// Passenger entrypoint — this host's Node runner always assigns the port
// via process.env.PORT, but the API's own config (config/env.js) reads
// API_PORT (its .env default, used for local/manual runs too). Bridging
// the two here means the real server.js (src/server.js) never needs to
// know it's running under Passenger.
if (process.env.PORT) process.env.API_PORT = process.env.PORT;
require("./src/server.js");
