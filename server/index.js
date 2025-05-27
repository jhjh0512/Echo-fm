require('dotenv').config();
console.log('ENV-KEY:', (process.env.YOUTUBE_API_KEY || '').slice(0, 10) || 'undefined');
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

/* --------------------------------------------------
 *  /generate – main broadcast endpoint
 * -------------------------------------------------- */
app.post('/generate', async (req, res) => {
    const {
        era,
        genre,
        region,
        user_artist = '',
        talk_ratio = 0.5,
        language = 'en-US',
        track_count = 5,
        history = []
    } = req.body;
    console.log('📝 사용자 요청 데이터:', req.body);

    const userArtistNorm = user_artist.trim().toLowerCase();

    /* ----------------------------------------------
     * 1) 사전 필터링
     *    - era, genre, region 는 항상 매칭
     *    - artist 는 "사용자가 지정했을 때만" 매칭 (case‑insensitive)
     * ---------------------------------------------- */
    const relevant = history.filter(trk => {
        const eraOk = trk.era === era;
        const regionOk = (trk.region || '').toLowerCase() === region.toLowerCase();
        const genreOk = (trk.genre || '').toLowerCase().includes(genre.toLowerCase()) ||
            genre.toLowerCase().includes((trk.genre || '').toLowerCase());
        const artistOk = !userArtistNorm || (trk.artist || '').toLowerCase() === userArtistNorm;
        return eraOk && regionOk && genreOk && artistOk;
    });

    /* ----------------------------------------------
     * 2) 제목 + 아티스트 기준 중복 제거 (case-insensitive)
     * ---------------------------------------------- */
    const dedupLatestFirst = [];
    const seen = new Set();
    for (let i = relevant.length - 1; i >= 0; i--) {
        const t = relevant[i];
        const key = `${(t.title || '').toLowerCase()}::${(t.artist || '').toLowerCase()}`;
        if (!seen.has(key)) {
            seen.add(key);
            dedupLatestFirst.push(t);
        }
    }
    const allFiltered = dedupLatestFirst.reverse(); // 최신→과거 순으로 전체 사용

    const historyPrompt = allFiltered.length
        ? `Avoid repeating these ${allFiltered.length} tracks already used in previous broadcasts:\n${allFiltered.map(t => `• \"${t.title}\" by ${t.artist}`).join('\n')}`
        : '';

    /* ----------------------------------------------
     * 3) GPT system prompt
     * ---------------------------------------------- */
    const systemPrompt = `You are Echo, an AI DJ who creates radio broadcasts based on user input.\n\nUser preferences:\n• era: ${era}\n• genre: ${genre}\n• region: ${region}\n• user_artist: ${user_artist || 'none'}\n• language: ${language}\n• talk_ratio: ${talk_ratio}\n• track_count: ${track_count}\n${userArtistNorm ? '' : '• IMPORTANT: Do not repeat artists across the playlist.'}\n\n${historyPrompt}\n\nInstructions:\n1. Select music matching the user's preferences.\n2. Return exactly ${track_count} tracks.\n3. For each track, include:\n   - title\n   - artist\n   - youtube_id\n   - narration\n4. The amount of DJ narration must reflect the talk_ratio:\n   - 0.0 → no narration at all\n   - 0.5 → brief 14–16 sentence intro per song\n   - 1.0 → full commentary with story, lyrics, and background\n5. The entire narration and content must be written in the language specified.\n   - en-US → American English\n   - ko-KR → Korean\n   - ja-JP → Japanese\n6. Output only valid JSON like this:\n{\n  \"artist_intro\": { \"narration\": \"...\" },\n  \"tracks\": [\n    { \"title\": \"...\", \"artist\": \"...\", \"youtube_id\": \"...\", \"narration\": \"...\" }\n  ],\n  \"closing\": \"...\"\n}\nNO markdown. No extra text. Return only valid JSON.\n7. If user_artist is 'none', every track must be by a different artist.\n8. artist_intro.narration MUST be a detailed DJ monologue`;
    console.log('📣 생성된 GPT 프롬프트:\n', systemPrompt);

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
                retries++;
                continue;
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
