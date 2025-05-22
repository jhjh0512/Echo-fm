export async function speak(text: string, voice = "alloy"): Promise<void> {
    const res = await fetch("http://localhost:3001/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice })
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    return new Promise((resolve, reject) => {
        const audio = new Audio(url);

        // ✅ 래퍼 함수로 타입 맞춰 줌
        audio.onended = () => resolve();
        audio.onerror = (e) => reject(e);

        audio.play();
    });
}