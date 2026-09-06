const PRICE = process.env.STRIPE_PRICE_ID || "";
const SECRET = process.env.STRIPE_SECRET_KEY || "";
const SITE = process.env.PUBLIC_SITE_URL || "https://snatcher-olive.vercel.app";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });

  if (!SECRET || !PRICE) {
    return json(res, 501, {
      error: "stripe_not_configured",
      message: "Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID on Vercel. Until then use the local unlock on /pro.",
    });
  }

  const params = new URLSearchParams({
    "mode": "subscription",
    "line_items[0][price]": PRICE,
    "line_items[0][quantity]": "1",
    "success_url": `${SITE}/pro?session_id={CHECKOUT_SESSION_ID}`,
    "cancel_url": `${SITE}/pro?canceled=1`,
    "allow_promotion_codes": "true",
    "billing_address_collection": "auto",
    "metadata[product]": "snatcher_pro",
  });

  const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const data = await stripeRes.json();
  if (!stripeRes.ok) return json(res, 502, { error: "stripe_failed", detail: data.error?.message || "checkout failed" });
  return json(res, 200, { url: data.url, id: data.id });
};
