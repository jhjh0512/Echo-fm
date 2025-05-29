import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

/* --------------------------------------------------
 *  HistoryExplorer – grid view (no virtualisation)
 * -------------------------------------------------- */

interface Track {
    title: string;
    artist: string;
    genre?: string;
    era?: string;
    region?: string;
    youtube_id?: string;
    narration?: string;
}

const HISTORY_KEY = "echo_history";

export default function HistoryExplorer() {
    const [raw, setRaw] = useState<Track[]>([]);

    /* ------------------------------
     *  query / filter state
     * ------------------------------ */
    const [textQuery, setTextQuery] = useState("");
    const [filterEra, setFilterEra] = useState("");
    const [filterGenre, setFilterGenre] = useState("");
    const [filterRegion, setFilterRegion] = useState("");
    const [sortNewestFirst, setSortNewestFirst] = useState(true);

    /* ------------------------------
     *  localStorage load + listener
     * ------------------------------ */
    const refresh = () => {
        try {
            const data = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
            if (Array.isArray(data)) setRaw(data as Track[]);
        } catch {
            setRaw([]);
        }
    };

    useEffect(() => {
        refresh();
        const onStorage = (e: StorageEvent) => {
            if (e.key === HISTORY_KEY) refresh();
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    /* ------------------------------
     *  derived filter values
     * ------------------------------ */
    const eras = useMemo(() => Array.from(new Set(raw.map(t => t.era).filter(Boolean))).sort(), [raw]);
    const genres = useMemo(() => Array.from(new Set(raw.map(t => t.genre).filter(Boolean))).sort(), [raw]);
    const regions = useMemo(() => Array.from(new Set(raw.map(t => t.region).filter(Boolean))).sort(), [raw]);

    /* ------------------------------
     *  apply filters + sort
     * ------------------------------ */
    const results = useMemo(() => {
        let list = [...raw];

        // text search
        if (textQuery.trim()) {
            const q = textQuery.trim().toLowerCase();
            list = list.filter(t =>
                t.title.toLowerCase().includes(q) ||
                t.artist.toLowerCase().includes(q) ||
                (t.narration || "").toLowerCase().includes(q)
            );
        }

        // filters (case‑insensitive)
        if (filterEra)
            list = list.filter(t => (t.era || "").toLowerCase() === filterEra.toLowerCase());
        if (filterGenre)
            list = list.filter(t => (t.genre || "").toLowerCase().includes(filterGenre.toLowerCase()));
        if (filterRegion)
            list = list.filter(t => (t.region || "").toLowerCase().includes(filterRegion.toLowerCase()));

        // sort (localStorage 저장 순서는 오래된 → 새로운 순으로 가정)
        if (sortNewestFirst) list = list.reverse();

        return list;
    }, [raw, textQuery, filterEra, filterGenre, filterRegion, sortNewestFirst]);

    /* ------------------------------
     *  helpers
     * ------------------------------ */
    const resetFilters = () => {
        setTextQuery("");
        setFilterEra("");
        setFilterGenre("");
        setFilterRegion("");
    };

    const activeChips = [
        filterEra && { label: filterEra, onClose: () => setFilterEra("") },
        filterGenre && { label: filterGenre, onClose: () => setFilterGenre("") },
        filterRegion && { label: filterRegion, onClose: () => setFilterRegion("") }
    ].filter(Boolean) as { label: string; onClose: () => void }[];

    /* ------------------------------
     *  UI
     * ------------------------------ */
    return (
        <div className="w-full max-w-4xl mx-auto px-4 md:px-0 py-6 space-y-6">
            <h2 className="text-2xl font-bold flex items-center gap-2">
                📚 Broadcast History Explorer
            </h2>

            {/* search + filters */}
            <div className="bg-slate-800 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="md:col-span-2 flex flex-col gap-2">
                    <label className="text-sm font-medium" htmlFor="search">Search</label>
                    <input
                        id="search"
                        type="text"
                        className="rounded-xl px-3 py-2 bg-slate-900 text-gray-100 focus:outline-none"
                        placeholder="title, artist, narration..."
                        value={textQuery}
                        onChange={e => setTextQuery(e.target.value)}
                    />
                </div>

                <select
                    className="px-3 py-2 rounded-lg bg-slate-900 text-gray-100"
                    value={filterEra}
                    onChange={e => setFilterEra(e.target.value)}
                    aria-label="Filter by era"
                >
                    <option value="">Era (all)</option>
                    {eras.map(e => <option key={e} value={e}>{e}</option>)}
                </select>

                <select
                    className="px-3 py-2 rounded-lg bg-slate-900 text-gray-100"
                    value={filterGenre}
                    onChange={e => setFilterGenre(e.target.value)}
                    aria-label="Filter by genre"
                >
                    <option value="">Genre (all)</option>
                    {genres.map(g => <option key={g} value={g}>{g}</option>)}
                </select>

                <select
                    className="px-3 py-2 rounded-lg bg-slate-900 text-gray-100"
                    value={filterRegion}
                    onChange={e => setFilterRegion(e.target.value)}
                    aria-label="Filter by region"
                >
                    <option value="">Region (all)</option>
                    {regions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>

                <div className="flex items-center gap-2 md:justify-end col-span-full">
                    <button
                        className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
                        onClick={() => setSortNewestFirst(p => !p)}
                    >
                        {sortNewestFirst ? "Newest → Oldest" : "Oldest → Newest"}
                    </button>
                    <button
                        className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
                        onClick={resetFilters}
                    >
                        Reset
                    </button>
                </div>
            </div>

            {/* active filter chips */}
            {activeChips.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {activeChips.map(chip => (
                        <Badge key={chip.label} className="pr-1 cursor-pointer" onClick={chip.onClose}>
                            {chip.label}
                            <X className="w-3 h-3 ml-1" />
                        </Badge>
                    ))}
                </div>
            )}

            {/* results */}
            {results.length === 0 ? (
                <p className="text-gray-400">No tracks match your criteria.</p>
            ) : (
                <ul className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
                    {results.map((t, idx) => (
                        <li key={`${t.title}-${t.artist}-${idx}`}>
                            <Card className="overflow-hidden rounded-2xl bg-slate-800 shadow-md hover:shadow-lg transition-shadow">
                                {t.youtube_id && (
                                    <img
                                        src={`https://img.youtube.com/vi/${t.youtube_id}/hqdefault.jpg`}
                                        alt={t.title}
                                        className="w-full h-36 object-cover"
                                    />
                                )}
                                <CardContent className="p-4 space-y-1">
                                    <h3 className="font-semibold leading-tight line-clamp-2">{t.title}</h3>
                                    <p className="text-sm text-slate-400 line-clamp-1">{t.artist}</p>
                                    <p className="text-xs text-slate-500">{[t.genre, t.era, t.region].filter(Boolean).join(" · ")}</p>
                                    {t.narration && (
                                        <p className="text-xs mt-2 text-slate-300 line-clamp-3">🗣️ {t.narration}</p>
                                    )}
                                    {t.youtube_id && (
                                        <a
                                            href={`https://youtu.be/${t.youtube_id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-block mt-2 text-sky-400 hover:underline text-xs"
                                        >
                                            ▶️ Watch on YouTube
                                        </a>
                                    )}
                                </CardContent>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
