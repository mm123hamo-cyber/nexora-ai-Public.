
module.exports = async (req, res) => {
  // Allow POST requests only
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    // Check environment variables
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !GEMINI_API_KEY) {
      console.error("Missing environment variables");

      return res.status(500).json({
        error: "Server configuration error"
      });
    }

    // Check login token
    const authorization = req.headers.authorization || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    if (!token) {
      return res.status(401).json({
        error: "Please login first"
      });
    }

    // Verify user with Supabase
    const authResponse = await fetch(
      `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`,
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!authResponse.ok) {
      console.error("Supabase authentication failed:", authResponse.status);

      return res.status(401).json({
        error: "Invalid login"
      });
    }

    // Validate message
    const { message } = req.body || {};

    if (
      typeof message !== "string" ||
      !message.trim()
    ) {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    if (message.length > 20000) {
      return res.status(400).json({
        error: "Message is too long"
      });
    }

    // Send message to Gemini
    const aiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: message.trim() }
              ]
            }
          ]
        })
      }
    );

    const data = await aiResponse.json();

    // Handle Gemini errors
    if (!aiResponse.ok) {
      console.error("Gemini API Error:", {
        status: aiResponse.status,
        error: data.error || data
      });

      return res.status(502).json({
        error: "AI service error"
      });
    }

    // Check AI response
    const reply =
      data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

    if (!reply) {
      console.error("Gemini returned no text:", {
        promptFeedback: data.promptFeedback,
        finishReason: data.candidates?.[0]?.finishReason
      });

      return res.status(502).json({
        error: "AI returned an empty response"
      });
    }

    // Return successful response
    return res.status(200).json({
      reply
    });

  } catch (error) {
    console.error("Chat API Error:", error.message);

    return res.status(500).json({
      error: "Server error"
    });
  }
};
