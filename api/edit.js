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
    const { image, prompt } = req.body || {};

    if (!image || !prompt?.trim()) {
      return res.status(400).json({
        error: "الصورة ووصف التعديل مطلوبين",
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
        error: "مفتاح Photoroom غير موجود",
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
      const error = await response.text();

      return res.status(response.status).json({
        error: error.slice(0, 500),
      });
    }

    const contentType =
      response.headers.get("content-type") || "image/png";

    if (!contentType.startsWith("image/")) {
      return res.status(502).json({
        error: "استجابة غير متوقعة من Photoroom",
      });
    }

    const result = Buffer.from(await response.arrayBuffer());

    return res.status(200).json({
      image: `data:${contentType};base64,${result.toString("base64")}`,
    });

  } catch (error) {
    return res.status(500).json({
      error: "حصل خطأ أثناء تعديل الصورة",
    });
  }
}