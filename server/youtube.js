require('dotenv').config();
const axios = require('axios');
const { OpenAI } = require('openai');

const YT_SEARCH_API = 'https://www.googleapis.com/youtube/v3/search';
const YT_API_KEY = process.env.YOUTUBE_API_KEY;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ---------- 1. 유효성 검사 ---------- */
async function isYouTubeVideoValid(id) {
    const oembed = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`;
    try {
        const r = await axios.get(oembed, { timeout: 3000 });
        return r.status === 200;
    } catch (e) {
        if (e.response && [403, 503].includes(e.response.status)) {
            console.log(`⚠️ oEmbed ${e.response.status} → HEAD 재확인`);
            try {
                const head = await axios.head(`https://www.youtube.com/watch?v=${id}`, { timeout: 3000 });
                return head.status === 200;
            } catch { return false; }
        }
        return false;
    }
}

/* ---------- 2. YouTube 검색 ---------- */
async function findAlternativeYouTubeId(title, artist) {
    const queries = [
        `"${title}" ${artist} official video`,
        `${artist} "${title}" official video`,
        `"${title}" ${artist} lyrics`,
        `${artist} "${title}" lyrics`,
        `"${title}" ${artist} live`,
        `${artist} "${title}" live`,
        `"${title}" ${artist}`,
        `${artist} "${title}"`
    ];

    for (const q of queries) {
        console.log(`🔎 SEARCH "${q}"`);
        const url = `${YT_SEARCH_API}?part=snippet&type=video&order=relevance&maxResults=10&q=${encodeURIComponent(q)}&key=${YT_API_KEY}`;
        try {
            const { data } = await axios.get(url, { timeout: 4000 });
            console.log(`   ↳ 결과 ${data.items.length}개`);
            for (const item of data.items) {
                const vid = item.id.videoId;
                const ok = await isYouTubeVideoValid(vid);
                console.log(`     • ${vid} → ${ok ? 'OK' : 'BAD'}`);
                if (ok) return vid;
            }
        } catch (err) {
            if (err.response) {
                console.error(`❗ HTTP ${err.response.status}: ${err.response.data.error?.message}`);
            } else {
                console.error('❗ Axios error:', err.message);
            }
        }
    }
    return null;
}

/* ---------- 3. GPT fallback ---------- */
async function fallbackYoutubeIdFromGPT(title, artist) {
    try {
        const resp = await openai.chat.completions.create({
            model: 'gpt-4o',
            temperature: 0.2,
            max_tokens: 50,
            messages: [
                {
                    role: 'system',
                    content: 'Return up to 5 working YouTube video IDs (comma-separated). Fan uploads, lyric or live videos are OK. If none, reply null.'
                },
                { role: 'user', content: `${title} by ${artist}` }
            ]
        });

        const raw = resp.choices[0].message.content.trim();
        console.log('🤖 GPT fallback 응답:', raw);
        const ids = raw.match(/[a-zA-Z0-9_-]{11}/g) || [];
        for (const id of ids) {
            if (await isYouTubeVideoValid(id)) return id;
        }
    } catch (err) {
        console.error('🤖 GPT fallback 오류:', err.message);
    }
    return null;
}

module.exports = {
    isYouTubeVideoValid,
    findAlternativeYouTubeId,
    fallbackYoutubeIdFromGPT
};
