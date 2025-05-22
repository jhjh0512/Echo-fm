require('dotenv').config();
console.log('ENV-KEY:', process.env.YOUTUBE_API_KEY?.slice(0, 10) || 'undefined');
const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const ttsRouter = require('./routes/tts');

const {
    isYouTubeVideoValid,
    findAlternativeYouTubeId,
    fallbackYoutubeIdFromGPT
} = require('./youtube.js');

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json());
app.use('/api/tts', ttsRouter);

app.post('/generate', async (req, res) => {
    const { era, genre, region, user_artist, talk_ratio = 0.5, language = 'en-US', track_count = 5, history = [] } = req.body;
    console.log("📝 사용자 요청 데이터:", req.body);

    // ---------- history filtering (era+genre+region+artist) ----------
    const relevantHistory = history.filter(track =>
        (track.genre?.toLowerCase().includes(genre.toLowerCase()) ||
            genre.toLowerCase().includes(track.genre?.toLowerCase() || '')) &&
        (track.era === era) &&
        (track.region?.toLowerCase() === region.toLowerCase()) &&
        (!user_artist || track.artist === user_artist)
    );

    const historyPrompt = relevantHistory.length > 0
        ? `Avoid repeating these tracks already used in previous broadcasts:\n${relevantHistory.map(t => `• \"${t.title}\" by ${t.artist}`).join("\n")}`
        : "";

    const systemPrompt = `
You are Echo, an AI DJ who creates radio broadcasts based on user input.

User preferences:
• era: ${era}
• genre: ${genre}
• region: ${region}
• user_artist: ${user_artist || 'none'}
• language: ${language}
• talk_ratio: ${talk_ratio}
• track_count: ${track_count}
${user_artist ? "" : "• IMPORTANT: Do not repeat artists across the playlist."}

${historyPrompt}

Instructions:
1. Select music matching the user's preferences.
2. Return **exactly ${track_count} tracks**.
3. For each track, include:
   - title
   - artist
   - youtube_id
   - narration
4. The amount of DJ narration must reflect the talk_ratio:
   - 0.0 → no narration at all
   - 0.5 → brief 14–16 sentence intro per song
   - 1.0 → full commentary with story, lyrics, and background
5. The entire narration and content must be written in the language specified.
   - en-US → American English
   - ko-KR → Korean
   - ja-JP → Japanese
6. Output only valid JSON like this:
{
  "artist_intro": { "narration": "..." },
  "tracks": [
    { "title": "...", "artist": "...", "youtube_id": "...", "narration": "..." }
  ],
  "closing": "..."
}
NO markdown. No extra text. Return only valid JSON.
7. If **user_artist is 'none'**, every track **must be by a different artist**.
8. artist_intro.narration MUST be a detailed DJ monologue
`;
    console.log("📣 생성된 GPT 프롬프트:\n", systemPrompt);

    try {
        const MAX_RETRIES = 3;
        let retries = 0;
        let validTracks = [];

        while (retries < MAX_RETRIES && validTracks.length < track_count) {
            const completion = await openai.chat.completions.create({
                model: 'gpt-4o',
                temperature: 0.7,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: 'Begin!' }
                ]
            });

            let raw = (completion.choices[0].message.content || '').trim();
            console.log(`🧠 GPT 응답 (시도 ${retries + 1}):\n${raw.slice(0, 160)}…\n`);

            raw = raw.replace(/```json|```/g, '').trim();
            if (raw.toLowerCase().startsWith('json')) raw = raw.slice(4).trim();

            let json;
            try {
                json = JSON.parse(raw);
            } catch (err) {
                console.error('🔥 JSON 파싱 실패:', err.message);
                retries++; continue;
            }

            validTracks = [];
            for (const track of json.tracks) {
                console.log(`🔍 검증: ${track.title} — ${track.youtube_id}`);
                let ok = await isYouTubeVideoValid(track.youtube_id);

                if (!ok) {
                    console.warn(`❌ Invalid ID: ${track.youtube_id} → YouTube 검색`);
                    let newId = await findAlternativeYouTubeId(track.title, track.artist);

                    if (!newId) {
                        console.warn(`🔁 검색 실패, GPT fallback: ${track.title}`);
                        newId = await fallbackYoutubeIdFromGPT(track.title, track.artist);
                    }
                    if (newId) {
                        console.log(`✅ 대체 ID 획득: ${newId}`);
                        track.youtube_id = newId;
                        ok = true;
                    } else {
                        console.warn(`⛔ 최종 실패: ${track.title}`);
                    }
                }
                if (ok) validTracks.push(track);
            }

            console.log(`🎯 유효 트랙 수: ${validTracks.length}\n`);
            if (validTracks.length >= track_count) {
                json.tracks = validTracks;
                return res.json(json);
            }
            retries++;
        }
        res.status(502).json({ error: '유효한 트랙을 충분히 찾지 못했습니다.' });

    } catch (err) {
        console.error('🚨 서버 오류:', err);
        res.status(500).json({ error: '서버 내부 오류' });
    }
});

app.listen(3001, () => {
    console.log('✅ Backend ready on http://localhost:3001');
});
