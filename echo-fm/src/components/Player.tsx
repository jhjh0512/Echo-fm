/// <reference types="youtube" />

import React, { useEffect, useRef, useState } from "react";
import YouTube from "react-youtube";
import type { YouTubeProps } from "react-youtube";
import { speak } from "../utils/tts";

type Track = { title: string; artist: string; youtube_id: string; narration: string };

type PlayerProps = {
    tracks: Track[];
    voice: string;
    introDone: boolean;
};

export default function Player({ tracks, voice, introDone }: PlayerProps) {
    const [idx, setIdx] = useState(0);
    const [ready, setReady] = useState(false);          // ⭐ 준비 여부
    const playerRef = useRef<YT.Player | null>(null);
    const lastKey = useRef<string>("");

    /* ① 인덱스·voice 바뀔 때: 준비돼 있을 때만 나레이션 → play */
    useEffect(() => {
        if (!introDone || !ready) return;                 // 준비 안 됐으면 skip
        const t = tracks[idx];
        if (!t?.narration) return;

        const key = `${idx}-${voice}`;
        if (lastKey.current === key) return;              // Strict 모드 중복 방지
        lastKey.current = key;

        // 1) 영상은 이미 onReady에서 pauseVideo() 해둠
        // 2) 나레이션
        speak(t.narration, voice).then(() => {
            playerRef.current?.playVideo?.();               // 3) 끝나면 재생
        });
    }, [idx, voice, introDone, ready, tracks]);

    /* ② 트랙 끝 → 다음 인덱스 */
    const onEnd: YouTubeProps["onEnd"] = () =>
        setIdx(prev => (prev + 1) % tracks.length);

    /* ③ 영상 준비되면: ref 지정 + pause + ready=true */
    const onReady: YouTubeProps["onReady"] = e => {
        playerRef.current = e.target;
        e.target.pauseVideo();      // 첫 로드 시 자동재생 방지
        setReady(true);             // ⭐ 준비 완료 플래그
    };

    const opts: YouTubeProps["opts"] = { playerVars: { autoplay: 0 } };
    const track = tracks[idx];

    if (!track) return <div style={{ padding: 24 }}>⏳ Loading…</div>;

    return (
        <div>
            <h3>🎵 {track.title} — {track.artist}</h3>

            <YouTube
                videoId={track.youtube_id}
                opts={opts}
                onReady={onReady}
                onEnd={onEnd}
            />

            <button onClick={() => setIdx(prev => (prev + 1) % tracks.length)}>
                ▶️ Skip
            </button>
        </div>
    );
}
