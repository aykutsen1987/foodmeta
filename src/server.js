require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const recognizeRouter = require("./routes/recognize");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Basit dakika bazlı rate limit (Render ücretsiz plan kaynaklarını korumak için)
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PER_MINUTE) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Çok fazla istek gönderildi. Lütfen bir dakika sonra tekrar deneyin." },
});
app.use(limiter);

// İsteğe bağlı basit API anahtarı doğrulaması (Android uygulaması Header: x-app-key gönderir)
app.use((req, res, next) => {
  const expected = process.env.APP_API_KEY;
  if (!expected) return next(); // anahtar tanımlı değilse doğrulama atlanır
  const provided = req.header("x-app-key");
  if (provided !== expected) {
    return res.status(401).json({ error: "Geçersiz veya eksik API anahtarı (x-app-key)." });
  }
  next();
});

app.get("/", (req, res) => {
  res.json({
    service: "foodmeta-backend",
    status: "ok",
    docs: "POST /v1/recognize (multipart/form-data, field: image)",
  });
});

app.get("/health", (req, res) => res.json({ status: "healthy", uptime: process.uptime() }));

app.use("/", recognizeRouter);

app.use((req, res) => res.status(404).json({ error: "Bulunamadı." }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("Beklenmeyen hata:", err);
  res.status(500).json({ error: "Sunucu hatası." });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`FoodMeta backend ${PORT} portunda çalışıyor.`);
});
