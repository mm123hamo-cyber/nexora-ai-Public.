

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1. التحقق من تسجيل الدخول
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!token) {
      return res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!supabaseUrl || !supabaseKey || !groqKey) {
      return res.status(500).json({ error: "Server configuration error" });
    }

    // 2. التحقق من التوكن لدى Supabase
    const authResponse = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        method: "GET",
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${token}`
        }
      }
    );

    if (!authResponse.ok) {
      return res.status(401).json({ error: "جلسة الدخول غير صالحة" });
    }

    const user = await authResponse.json();

    if (!user || !user.id) {
      return res.status(401).json({ error: "تعذر التحقق من المستخدم" });
    }

    // 3. فحص حجم الطلب
    const body = req.body || {};

    if (Buffer.byteLength(JSON.stringify(body), "utf8") > 5 * 1024 * 1024) {
      return res.status(413).json({ error: "حجم الطلب كبير جداً" });
    }

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
            role: m.role,
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

    // 4. إرسال الطلب إلى Groq
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqKey}`
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
      return res.status(502).json({
        error: "خدمة الذكاء الاصطناعي غير متاحة حالياً"
      });
    }

    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(502).json({ error: "No reply received" });
    }

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("Chat Error:", error);
    return res.status(500).json({
      error: "Something went wrong. Please try again."
    });
  }
};
