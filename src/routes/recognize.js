const express = require("express");
const multer = require("multer");
const { analyzeFoodImage } = require("../services/groqService");

const router = express.Router();

// Görseli bellekte tutup base64'e çeviriyoruz (diske yazmıyoruz -> Render'da kalıcı disk gerekmez)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
});

/**
 * POST /v1/recognize
 * multipart/form-data, alan adı: "image"
 * Android tarafındaki AiRecognitionApi.recognizeFood(...) tam olarak bu endpoint'i çağırır.
 */
router.post("/v1/recognize", (req, res, next) => {
  upload.single("image")(req, res, (err) => {
    if (err) {
      // Multer hataları (yanlış alan adı, boyut limiti aşımı vb.) burada temiz bir 400 olarak döner.
      return res.status(400).json({ error: "Görsel yüklenemedi.", detail: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "image alanı zorunludur (multipart/form-data)." });
    }

    const base64Image = req.file.buffer.toString("base64");
    const result = await analyzeFoodImage(base64Image, req.file.mimetype || "image/jpeg");

    return res.json(result);
  } catch (err) {
    console.error("[/v1/recognize] hata:", err.message);
    return res.status(502).json({ error: "Analiz başarısız oldu.", detail: err.message });
  }
});

module.exports = router;
