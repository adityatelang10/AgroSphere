export const VOICE_LANGUAGE_OPTIONS = [
  { value: "en-IN", label: "English (India)" },
  { value: "hi-IN", label: "Hindi" },
  { value: "kn-IN", label: "Kannada" },
];

const RECOGNITION_ERROR_MESSAGES = {
  "not-allowed":
    "Microphone permission was not granted. You can continue typing.",
  "service-not-allowed":
    "Microphone permission was not granted. You can continue typing.",
  "audio-capture":
    "No working microphone was found. You can continue typing.",
  "no-speech": "No speech was detected. Please try again or type your question.",
  network:
    "Voice recognition could not reach its browser service. You can continue typing.",
  aborted: "Voice input stopped. You can continue typing.",
};

export const getSpeechRecognitionConstructor = (browserWindow) =>
  browserWindow?.SpeechRecognition || browserWindow?.webkitSpeechRecognition;

export const isSpeechRecognitionSupported = (browserWindow) =>
  Boolean(getSpeechRecognitionConstructor(browserWindow));

export const isSpeechSynthesisSupported = (browserWindow) =>
  Boolean(
    browserWindow?.speechSynthesis && browserWindow?.SpeechSynthesisUtterance
  );

export const getRecognitionErrorMessage = (errorCode) =>
  RECOGNITION_ERROR_MESSAGES[errorCode] ||
  "Voice input could not be completed. Please try again or type your question.";

export const createSpeechRecognition = ({
  browserWindow,
  language,
  onStart,
  onTranscript,
  onError,
  onEnd,
}) => {
  const SpeechRecognition = getSpeechRecognitionConstructor(browserWindow);

  if (!SpeechRecognition) {
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = language;
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => onStart?.();
  recognition.onresult = (event) => {
    const transcript = Array.from(event.results || [])
      .map((result) => result?.[0]?.transcript || "")
      .join(" ")
      .trim();

    if (transcript) {
      onTranscript?.(transcript);
    }
  };
  recognition.onerror = (event) => {
    onError?.(getRecognitionErrorMessage(event.error), event.error);
  };
  recognition.onend = () => onEnd?.();

  return recognition;
};

export const normalizeTextForSpeech = (text, maxCharacters = 2000) =>
  String(text || "")
    .replace(/```[\s\S]*?```/g, " Code example omitted. ")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "link")
    .replace(/(^|\n)\s{0,3}#{1,6}\s+/g, "$1")
    .replace(/(^|\n)\s*[-*+]\s+/g, "$1")
    .replace(/(^|\n)\s*\d+\.\s+/g, "$1")
    .replace(/[*_~`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxCharacters);

const findVoiceForLanguage = (speechSynthesis, language) => {
  const voices = speechSynthesis.getVoices?.() || [];
  const normalizedLanguage = language.toLowerCase();
  const languagePrefix = normalizedLanguage.split("-")[0];

  return {
    hasLoadedVoices: voices.length > 0,
    voice:
      voices.find((candidate) => candidate.lang?.toLowerCase() === normalizedLanguage) ||
      voices.find((candidate) =>
        candidate.lang?.toLowerCase().startsWith(`${languagePrefix}-`)
      ) ||
      null,
  };
};

export const speakText = ({
  browserWindow,
  text,
  language,
  languageLabel,
  onStart,
  onEnd,
  onError,
}) => {
  if (!isSpeechSynthesisSupported(browserWindow)) {
    return {
      success: false,
      message:
        "Read aloud is not supported in this browser. The text response is still available.",
    };
  }

  const spokenText = normalizeTextForSpeech(text);
  if (!spokenText) {
    return { success: false, message: "There is no response text to read aloud." };
  }

  const synthesis = browserWindow.speechSynthesis;
  const { hasLoadedVoices, voice } = findVoiceForLanguage(synthesis, language);

  if (hasLoadedVoices && !voice) {
    return {
      success: false,
      message: `${languageLabel} voice is not available in this browser.`,
    };
  }

  const utterance = new browserWindow.SpeechSynthesisUtterance(spokenText);
  utterance.lang = language;
  if (voice) {
    utterance.voice = voice;
  }
  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = () =>
    onError?.("The browser could not read this response aloud.");

  synthesis.cancel();
  synthesis.speak(utterance);

  return { success: true, utterance };
};

export const stopSpeaking = (browserWindow) => {
  browserWindow?.speechSynthesis?.cancel?.();
};
