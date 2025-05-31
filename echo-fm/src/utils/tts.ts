// src/utils/tts.ts

/**
 * text를 해당 voiceName, lang으로 읽어주는 함수.
 * 반환값으로 promise와 cancel 함수를 같이 돌려줍니다.
 */
export function speak(
    text: string,
    voiceName: string,
    lang: string = "en-US"
): { promise: Promise<void>; cancel: () => void } {
    const synth = window.speechSynthesis;
    let utter: SpeechSynthesisUtterance;

    const promise = new Promise<void>((resolve, reject) => {
        // 실제로 TTS를 생성하고 speak를 호출하는 내부 함수
        const doSpeak = () => {
            utter = new SpeechSynthesisUtterance(text);
            utter.lang = lang;

            // 브라우저에 등록된 모든 목소리를 가져옵니다
            const voices = synth.getVoices();
            // ① 이름과 언어가 모두 일치하는 목소리 우선
            // ② 언어만 일치하는 목소리 그다음
            // ③ 그래도 없으면 첫 번째 목소리
            utter.voice =
                voices.find(
                    (v) =>
                        v.lang === lang &&
                        v.name.toLowerCase().includes(voiceName.toLowerCase())
                ) ??
                voices.find((v) => v.lang === lang) ??
                voices[0] ??
                null;

            utter.onend = () => {
                resolve();
            };
            utter.onerror = (e) => {
                reject(e);
            };

            synth.speak(utter);
        };

        // 만약 getVoices()가 빈 배열을 리턴한다면 아직 목소리가 로드되지 않은 상태
        // 이럴 때는 voiceschanged 이벤트를 한 번 기다렸다가 doSpeak()를 호출합니다.
        if (!synth.getVoices().length) {
            const onVoicesChanged = () => {
                synth.removeEventListener("voiceschanged", onVoicesChanged);
                doSpeak();
            };
            synth.addEventListener("voiceschanged", onVoicesChanged);
        } else {
            doSpeak();
        }
    });

    // cancel() 호출 시 utter.onend와 utter.onerror 핸들러를 제거하고 cancel
    const cancel = () => {
        if (utter) {
            utter.onend = null;
            utter.onerror = null;
        }
        synth.cancel();
    };

    return { promise, cancel };
}
