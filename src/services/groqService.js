const Groq = require("groq-sdk");

let groqClient = null;
function getGroqClient() {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY || "missing" });
  }
  return groqClient;
}

const VISION_MODEL = process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

/**
 * Android uygulamasının beklediği JSON şeması. Model bu şemaya göre yanıt vermeye
 * zorlanır (response_format: json_object + net talimatlar).
 */
const SYSTEM_PROMPT = `Sen deneyimli bir diyetisyen ve gıda görsel analiz uzmanısın.
Sana bir tabak/yemek/paketli ürün fotoğrafı verilecek. Görevin:
1. Fotoğraftaki her ayrı yiyeceği/içeceği tespit etmek.
2. Her biri için gerçekçi porsiyon (gram) tahmini yapmak (görsel büyüklüğe göre).
3. Her biri için kalori, protein, karbonhidrat, yağ, lif, şeker, sodyum değerlerini
   standart besin veritabanı bilgine göre tahmin etmek (USDA/TÜBİTAK benzeri referans değerler).
4. Genel bir "healthScore" (0-100, 100=çok sağlıklı) ve kısa bir Türkçe öneri (suggestion) üretmek.

SADECE aşağıdaki JSON şemasına uyan, başka hiçbir açıklama/markdown içermeyen bir JSON döndür:
{
  "items": [
    {
      "name": "string (Türkçe yemek adı)",
      "description": "string (1-2 cümlelik kısa açıklama, Türkçe)",
      "portionGrams": number,
      "calories": number,
      "protein": number,
      "carbs": number,
      "fat": number,
      "fiber": number,
      "sugar": number,
      "sodium": number,
      "vitamins": { "A": "string", "C": "string" },
      "minerals": { "Demir": "string", "Kalsiyum": "string" }
    }
  ],
  "healthScore": number,
  "suggestion": "string (Türkçe, 1-2 cümle)"
}
Eğer görselde yiyecek tespit edemiyorsan items dizisini boş döndür ve suggestion alanına bunu belirt.`;

/**
 * Base64 kodlanmış bir görseli Groq'un vision destekli modeline göndererek
 * yemek tanıma + besin analizi sonucu alır.
 * @param {string} base64Image - "data:image/jpeg;base64,...." öneki OLMADAN ham base64 string
 * @param {string} mimeType - örn. "image/jpeg"
 * @returns {Promise<object>} AiRecognitionResponse şemasına uyan obje
 */
async function analyzeFoodImage(base64Image, mimeType = "image/jpeg") {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY tanımlı değil. Render ortam değişkenlerine ekleyin.");
  }

  const dataUrl = `data:${mimeType};base64,${base64Image}`;

  const completion = await getGroqClient().chat.completions.create({
    model: VISION_MODEL,
    temperature: 0.3,
    max_tokens: 1500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Bu fotoğraftaki yiyecekleri tespit et ve besin değerlerini JSON olarak ver." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Groq modelinden boş yanıt alındı.");

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error("Groq yanıtı geçerli JSON değil: " + e.message);
  }

  return normalizeResponse(parsed);
}

/** Modelin döndürdüğü alanları güvenli sayılara/varsayılanlara çevirir. */
function normalizeResponse(parsed) {
  const items = Array.isArray(parsed.items) ? parsed.items : [];

  const toNum = (v) => (typeof v === "number" && !Number.isNaN(v) ? v : Number(v) || 0);

  const normalizedItems = items.map((it) => ({
    name: String(it.name || "Bilinmeyen Yiyecek"),
    description: String(it.description || ""),
    portionGrams: toNum(it.portionGrams),
    calories: toNum(it.calories),
    protein: toNum(it.protein),
    carbs: toNum(it.carbs),
    fat: toNum(it.fat),
    fiber: toNum(it.fiber),
    sugar: toNum(it.sugar),
    sodium: toNum(it.sodium),
    vitamins: it.vitamins && typeof it.vitamins === "object" ? it.vitamins : {},
    minerals: it.minerals && typeof it.minerals === "object" ? it.minerals : {},
  }));

  return {
    items: normalizedItems.length > 0 ? normalizedItems : [
      {
        name: "Tespit edilemedi",
        description: "Fotoğrafta net bir yiyecek tespit edilemedi. Lütfen daha yakından ve iyi ışıkta tekrar çekin.",
        portionGrams: 0,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        sugar: 0,
        sodium: 0,
        vitamins: {},
        minerals: {},
      },
    ],
    healthScore: Math.round(toNum(parsed.healthScore)) || 50,
    suggestion: String(parsed.suggestion || "Dengeli beslenmeye özen gösterin."),
  };
}

module.exports = { analyzeFoodImage };
