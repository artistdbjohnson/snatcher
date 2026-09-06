const SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  const raw = await readRaw(req);
  if (!SECRET) {
    return json(res, 200, { received: true, verified: false, note: "STRIPE_WEBHOOK_SECRET not set" });
  }
  try {
    JSON.parse(raw.toString("utf8"));
  } catch {
    return json(res, 400, { error: "invalid_payload" });
  }
  return json(res, 200, { received: true, verified: false });
};
