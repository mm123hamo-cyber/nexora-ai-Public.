
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

    messages = messages
      .filter(m =>
        m &&
        ["user", "assistant"].includes(m.role)
      )
      .slice(-30)
      .map(m => {
        if (typeof m.content === "string") {
          return {
            role: m.role,
            content: m.content.slice(0, 12000)
          };
        }

        if (m.role === "user" && Array.isArray(m.content)) {
          const parts = m.content
            .filter(part => {
              if (part?.type === "text") {
                return typeof part.text === "string";
              }

              if (part?.type === "image_url") {
                const url = part.image_url?.url;
                return typeof url === "string" &&
                  /^data:image\/(jpeg|png|webp);base64,/i.test(url) &&
                  url.length <= 4000000;
              }

              return false;
            })
            .slice(0, 4);

          return {
            role: "user",
            content: parts
          };
        }

        return null;
      })
      .filter(Boolean)
      .filter(m =>
        typeof m.content === "string"
          ? m.content.trim().length > 0
          : m.content.length > 0
      );

    if (!messages.length) {
      return res.status(400).json({ error: "Message is empty" });
    }

    const hasImage = messages.some(m =>
      Array.isArray(m.content) &&
      m.content.some(part => part.type === "image_url")
    );

    messages.unshift({
      role: "system",
      content: "You are ALEX AI, a helpful assistant. Reply naturally in the user's language, especially Egyptian Arabic when appropriate. If the user sends an image, understand it and answer their question about it."
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
          model: hasImage
            ? "qwen/qwen3.8-27b"
            : "openai/gpt-oss-20b",
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


