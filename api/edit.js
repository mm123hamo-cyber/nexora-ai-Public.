export const config = {
  api: {
    bodyParser: {
      sizeLimit: "5mb"
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { image, prompt } = req.body || {};

    if (!image || !prompt) {
      return res.status(400).json({
        error: "الصورة ووصف التعديل مطلوبين"
      });
    }

    const match = image.match(
      /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/
    );

    if (!match) {
      return res.status(400).json({
        error: "صيغة الصورة غير مدعومة"
      });
    }

    const apiKey = process.env.PHOTOROOM_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "API key is missing"
      });
    }

    const form = new FormData();

    const buffer = Buffer.from(match[2], "base64");

    form.append(
      "imageFile",
      new Blob([buffer], {
        type: `image/${match[1] === "jpg" ? "jpeg" : match[1]}`
      }),
      "image.jpg"
    );

    form.append("removeBackground", "false");
    form.append("editWithAI.mode", "ai.auto");
    form.append("editWithAI.prompt", prompt);

    let key = apiKey;
    if (!key.startsWith("sandbox_")) {
      key = "sandbox_" + key;
    }

    const response = await fetch(
      "https://image-api.photoroom.com/v2/edit",
      {
        method: "POST",
        headers: {
          "x-api-key": key
        },
        body: form
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({
        error: error.slice(0, 500)
      });
    }

    const result = Buffer.from(
      await response.arrayBuffer()
    );

    return res.status(200).json({
      image: `data:image/png;base64,${result.toString("base64")}`
    });

  } catch (error) {
    return res.status(500).json({
      error: "حصل خطأ أثناء تعديل الصورة"
    });
  }
}