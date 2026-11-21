
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !GEMINI_API_KEY) {
      console.error("Missing environment variables");

      return res.status(500).json({
        error: "Server configuration error"
      });
    }

    // Verify login
    const authorization = req.headers.authorization || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    if (!token) {
      return res.status(401).json({
        error: "Please login first"
      });
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
      return res.status(401).json({
        error: "Invalid login"
      });
    }

    // Validate message
    const { message } = req.body || {};

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    if (message.length > 20000) {
      return res.status(400).json({
        error: "Message is too long"
      });
    }

    // Gemini Interactions API
    const aiResponse = await fetch(
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

    const data = await aiResponse.json();

    if (!aiResponse.ok) {
      console.error("Gemini API Error:", {
        status: aiResponse.status,
        error: data.error || data
      });

      return res.status(502).json({
        error: "AI service error"
      });
    }

    // Read AI response
    const reply =
      data.output_text ||
      data.interaction?.output_text ||
      "";

    if (!reply.trim()) {
      console.error("Empty Gemini response:", data);

      return res.status(502).json({
        error: "AI returned an empty response"
      });
    }

    return res.status(200).json({
      reply: reply.trim()
    });

  } catch (error) {
    console.error("Chat API Error:", error.message);

    return res.status(500).json({
      error: "Server error"
    });
  }
};
