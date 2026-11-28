
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "5mb",
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // التحقق من تسجيل الدخول
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!token || !supabaseUrl || !supabaseKey) {
      return res.status(401).json({ error: "سجل دخولك أولاً" });
    }

    const authResponse = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!authResponse.ok) {
      return res.status(401).json({
        error: "جلسة الدخول غير صالحة",
      });
    }

    const user = await authResponse.json();

    if (!user?.id) {
      return res.status(401).json({
        error: "تعذر التحقق من المستخدم",
      });
    }

    // التحقق من البيانات
    const { image, prompt } = req.body || {};

    if (
      typeof image !== "string" ||
      typeof prompt !== "string" ||
      !prompt.trim()
    ) {
      return res.status(400).json({
        error: "الصورة ووصف التعديل مطلوبين",
      });
    }

    if (prompt.trim().length > 500) {
      return res.status(400).json({
        error: "وصف التعديل طويل جداً",
      });
    }

    if (image.length > 4000000) {
      return res.status(413).json({
        error: "حجم الصورة كبير",
      });
    }

    const match = image.match(
      /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/
    );

    if (!match) {
      return res.status(400).json({
        error: "صيغة الصورة غير مدعومة",
      });
    }

    const apiKey = process.env.PHOTOROOM_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "خدمة تعديل الصور غير مهيأة",
      });
    }

    const key = apiKey.startsWith("sandbox_")
      ? apiKey
      : `sandbox_${apiKey}`;

    const mime = match[1] === "jpg" ? "jpeg" : match[1];
    const buffer = Buffer.from(match[2], "base64");

    const form = new FormData();

    form.append(
      "imageFile",
      new Blob([buffer], { type: `image/${mime}` }),
      `upload.${mime === "jpeg" ? "jpg" : mime}`
    );

    form.append("removeBackground", "false");
    form.append("referenceBox", "originalImage");
    form.append("describeAnyChange.mode", "ai.auto");
    form.append("describeAnyChange.prompt", prompt.trim());

    const response = await fetch(
      "https://image-api.photoroom.com/v2/edit",
      {
        method: "POST",
        headers: {
          "x-api-key": key,
        },
        body: form,
      }
    );

    if (!response.ok) {
      console.error("Photoroom error:", response.status);

      return res.status(502).json({
        error: "تعذر تعديل الصورة حالياً",
      });
    }

    const contentType =
      response.headers.get("content-type") || "";

    if (!contentType.startsWith("image/")) {
      return res.status(502).json({
        error: "استجابة غير متوقعة من خدمة الصور",
      });
    }

    const result = Buffer.from(await response.arrayBuffer());

    if (!result.length || result.length > 5 * 1024 * 1024) {
      return res.status(502).json({
        error: "الصورة الناتجة غير صالحة أو كبيرة جداً",
      });
    }

    return res.status(200).json({
      image: `data:${contentType};base64,${result.toString("base64")}`,
    });

  } catch (error) {
    console.error("Edit API error:", error);

    return res.status(500).json({
      error: "حصل خطأ أثناء تعديل الصورة",
    });
  }
}
