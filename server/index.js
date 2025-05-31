// index.js – Echo FM backend (v3)
// 변경점: `/summaries`가 요청받은 각 나레이션을 **같은 언어**로 1문장(≤120자) 요약.
//         더 이상 language 파라미터를 받지 않음.
// - GPT‑3.5‑turbo 사용, 동시 3개 제한(p‑limit)
// - 캐싱(Map)으로 중복 호출 절감
// - /generate 엔드포인트는 원본 나레이션 그대로 반환

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { OpenAI } = require("openai");
const pLimitImport = require("p-limit");
const pLimit = typeof pLimitImport === "function" ? pLimitImport : pLimitImport.default;

const ttsRouter = require("./routes/tts");
const {
    isYouTubeVideoValid,
    findAlternativeYouTubeId,
    fallbackYoutubeIdFromGPT,
} = require("./youtube.js");

/* --------------------------------------------------
 *  Setup
 * -------------------------------------------------- */
const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/tts", ttsRouter);

const PORT = process.env.PORT || 3001;
if (!process.env.OPENAI_API_KEY) {
    console.warn("⚠️  OPENAI_API_KEY 가 설정되어 있지 않습니다. 요약 기능이 비활성화됩니다.");
}
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* --------------------------------------------------
 *  Util: narration summariser – same‑language, ≤120 chars, 1 sentence
 * -------------------------------------------------- */
const cache = new Map(); // 원문 → 요약 캐시
const limiter = pLimit(3); // 동시 3개

async function summarizeNarration(text = "") {
    if (!text) return "";
    if (cache.has(text)) return cache.get(text);
    if (!process.env.OPENAI_API_KEY) return "";

    // 단일 프롬프트로 "같은 언어" 요약 지시
    const systemPrompt =
        "You are a helpful assistant. Summarize the following narration into a single sentence (max 120 characters) in the SAME LANGUAGE as the original.";

    const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        temperature: 0.3,
        max_tokens: 80,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text },
        ],
    });

    const summary = (completion.choices[0].message.content || "").trim();
    cache.set(text, summary);
    return summary;
}

function summarizeBatch(texts = []) {
    return Promise.all(texts.map((t) => limiter(() => summarizeNarration(t))));
}

/* --------------------------------------------------
 *  /summaries – 프런트 히스토리용 요약 API (same‑language)
 * -------------------------------------------------- */
app.post("/summaries", async (req, res) => {
    try {
        const { texts = [] } = req.body || {};
        if (!Array.isArray(texts)) {
            return res.status(400).json({ error: "'texts' must be an array" });
        }
        const summaries = await summarizeBatch(texts);
        return res.json({ summaries });
    } catch (err) {
        console.error("/summaries 오류", err);
        res.status(500).json({ error: "summary generation failed" });
    }
});

/* --------------------------------------------------
 *  /generate – main broadcast endpoint (원본 나레이션 유지)
 * -------------------------------------------------- */
app.post("/generate", async (req, res) => {
    const {
        era,
        genre,
        region,
        user_artist = "",
        talk_ratio = 0.5,
        language = "en-US",
        track_count = 5,
        history = [],
    } = req.body;

    console.log("📝 사용자 요청 데이터:", req.body);
    const userArtistNorm = user_artist.trim().toLowerCase();

    /* 1) 히스토리 필터링 */
    const relevant = history.filter((trk) => {
        const eraOk = trk.era === era;
        const regionOk = (trk.region || "").toLowerCase() === region.toLowerCase();
        const genreOk =
            (trk.genre || "").toLowerCase().includes(genre.toLowerCase()) ||
            genre.toLowerCase().includes((trk.genre || "").toLowerCase());
        const artistOk = !userArtistNorm || (trk.artist || "").toLowerCase() === userArtistNorm;
        return eraOk && regionOk && genreOk && artistOk;
    });

    /* 2) 중복 제거 (제목+아티스트) */
    const dedupLatestFirst = [];
    const seen = new Set();
    for (let i = relevant.length - 1; i >= 0; i--) {
        const t = relevant[i];
        const key = `${(t.title || "").toLowerCase()}::${(t.artist || "").toLowerCase()}`;
        if (!seen.has(key)) {
            seen.add(key);
            dedupLatestFirst.push(t);
        }
    }
    const allFiltered = dedupLatestFirst.reverse();

    const historyPrompt = allFiltered.length
        ? `Avoid repeating these ${allFiltered.length} tracks used previously:\n${allFiltered
            .map((t) => `• \"${t.title}\" by ${t.artist}`)
            .join("\n")}`
        : "";

    /* 3) 시스템 프롬프트 */
    const systemPrompt = `You are Echo, an AI DJ who creates radio broadcasts.\n\nUser preferences:\n• era: ${era}\n• genre: ${genre}\n• region: ${region}\n• user_artist: ${user_artist || "none"}\n• language: ${language}\n• talk_ratio: ${talk_ratio}\n• track_count: ${track_count}\n${userArtistNorm ? "" : "• IMPORTANT: Do not repeat artists across the playlist."}\n\n${historyPrompt}\n\nInstructions:\n1. Select music matching the user's preferences.\n2. Return exactly ${track_count} tracks.\n3. For each track, include: title, artist, youtube_id, narration.\n4. The DPS narration length must reflect talk_ratio (0.0=no narration, 0.5≈15 sentences, 1.0=full).\n5. Entire narration must be written in the specified language.\n6. Return only valid JSON with keys: artist_intro, tracks[], closing.\n7. If user_artist is 'none', each track must be from a different artist.`;
    console.log("🗒️  GPT systemPrompt:\n", systemPrompt);
    try {
        const MAX_RETRIES = 3;
        let retries = 0;
        let validTracks = [];
        let json;

        while (retries < MAX_RETRIES && validTracks.length < track_count) {
            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                temperature: 0.7,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: "Begin!" },
                ],
            });

            let raw = (completion.choices[0].message.content || "").trim();
            raw = raw.replace(/```json|```/g, "").trim();
            if (raw.toLowerCase().startsWith("json")) raw = raw.slice(4).trim();

            try {
                json = JSON.parse(raw);
            } catch {
                console.warn("JSON 파싱 실패, 재시도");
                retries++;
                continue;
            }

            /* 4) YouTube ID 검증/대체 */
            validTracks = [];
            for (const track of json.tracks) {
                if (!track.title || !track.artist || !track.youtube_id) continue;
                let ok = await isYouTubeVideoValid(track.youtube_id);
                if (!ok) {
                    const newId =
                        (await findAlternativeYouTubeId(track.title, track.artist)) ||
                        (await fallbackYoutubeIdFromGPT(track.title, track.artist));
                    if (newId) {
                        track.youtube_id = newId;
                        ok = true;
                    }
                }
                if (ok) validTracks.push(track);
            }

            if (validTracks.length >= track_count) {
                json.tracks = validTracks;
                break;
            }
            retries++;
        }

        if (!json || validTracks.length < track_count) {
            return res.status(502).json({ error: "유효한 트랙을 충분히 확보하지 못했습니다." });
        }

        /* 5) 🎯 원본 나레이션 유지 – 요약 X */
        return res.json(json);
    } catch (err) {
        console.error("🚨 서버 오류:", err);
        res.status(500).json({ error: "server internal error" });
    }
});

/* -------------------------------------------------- */
app.listen(PORT, () => {
    console.log(`✅ Backend ready on http://localhost:${PORT}`);
});
