
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !GEMINI_API_KEY) {
      return res.status(500).json({ error: "Server configuration error" });
    }

    const authorization = req.headers.authorization || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    if (!token) {
      return res.status(401).json({ error: "Please login first" });
    }

    const authResponse = await fetch(
      `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!authResponse.ok) {
      return res.status(401).json({ error: "Invalid login" });
    }

    const { message } = req.body || {};

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    if (message.length > 20000) {
      return res.status(400).json({ error: "Message is too long" });
    }

    let data;
    let aiResponse;

    for (let attempt = 0; attempt < 3; attempt++) {
      aiResponse = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY
          },
          body: JSON.stringify({
            model: "gemini-3.8-flash",
            input: message.trim()
          })
        }
      );

      data = await aiResponse.json();

      if (aiResponse.ok) break;

      if (![429, 500, 502, 503, 504].includes(aiResponse.status)) {
        break;
      }

      if (attempt < 2) {
        await new Promise(resolve =>
          setTimeout(resolve, 1000 * (attempt + 1))
        );
      }
    }

    if (!aiResponse.ok) {
      console.error("Gemini API Error:", {
        status: aiResponse.status,
        error: data.error || data
      });

      return res.status(503).json({
        error: "AI is temporarily unavailable. Please try again."
      });
    }

    const reply =
      data.output_text ||
      data.interaction?.output_text ||
      "";

    if (typeof reply !== "string" || !reply.trim()) {
      return res.status(502).json({
        error: "AI returned an empty response"
      });
    }

    return res.status(200).json({ reply: reply.trim() });

  } catch (error) {
    console.error("Chat API Error:", error.message);

    return res.status(500).json({ error: "Server error" });
  }
};

