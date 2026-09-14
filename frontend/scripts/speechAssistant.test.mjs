import assert from "node:assert/strict";
import test from "node:test";

import {
  createSpeechRecognition,
  getRecognitionErrorMessage,
  isSpeechRecognitionSupported,
  normalizeTextForSpeech,
  speakText,
  stopSpeaking,
} from "../src/utils/speechAssistant.js";

test("speech recognition unsupported fallback remains available without crashing", () => {
  assert.equal(isSpeechRecognitionSupported({}), false);
  assert.equal(
    createSpeechRecognition({ browserWindow: {}, language: "en-IN" }),
    null
  );
});

test("recognized browser speech is delivered as an editable transcript", () => {
  let transcript = "";

  class FakeRecognition {
    start() {
      this.onstart?.();
      this.onresult?.({ results: [[{ transcript: "How do I use Crop Advisor?" }]] });
      this.onend?.();
    }
  }

  const recognition = createSpeechRecognition({
    browserWindow: { SpeechRecognition: FakeRecognition },
    language: "en-IN",
    onTranscript: (recognizedText) => {
      transcript = recognizedText;
    },
  });

  recognition.start();
  assert.equal(transcript, "How do I use Crop Advisor?");
  assert.equal(recognition.lang, "en-IN");
  assert.equal(recognition.interimResults, false);
});

test("permission and no-speech failures return typing-friendly messages", () => {
  assert.match(getRecognitionErrorMessage("not-allowed"), /permission/i);
  assert.match(getRecognitionErrorMessage("not-allowed"), /continue typing/i);
  assert.match(getRecognitionErrorMessage("no-speech"), /No speech/i);
});

test("speech output removes obvious Markdown and raw URLs", () => {
  const normalized = normalizeTextForSpeech(
    "## Result\n- **Crop Advisor**: [Open it](http://localhost:5173/test)"
  );

  assert.equal(normalized, "Result Crop Advisor: Open it");
});

test("speech synthesis starts and can be stopped", () => {
  let spokenText = "";
  let cancelCount = 0;
  let started = false;

  class FakeUtterance {
    constructor(text) {
      this.text = text;
    }
  }

  const speechSynthesis = {
    getVoices: () => [{ lang: "en-IN", name: "Test English" }],
    cancel: () => {
      cancelCount += 1;
    },
    speak: (utterance) => {
      spokenText = utterance.text;
      utterance.onstart?.();
    },
  };
  const browserWindow = {
    SpeechSynthesisUtterance: FakeUtterance,
    speechSynthesis,
  };

  const result = speakText({
    browserWindow,
    text: "**AgroSphere** response",
    language: "en-IN",
    languageLabel: "English (India)",
    onStart: () => {
      started = true;
    },
  });

  assert.equal(result.success, true);
  assert.equal(spokenText, "AgroSphere response");
  assert.equal(started, true);
  assert.equal(cancelCount, 1);

  stopSpeaking(browserWindow);
  assert.equal(cancelCount, 2);
});
