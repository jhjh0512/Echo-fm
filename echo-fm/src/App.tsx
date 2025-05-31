// src/App.tsx

import { useRef, useState } from "react";
import { speak } from "./utils/tts";
import Player from "./components/Player";
import HistoryExplorer from "./HistoryExplorer";

const HISTORY_KEY = "echo_history";
const SUMMARY_ENDPOINT = "http://localhost:3001/summaries"; // 현재 fetchSummaries에서만 사용
const GENERATE_ENDPOINT = "http://localhost:3001/generate";

async function fetchSummaries(texts: (string | undefined)[]): Promise<string[]> {
  if (!texts.some(Boolean)) return texts.map((t) => t || "");
  try {
    const res = await fetch(SUMMARY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
    });
    const json = await res.json();
    if (Array.isArray(json.summaries)) return json.summaries as string[];
    throw new Error("Invalid /summaries response");
  } catch (err) {
    console.warn("/summaries failed → using originals", err);
    return texts.map((t) => t || "");
  }
}

function trackKey(t: any) {
  return `${t.title.toLowerCase()}::${t.artist.toLowerCase()}::${t.era}::${t.genre}::${t.region}`;
}

function getStoredHistory(): any[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveToHistory(playlist: any[], genre: string, era: string, region: string) {
  // summaries from backend
  const summaries = await fetchSummaries(playlist.map((t) => t.narration));

  const summarizedTracks = playlist.map((t: any, i: number) => ({
    title: t.title,
    artist: t.artist,
    genre,
    era,
    region,
    youtube_id: t.youtube_id,
    narration: summaries[i] || "",
  }));

  const existing = getStoredHistory();
  const merged = [...existing, ...summarizedTracks];

  // dedup by key
  const unique = Array.from(new Map(merged.map((m) => [trackKey(m), m])).values());
  localStorage.setItem(HISTORY_KEY, JSON.stringify(unique));
}

function exportHistory() {
  const data = localStorage.getItem(HISTORY_KEY);
  if (!data) return;
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "echo_fm_history.json";
  a.click();
}

async function importHistory(file: File | null) {
  if (!file) return;
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    if (!Array.isArray(imported)) throw new Error("invalid format");
    const merged = [...getStoredHistory(), ...imported];
    const unique = Array.from(new Map(merged.map((m: any) => [trackKey(m), m])).values());
    localStorage.setItem(HISTORY_KEY, JSON.stringify(unique));
    alert("✅ history imported");
  } catch {
    alert("❌ import failed");
  }
}

function clearHistory() {
  if (window.confirm("히스토리를 정말 삭제할까요?")) {
    localStorage.removeItem(HISTORY_KEY);
    alert("🗑️ 히스토리 삭제 완료");
  }
}

export default function App() {
  /* ---------------- state ---------------- */
  const [era, setEra] = useState("1990s");
  const [genre, setGenre] = useState("indie rock");
  const [region, setRegion] = useState("US");
  const [artist, setArtist] = useState("Pavement");
  const [talkRatio, setTalkRatio] = useState(0.5);
  const [trackCount, setTrackCount] = useState(4);
  const [language, setLanguage] = useState("en-US");
  const [voice, setVoice] = useState("alloy");
  const [introDone, setIntroDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [introText, setIntroText] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---------------- generate ---------------- */
  const handleGenerate = async () => {
    if (loading) return;
    setLoading(true);
    setIntroDone(false);
    setIntroText("");
    setResponse(null);

    try {
      const res = await fetch(GENERATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          era,
          genre,
          region,
          user_artist: artist,
          talk_ratio: talkRatio,
          language,
          track_count: trackCount,
          history: getStoredHistory(),
        }),
      });
      const json = await res.json();
      console.log("🕵️‍♂️ artist_intro payload:", json.artist_intro);
      console.log("✅ generate resp", json);

      // intro narration
      const introNarration =
        typeof json.artist_intro === "string"
          ? json.artist_intro
          : json.artist_intro?.narration;

      if (introNarration) {
        setIntroText(introNarration);
        console.log("🔉 [Intro TTS] 호출 직전:", introNarration);
        const { promise, cancel } = speak(introNarration, voice, language);
        try {
          await promise;
          console.log("🔉 [Intro TTS] 재생 완료");
        } catch (err) {
          console.error("🔉 [Intro TTS] 에러 발생:", err);
        }
        console.log("🔔 Intro 끝, introDone=true 전환");
        setIntroDone(true);
      } else {
        console.warn("⚠️ introNarration이 없어 TTS 스킵");
      }

      setResponse(json);
      await saveToHistory(json.tracks, genre, era, region);
    } catch (e) {
      console.error("generate error", e);
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- UI ---------------- */
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6 space-y-8">
      <h1 className="text-3xl font-bold">Echo FM 🎙️</h1>

      {/* control + intro */}
      <div className="grid md:grid-cols-2 gap-8">
        {/* ● control panel */}
        <div className="flex flex-col gap-3 bg-gray-800 rounded-xl p-4">
          <input className="bg-gray-900 rounded-lg px-3 py-2" value={era} onChange={e => setEra(e.target.value)} placeholder="Era" />
          <input className="bg-gray-900 rounded-lg px-3 py-2" value={genre} onChange={e => setGenre(e.target.value)} placeholder="Genre" />
          <input className="bg-gray-900 rounded-lg px-3 py-2" value={region} onChange={e => setRegion(e.target.value)} placeholder="Region" />
          <input className="bg-gray-900 rounded-lg px-3 py-2" value={artist} onChange={e => setArtist(e.target.value)} placeholder="Artist (optional)" />

          <label className="text-sm mt-2">Language</label>
          <select className="bg-gray-900 rounded-lg px-3 py-2" value={language} onChange={e => setLanguage(e.target.value)}>
            <option value="en-US">English</option>
            <option value="ko-KR">한국어</option>
            <option value="ja-JP">日本語</option>
          </select>

          <label className="text-sm mt-2">Talk ratio: {talkRatio.toFixed(1)}</label>
          <input type="range" min="0" max="1" step="0.1" value={talkRatio} onChange={e => setTalkRatio(Number(e.target.value))} />

          <label className="text-sm mt-2">Voice</label>
          <select className="bg-gray-900 rounded-lg px-3 py-2" value={voice} onChange={e => setVoice(e.target.value)}>
            {[
              "alloy",
              "shimmer",
              "echo",
              "fable",
              "nova",
              "onyx",
            ].map(v => <option key={v}>{v}</option>)}
          </select>

          <label className="text-sm mt-2">Track count</label>
          <select className="bg-gray-900 rounded-lg px-3 py-2" value={trackCount} onChange={e => setTrackCount(Number(e.target.value))}>
            {[...Array(11)].map((_, i) => i + 2).map(n => <option key={n}>{n}</option>)}
          </select>

          <button className="mt-2 bg-blue-600 hover:bg-blue-500 rounded-lg py-2 disabled:opacity-50" onClick={handleGenerate} disabled={loading}>
            {loading ? "Loading…" : "Generate"}
          </button>

          <hr className="my-3 border-gray-700" />

          <button className="bg-gray-700 rounded-lg py-2" onClick={() => setShowHistory(p => !p)}>
            {showHistory ? "Hide history" : "Show history"}
          </button>
          <button className="bg-gray-700 rounded-lg py-2" onClick={exportHistory}>Export history</button>
          <button className="bg-gray-700 rounded-lg py-2" onClick={() => fileInputRef.current?.click()}>Import history</button>
          <button className="bg-red-700 rounded-lg py-2" onClick={clearHistory}>Clear history</button>
          <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={e => importHistory(e.target.files?.[0] || null)} />
        </div>

        {/* ● intro & player */}
        <div className="flex flex-col gap-6">
          {introText && (
            <div className="bg-gray-800 rounded-xl p-4">
              <h2 className="font-semibold mb-2">🎤 Intro narration</h2>
              <p className="text-sm whitespace-pre-wrap">{introText}</p>
            </div>
          )}

          {response && (
            <Player
              tracks={response?.tracks || []}
              voice={voice}
              introDone={introDone}
              language={language}
            />
          )}
        </div>
      </div>

      {/* history explorer */}
      {showHistory && <HistoryExplorer />}
    </div>
  );
}
