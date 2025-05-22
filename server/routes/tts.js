console.log("✅ TTS ROUTE LOADED");
const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const OpenAI = require("openai");
require("dotenv").config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CACHE_DIR = path.join(__dirname, "../tts-cache");
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

function getCacheFilePath(text, voice) {
    const hash = crypto.createHash("md5").update(voice + "|" + text).digest("hex");
    return path.join(CACHE_DIR, `${hash}.mp3`);
}

router.post("/", async (req, res) => {
    console.log("🎤 /api/tts 호출됨");
    try {
        const { text, voice = process.env.OPENAI_TTS_VOICE || "alloy" } = req.body;
        const filePath = getCacheFilePath(text, voice);

        if (fs.existsSync(filePath)) {
            return res.sendFile(filePath);
        }

        const mp3 = await openai.audio.speech.create({
            model: "tts-1",
            voice,
            input: text
        });

        const buffer = Buffer.from(await mp3.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
        res.sendFile(filePath);
    } catch (err) {
        console.error("TTS ERROR:", err);
        res.status(500).send("TTS generation failed.");
    }
});

module.exports = router;
