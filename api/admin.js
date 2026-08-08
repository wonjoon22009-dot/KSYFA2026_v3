export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ADMIN_PIN = process.env.ADMIN_PIN;

  if (!SUPABASE_URL || !SERVICE_KEY || !ADMIN_PIN) {
    return res.status(500).send("Server environment is not configured");
  }

  const body = req.body || {};

  if (String(body.pin || "") !== String(ADMIN_PIN)) {
    return res.status(401).send("Unauthorized");
  }

  if (body.action === "login") {
    return res.status(200).json({ ok: true });
  }

  if (body.action === "delete_comment") {
    const id = String(body.id || "");
    if (!/^\d+$/.test(id)) {
      return res.status(400).send("Invalid comment id");
    }

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/match_comments?id=eq.${id}`,
      {
        method: "DELETE",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          Prefer: "return=minimal"
        }
      }
    );

    if (!response.ok) {
      return res.status(500).send(await response.text());
    }
    return res.status(200).json({ ok: true });
  }

  if (body.action === "save_state") {
    if (!body.state || typeof body.state !== "object") {
      return res.status(400).send("Missing state");
    }

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/tournament_state?id=eq.main`,
      {
        method: "PATCH",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          state: body.state,
          updated_at: new Date().toISOString()
        })
      }
    );

    if (!response.ok) {
      return res.status(500).send(await response.text());
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(400).send("Unknown action");
}
