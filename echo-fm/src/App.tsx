import { useState } from 'react';
import { speak } from './utils/tts';
import Player from './components/Player';
import HistoryExplorer from './HistoryExplorer';

const HISTORY_KEY = 'echo_history';

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
  const [voice, setVoice] = useState('alloy');
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  /* --------------------------------------------------
   *  히스토리 저장
   * -------------------------------------------------- */
  const saveToHistory = (playlist: any[]) => {
    const existing: any[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');

    const summarized = playlist.map((t: any) => ({
      title: t.title,
      artist: t.artist,
      genre,
      era,
      region,
      youtube_id: t.youtube_id,
      narration: t.narration
    }));

    const merged = [...existing, ...summarized];
    const unique = Array.from(
      new Map(
        merged.map(trk => [
          `${trk.title.toLowerCase()}::${trk.artist.toLowerCase()}::${trk.era}::${trk.genre}::${trk.region}`,
          trk
        ])
      ).values()
    );

    localStorage.setItem(HISTORY_KEY, JSON.stringify(unique));
  };

  /* --------------------------------------------------
   *  히스토리 내보내기 / 가져오기
   * -------------------------------------------------- */
  const exportHistory = () => {
    const history = localStorage.getItem(HISTORY_KEY);
    if (!history) return;
    const blob = new Blob([history], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'echo_fm_history.json';
    a.click();
  };

  const importHistory = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (!Array.isArray(imported)) throw new Error('Invalid format');
      const existing: any[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      const merged = [...existing, ...imported];
      const unique = Array.from(
        new Map(
          merged.map(trk => [
            `${trk.title.toLowerCase()}::${trk.artist.toLowerCase()}::${trk.era}::${trk.genre}::${trk.region}`,
            trk
          ])
        ).values()
      );
      localStorage.setItem(HISTORY_KEY, JSON.stringify(unique));
      alert('✅ History imported & merged');
    } catch {
      alert('❌ Failed to import');
    }
  };

  const clearHistory = () => {
    if (window.confirm('히스토리를 정말 삭제할까요?')) {
      localStorage.removeItem(HISTORY_KEY);
      alert('🗑️ 히스토리 삭제 완료');
    }
  };

  const getHistory = () => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  /* --------------------------------------------------
   *  방송 생성 요청
   * -------------------------------------------------- */
  const handleGenerate = async () => {
    if (loading) return;
    setLoading(true);

    const history = getHistory();
    console.log('📝 사용자 입력값:', {
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
      console.log('✅ 응답 도착:', json);

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
      console.error('❌ 요청 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  /* --------------------------------------------------
   *  UI
   * -------------------------------------------------- */
  return (
    <div className="p-8 space-y-8 font-sans text-gray-100 bg-gray-900 min-h-screen">
      <h1 className="text-3xl font-bold">Echo FM 🎙️</h1>

      {/* Control Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col space-y-2">
          <input value={era} onChange={e => setEra(e.target.value)} placeholder="Era (e.g. 1990s)" className="px-3 py-2 rounded-lg bg-gray-800" />
          <input value={genre} onChange={e => setGenre(e.target.value)} placeholder="Genre (e.g. indie rock)" className="px-3 py-2 rounded-lg bg-gray-800" />
          <input value={region} onChange={e => setRegion(e.target.value)} placeholder="Region (e.g. US)" className="px-3 py-2 rounded-lg bg-gray-800" />
          <input value={artist} onChange={e => setArtist(e.target.value)} placeholder="Artist (optional)" className="px-3 py-2 rounded-lg bg-gray-800" />
          <select value={language} onChange={e => setLanguage(e.target.value)} className="px-3 py-2 rounded-lg bg-gray-800">
            <option value="en-US">English (US)</option>
            <option value="ko-KR">Korean</option>
            <option value="ja-JP">Japanese</option>
          </select>
          <label className="mt-4">🎚️ Talk Ratio: {talkRatio.toFixed(1)}</label>
          <input type="range" min={0} max={1} step={0.1} value={talkRatio} onChange={e => setTalkRatio(Number(e.target.value))} />
          <select value={voice} onChange={e => setVoice(e.target.value)} className="px-3 py-2 rounded-lg bg-gray-800">
            {['alloy', 'shimmer', 'echo', 'fable', 'nova', 'onyx'].map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <select value={trackCount} onChange={e => setTrackCount(Number(e.target.value))} className="px-3 py-2 rounded-lg bg-gray-800">
            {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
              <option key={n} value={n}>{n} tracks</option>
            ))}
          </select>
          <button onClick={handleGenerate} disabled={loading} className="mt-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50">
            {loading ? 'Loading…' : 'Generate'}
          </button>
        </div>

        {/* History & File Controls */}
        <div className="flex flex-col space-y-2">
          <button onClick={() => setShowHistory(p => !p)} className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600">
            {showHistory ? 'Hide History' : 'Show History'}
          </button>
          <button onClick={exportHistory} className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600">Export History</button>
          <label className="flex flex-col">
            <span className="text-sm mb-1">Import History JSON</span>
            <input type="file" accept="application/json" onChange={importHistory} className="file:px-4 file:py-2 file:bg-gray-700 file:rounded-lg" />
          </label>
          <button onClick={clearHistory} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500">🗑️ Clear History</button>
        </div>
      </div>

      {showHistory && <HistoryExplorer />}

      {/* Player & Response */}
      {response && (
        <>
          <Player tracks={response.tracks} voice={voice} introDone={introDone} />
          <div className="mt-8 space-y-4">
            <h2 className="text-xl font-semibold">{response.artist_intro?.name}</h2>
            <p className="text-gray-300">{response.artist_intro?.bio}</p>
            {response.artist_intro?.narration && (
              <blockquote className="p-4 bg-gray-800 rounded-2xl border-l-4 border-blue-500 italic text-gray-300">🗣️ {response.artist_intro.narration}</blockquote>
            )}
            <ul className="space-y-4">
              {response.tracks?.map((t: any, i: number) => (
                <li key={i} className="p-4 rounded-2xl bg-gray-800 shadow-md">
                  <strong>🎵 {t.title} by {t.artist}</strong><br />
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
