// Speech-to-text on the phone (Apple's recognizer through expo-speech-recognition). Optional: on a build
// without the native module, or with Speech Recognition turned off, it returns "" and the server's
// Whisper listens instead. It's tried on the recording after it's made, so the mic is never shared.
type Module = typeof import("expo-speech-recognition").ExpoSpeechRecognitionModule;

function speechModule(): Module | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require("expo-speech-recognition").ExpoSpeechRecognitionModule as Module | undefined;
    return m?.isRecognitionAvailable() ? m : null;
  } catch {
    return null;
  }
}

export function deviceSpeechAvailable(): boolean {
  return speechModule() !== null;
}

// Asks once; a "no" is fine.
export async function allowDeviceSpeech(): Promise<boolean> {
  const m = speechModule();
  if (!m) return false;
  try {
    return (await m.requestSpeechRecognizerPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

const LOCALES: Record<string, string> = { hi: "hi-IN", en: "en-IN", mr: "mr-IN", bn: "bn-IN", ta: "ta-IN", te: "te-IN", ar: "ar-AE", hinglish: "en-IN" };

export async function transcribeOnDevice(uri: string, language: string, timeoutMs = 12_000): Promise<string> {
  const m = speechModule();
  if (!m) return "";
  try {
    const perm = await m.getSpeechRecognizerPermissionsAsync();
    if (!perm.granted) return "";
  } catch {
    return "";
  }
  return new Promise<string>((resolve) => {
    let text = "";
    const subs: { remove(): void }[] = [];
    const done = () => {
      clearTimeout(timer);
      subs.forEach((s) => s.remove());
      resolve(text.trim());
    };
    const timer = setTimeout(() => {
      try {
        m.abort();
      } catch {}
      done();
    }, timeoutMs);
    subs.push(
      m.addListener("result", (e) => {
        if (e.results[0]?.transcript) text = e.results[0].transcript;
      }),
      m.addListener("error", done),
      m.addListener("end", done),
    );
    try {
      m.start({ lang: LOCALES[language] ?? "en-IN", interimResults: false, continuous: true, addsPunctuation: true, audioSource: { uri } });
    } catch {
      done();
    }
  });
}
