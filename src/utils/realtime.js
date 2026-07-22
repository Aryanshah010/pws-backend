const jwt = require("jsonwebtoken");

const clients = new Set();

const identify = (req) => {
  const token = req.query?.token;
  if (!token) return null;
  try {
    return String(jwt.verify(token, process.env.JWT_SECRET).id);
  } catch {
    return null;
  }
};

exports.connect = (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write("event: connected\ndata: {}\n\n");

  const client = { res, userId: identify(req) };
  clients.add(client);

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(client);
  });
};

exports.broadcast = (event, data, { userId } = {}) => {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const target = userId ? String(userId) : null;

  clients.forEach((client) => {
    if (target && client.userId !== target) return;
    client.res.write(payload);
  });
};
