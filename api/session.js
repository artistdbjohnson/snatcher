const SECRET = process.env.STRIPE_SECRET_KEY || "";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  const id = url.searchParams.get("session_id") || "";
  if (!id) return json(res, 400, { entitled: false, error: "missing_session" });

  if (!SECRET) {
    return json(res, 200, {
      entitled: false,
      error: "stripe_not_configured",
      message: "Stripe keys not set. Local unlock is client-side only.",
    });
  }

  const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  const data = await stripeRes.json();
  const ok = data.payment_status === "paid" || data.status === "complete";
  return json(res, 200, {
    entitled: Boolean(ok),
    customer: data.customer || null,
    subscription: data.subscription || null,
  });
};
