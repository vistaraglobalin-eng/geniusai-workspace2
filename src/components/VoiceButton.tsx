"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { CLIENT_TEXT, isLang, localeOf, type Lang } from "@/lib/i18n";
import { track } from "@/lib/analytics";

// Minimal typing for the browser's Web Speech API (Safari and Chrome ship it prefixed).
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Adds dictated text to what's already typed, with a space between. */
export function appendSpoken(current: string, spoken: string): string {
  const s = spoken.trim();
  if (!s) return current;
  if (!current.trim()) return s;
  return /\s$/.test(current) ? current + s : `${current} ${s}`;
}

function pageLang(): Lang {
  const l = typeof document !== "undefined" ? document.documentElement.lang : "en";
  return isLang(l) ? l : "en";
}

/**
 * Mic button for any text box: tap, speak, tap again (or pause) to stop. Text goes to onText.
 * Dictates in the interface language (English is recognised as Indian English). Hidden in
 * browsers without speech recognition. Audio is handled by the browser (Apple or Google), not
 * sent to GeniusAI.
 */
export function VoiceButton({ onText, disabled, className = "" }: { onText: (text: string) => void; disabled?: boolean; className?: string }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => { onTextRef.current = onText; });

  useEffect(() => {
    setSupported(Boolean(recognitionCtor()));
    return () => rec.current?.abort();
  }, []);

  if (!supported) return null;
  const text = CLIENT_TEXT[pageLang()];

  function start() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setError(null); setInterim("");
    const r = new Ctor();
    const lang = pageLang();
    r.lang = localeOf(lang);
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) onTextRef.current(res[0].transcript);
        else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setError(text.voiceDenied);
      else if (e.error !== "no-speech" && e.error !== "aborted") setError(text.noVoice);
    };
    r.onend = () => { setListening(false); setInterim(""); rec.current = null; };
    try {
      r.start();
      rec.current = r;
      setListening(true);
      track("voice_input_used", { lang });
    } catch {
      setError(text.noVoice);
    }
  }

  function stop() {
    rec.current?.stop();
  }

  return (
    <span className={`voice-wrap ${className}`}>
      <button type="button" className={`voice-btn${listening ? " on" : ""}`} onClick={listening ? stop : start} disabled={disabled && !listening}
        aria-pressed={listening} aria-label={listening ? text.listening : text.speak} title={listening ? text.listening : text.speak}>
        {listening ? <Square size={14} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
      </button>
      {(listening || error) && (
        <span className={`voice-status${error ? " error" : ""}`} role={error ? "alert" : "status"} aria-live="polite">
          {error ?? (interim || text.listening)}
        </span>
      )}
    </span>
  );
}
