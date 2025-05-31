// src/components/Player.tsx

import { useRef, useState, useEffect } from "react";
import YouTube, { type YouTubeEvent } from "react-youtube";
import { speak } from "../utils/tts";

export interface Track {
    title: string;
    artist: string;
    youtube_id: string;
    narration?: string;
}

export interface PlayerProps {
    tracks: Track[];
    voice: string;
    introDone: boolean;
    language: string;
}

export default function Player({
    tracks,
    voice,
    introDone,
    language,
}: PlayerProps) {
    const [idx, setIdx] = useState(0);
    const current = tracks[idx];

    const playerRef = useRef<any>(null);
    const utterRef = useRef<{ promise: Promise<void>; cancel: () => void } | null>(
        null
    );

    // 현재 재생 중인 TTS 취소
    const stopNarration = () => {
        utterRef.current?.cancel();
        utterRef.current = null;
    };

    // 다음/이전 트랙 이동
    const nextTrack = () => {
        stopNarration();
        playerRef.current?.stopVideo();
        setIdx((i) => (i + 1) % tracks.length);
    };
    const prevTrack = () => {
        stopNarration();
        playerRef.current?.stopVideo();
        setIdx((i) => (i - 1 + tracks.length) % tracks.length);
    };

    // 내레이션이 끝나면 영상 재생
    useEffect(() => {
        if (!introDone || !current?.narration) return;

        stopNarration();
        const utter = speak(current.narration, voice, language);
        utterRef.current = utter;

        utter.promise
            .then(() => playerRef.current?.playVideo())
            .catch((err) => console.error("[Player] TTS error", err));
    }, [idx, introDone, voice, language, current]);

    // 언마운트 시 내레이션 정리
    useEffect(() => () => stopNarration(), []);

    if (!tracks.length) return null;

    return (
        <>
            {/* 1) 영상 영역 (16:9 비율) */}
            <div className="w-full aspect-video relative">
                <YouTube
                    key={current.youtube_id}
                    videoId={current.youtube_id}
                    opts={{
                        width: "100%",
                        height: "100%",
                        playerVars: { autoplay: 0, rel: 0, enablejsapi: 1 },
                    }}
                    onReady={(e) => (playerRef.current = e.target)}
                    onStateChange={(e: YouTubeEvent<number>) => {
                        if (e.data === 0) nextTrack(); // 영상 끝나면 다음 트랙
                    }}
                    className="absolute inset-0 w-full h-full"
                />
            </div>

            {/* 2) 영상 아래: 내레이션 텍스트 */}
            {current.narration && (
                <blockquote className="mt-4 bg-slate-800 rounded-xl p-4 text-sm text-slate-200 border-l-4 border-blue-500">
                    {current.narration}
                </blockquote>
            )}

            {/* 3) 영상 아래: Prev / Stop / Next 버튼 */}
            <div className="mt-2 flex gap-2">
                <button
                    onClick={prevTrack}
                    className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600"
                >
                    ⏮️ Prev
                </button>
                <button
                    onClick={stopNarration}
                    className="px-3 py-1 rounded bg-red-600 hover:bg-red-500"
                >
                    ⏹️ Stop Narration
                </button>
                <button
                    onClick={nextTrack}
                    className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600"
                >
                    ⏭️ Next
                </button>
            </div>
        </>
    );
}
