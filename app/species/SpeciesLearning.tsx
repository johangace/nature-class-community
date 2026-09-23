"use client";

import { useEffect, useRef, useState } from "react";
import type { SourcedSpeciesLearning } from "@/lib/cast/species-learning";
import styles from "./species-learning.module.css";

/** The same child view in a profile, a runner picture and a possible photo match.
 * A supplied null can be retried; undefined loads on demand when mounted. */
export function SpeciesLearning({ commonName, scientificName, initial }: {
  commonName: string;
  scientificName: string | null;
  initial?: SourcedSpeciesLearning | null;
}) {
  const [result, setResult] = useState(initial ?? null);
  const [state, setState] = useState(initial === undefined ? "loading" : "ready");
  const [attempt, setAttempt] = useState(0);
  const [canSpeak, setCanSpeak] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState(false);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setCanSpeak("speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
    return () => {
      if (utterance.current) {
        utterance.current.onend = null;
        utterance.current.onerror = null;
        window.speechSynthesis?.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (initial !== undefined && attempt === 0) return;
    setState("loading");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let active = true;
    void fetch("/api/species-learning", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commonName, scientificName }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) {
        if (active) setState(response.status === 401 ? "signed-out" : "unavailable");
        return;
      }
      const data = await response.json() as { result?: SourcedSpeciesLearning | null };
      if (active) { setResult(data.result ?? null); setState("ready"); }
    }).catch(() => { if (active) setState("unavailable"); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [commonName, scientificName, initial, attempt]);

  function listen() {
    if (!result || !canSpeak) return;
    if (speaking) {
      if (utterance.current) { utterance.current.onend = null; utterance.current.onerror = null; }
      window.speechSynthesis.cancel();
      utterance.current = null;
      setSpeaking(false);
      return;
    }
    setSpeechError(false);
    const { introduction, lookFor, question } = result.learning;
    try {
    const voice = new SpeechSynthesisUtterance(`${commonName}. ${introduction} ${lookFor} ${question}`);
    voice.lang = document.documentElement.lang || "en";
    voice.rate = 0.9;
    voice.onend = () => { utterance.current = null; setSpeaking(false); };
    voice.onerror = () => { utterance.current = null; setSpeaking(false); setSpeechError(true); };
    utterance.current = voice;
    setSpeaking(true);
    window.speechSynthesis.speak(voice);
    } catch {
      utterance.current = null;
      setSpeaking(false);
      setSpeechError(true);
    }
  }

  return (
    <section className={styles.learning} aria-label={`Explore ${commonName}`}>
      {result ? <>
        <p className={styles.introduction}>{result.learning.introduction}</p>
        <div className={styles.prompt}><h2 className={styles.label}>Look closely</h2><p>{result.learning.lookFor}</p></div>
        <div className={styles.prompt}><h2 className={styles.label}>Wonder together</h2><p>{result.learning.question}</p></div>
        {canSpeak && <button className={styles.listen} type="button" aria-pressed={speaking} onClick={listen}>
          {speaking ? "Stop reading" : "Listen"}
        </button>}
        {speechError && <p role="status">Reading aloud is unavailable. You can read the words together.</p>}
        <details className={styles.source}><summary>Source</summary>
          <p>Adapted from <a href={result.source.url} target="_blank" rel="noreferrer noopener">{result.source.title}</a> on Wikipedia, CC BY-SA.</p>
        </details>
      </> : <>
        <p className={styles.label}>Look closely</p>
        <p>What colours, shapes or patterns can you find in the picture?</p>
        <div className={styles.recovery}>
          <p role="status">{state === "loading"
            ? "Finding a little more about this species…"
            : state === "signed-out" ? "Sign in to explore this species together."
            : "The introduction couldn’t load. Try again in a moment."}</p>
          {state === "signed-out"
            ? <a className={styles.listen} href="/sign-in">Sign in</a>
            : state !== "loading" && <button className={styles.listen} type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>}
        </div>
      </>}
    </section>
  );
}
