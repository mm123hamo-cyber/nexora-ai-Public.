module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "GROQ_API_KEY is missing" });
    }

    const body = req.body || {};

    let messages = Array.isArray(body.messages)
      ? body.messages
      : [{
          role: "user",
          content: body.message || body.prompt || body.input || ""
        }];

    messages = messages.filter(
      m => ["user", "assistant"].includes(m.role) &&
           typeof m.content === "string"
    );

    if (!messages.length) {
      return res.status(400).json({ error: "Message is empty" });
    }

    messages.unshift({
      role: "system",
      content: "You are ALEX AI, a helpful assistant. Reply naturally in the user's language, especially Egyptian Arabic when appropriate."
    });

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          messages,
          max_completion_tokens: 1024
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Groq API Error:", data);
      return res.status(response.status).json({
        error: data.error?.message || "AI service error"
      });
    }

    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(500).json({ error: "No reply received" });
    }

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("Chat Error:", error);
    return res.status(500).json({
      error: "Something went wrong. Please try again."
    });
  }
};

