import { useState } from 'react';
import { speak } from './utils/tts';
import Player from './components/Player';

function App() {
  const [era, setEra] = useState('1990s');
  const [genre, setGenre] = useState('indie rock');
  const [region, setRegion] = useState('US');
  const [artist, setArtist] = useState('Pavement');
  const [talkRatio, setTalkRatio] = useState(0.5);
  const [trackCount, setTrackCount] = useState(4);
  const [response, setResponse] = useState<any>(null);
  const [introDone, setIntroDone] = useState(false);
  const [language, setLanguage] = useState('en-US');
  const [voice, setVoice] = useState("alloy");
  const [loading, setLoading] = useState(false);

  const saveToHistory = (playlist: any[]) => {
    const existing = JSON.parse(localStorage.getItem("echo_history") || "[]");

    const summarizedTracks = playlist.map((track: any) => ({
      title: track.title,
      artist: track.artist,
      youtube_url: `https://youtu.be/${track.youtube_id}`,
      narration: track.narration
    }));

    const updated = [...existing, ...summarizedTracks];
    const unique = Array.from(
      new Map(updated.map(item => [item.title + "::" + item.artist, item])).values()
    ).slice(-100);

    localStorage.setItem("echo_history", JSON.stringify(unique));
  };

  const exportHistory = () => {
    const history = localStorage.getItem("echo_history");
    if (!history) return;

    const blob = new Blob([history], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "echo_fm_history.json";
    a.click();
  };

  const importHistory = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (!Array.isArray(imported)) throw new Error("Invalid format");

      const existing = JSON.parse(localStorage.getItem("echo_history") || "[]");
      localStorage.setItem("echo_history_backup", JSON.stringify(existing));

      const merged = [...existing, ...imported];
      const unique = Array.from(
        new Map(merged.map(item => [item.title + "::" + item.artist, item])).values()
      ).slice(-100);

      localStorage.setItem("echo_history", JSON.stringify(unique));
      alert("✅ History successfully imported and merged!");
    } catch {
      alert("❌ Failed to import history. Please check the file format.");
    }
  };

  const clearHistory = () => {
    if (window.confirm("정말로 히스토리를 삭제하시겠습니까?")) {
      localStorage.removeItem("echo_history");
      alert("🗑️ 히스토리가 삭제되었습니다.");
    }
  };

  const getSummarizedHistory = () => {
    try {
      const raw = localStorage.getItem("echo_history");
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  };

  const handleGenerate = async () => {
    if (loading) return;
    setLoading(true);

    const history = getSummarizedHistory();
    console.log("📝 사용자 입력값:", {
      era,
      genre,
      region,
      user_artist: artist,
      talk_ratio: talkRatio,
      language,
      history
    });

    try {
      const res = await fetch('http://localhost:3001/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          era,
          genre,
          region,
          user_artist: artist,
          talk_ratio: talkRatio,
          language,
          track_count: trackCount,
          history
        })
      });

      const json = await res.json();
      console.log("✅ 응답 도착:", json);

      if (json.artist_intro?.narration) {
        setIntroDone(false);
        await speak(json.artist_intro.narration, voice);
        setIntroDone(true);
      } else {
        setIntroDone(true);
      }

      setResponse(json);
      saveToHistory(json.tracks);

    } catch (err) {
      console.error("❌ 요청 실패:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 32, fontFamily: 'sans-serif' }}>
      <h1>Echo FM 🎙️</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        <input value={era} onChange={e => setEra(e.target.value)} placeholder="Era (e.g. 1990s)" />
        <input value={genre} onChange={e => setGenre(e.target.value)} placeholder="Genre (e.g. indie rock)" />
        <input value={region} onChange={e => setRegion(e.target.value)} placeholder="Region (e.g. US)" />
        <input value={artist} onChange={e => setArtist(e.target.value)} placeholder="Artist (e.g. Pavement)" />
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="en-US">English (US)</option>
          <option value="ko-KR">Korean</option>
          <option value="ja-JP">Japanese</option>
        </select>
        <div style={{ marginTop: 24 }}>
          <label>🎚️ 해설 비율 (talk_ratio): {talkRatio.toFixed(1)}</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={talkRatio}
            onChange={e => setTalkRatio(Number(e.target.value))}
          />
        </div>
        <select value={voice} onChange={e => setVoice(e.target.value)}>
          {["alloy", "shimmer", "echo", "fable", "nova", "onyx"].map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

        Track count
        <select value={trackCount} onChange={(e) => setTrackCount(Number(e.target.value))}>
          {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
            <option key={n} value={n}>{n} tracks</option>
          ))}
        </select>

        <button onClick={handleGenerate} disabled={loading}>
          {loading ? "Loading…" : "Generate"}
        </button>
        <button onClick={exportHistory}>Export History</button>
        <input type="file" accept="application/json" onChange={importHistory} />
        <button onClick={clearHistory}>🗑️ Clear History</button>
      </div>

      {response && (
        <>
          <Player tracks={response.tracks} voice={voice} introDone={introDone} />
          <div>
            <h2>{response.artist_intro?.name}</h2>
            <p>{response.artist_intro?.bio}</p>
            {response.artist_intro?.narration && (
              <blockquote
                style={{
                  margin: "12px 0",
                  padding: "12px",
                  borderLeft: "4px solid #555",
                  background: "#1f2937",
                  color: "#f1f5f9",
                  fontStyle: "italic"
                }}
              >
                🗣️ {response.artist_intro.narration}
              </blockquote>
            )}
            <ul>
              {response.tracks?.map((t: any, i: number) => (
                <li key={i} style={{ marginBottom: 16 }}>
                  <strong>🎵 {t.title} by {t.artist}</strong>
                  <br />
                  🗣️ {t.narration}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

export default App;