import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { loadWords, loadDefinitions, pickAnswer, toUpper, toLower } from "./words";
import { score, keyStates, satisfiesHardMode, WORD_LENGTH } from "./game";
import { useHint } from "./hint";
import {
  Keyboard, Legend, HintPanel, HintChooser, ResultDialog, StatTiles, Countdown, Toast,
} from "./components";

const STATS_KEY = "reactWordleStats";
const EMPTY_STATS = { played: 0, wins: 0, streak: 0 };

const TOAST_MS = 1900;
const SHAKE_MS = 460;
const RESULT_DELAY_MS = 1450; // kutuların çevrilme animasyonu bitsin diye

function readStats() {
  try {
    const raw = window.localStorage.getItem(STATS_KEY);
    return raw ? { ...EMPTY_STATS, ...JSON.parse(raw) } : EMPTY_STATS;
  } catch {
    return EMPTY_STATS;
  }
}

function writeStats(stats) {
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // özel sekmede yazılamaz; istatistik kaybı oyunu durdurmasın
  }
}

export default function Wordle({
  LANG, lang, difficulty, maxGuesses = 6, hardMode = false, keyboardHints = true,
  onLanguage, onExit,
}) {
  const ui = LANG.ui;
  const max = Math.max(4, Math.min(8, maxGuesses));

  const [words, setWords] = useState(null);
  const [definitions, setDefinitions] = useState({});
  const [loadError, setLoadError] = useState(false);

  const [answer, setAnswer] = useState("");
  const [guesses, setGuesses] = useState([]);
  const [current, setCurrent] = useState("");
  const [status, setStatus] = useState("playing");

  const [toast, setToast] = useState("");
  const [shake, setShake] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [stats, setStats] = useState(EMPTY_STATS);

  const toastTimer = useRef(null);
  const shakeTimer = useRef(null);
  const resultTimer = useRef(null);

  const flash = useCallback((message) => {
    clearTimeout(toastTimer.current);
    clearTimeout(shakeTimer.current);
    setToast(message);
    setShake(true);
    toastTimer.current = setTimeout(() => setToast(""), TOAST_MS);
    shakeTimer.current = setTimeout(() => setShake(false), SHAKE_MS);
  }, []);

  const finish = useCallback(
    (won) => {
      setStatus(won ? "won" : "lost");
      // StrictMode updater'ı iki kez çağırdığı için istatistik updater içinde
      // hesaplanmıyor; yoksa her oyun iki kez sayılır.
      const next = {
        played: stats.played + 1,
        wins: stats.wins + (won ? 1 : 0),
        streak: won ? stats.streak + 1 : 0,
      };
      setStats(next);
      writeStats(next);
      clearTimeout(resultTimer.current);
      resultTimer.current = setTimeout(() => setResultOpen(true), RESULT_DELAY_MS);
    },
    [stats]
  );

  // Önceki tahminlerde yeşile dönmüş konumlar — harf ipucu bunları atlar.
  const revealedAt = useMemo(() => {
    const set = new Set();
    for (const guess of guesses) {
      score(guess, answer).forEach((s, i) => {
        if (s === "correct") set.add(i);
      });
    }
    return set;
  }, [guesses, answer]);

  const hint = useHint({
    budget: max,
    used: guesses.length,
    playing: status === "playing",
    answer,
    definitions,
    locale: lang,
    revealedAt,
    onTimeout: () => finish(false),
  });

  const effectiveMax = max - hint.burned;
  const resetHint = hint.reset;

  useEffect(() => {
    setStats(readStats());
    return () => {
      clearTimeout(toastTimer.current);
      clearTimeout(shakeTimer.current);
      clearTimeout(resultTimer.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setWords(null);
    setLoadError(false);

    Promise.all([
      loadWords(lang, WORD_LENGTH),
      loadDefinitions(lang, WORD_LENGTH),
    ])
      .then(([loaded, defs]) => {
        if (cancelled) return;
        setWords(loaded);
        setDefinitions(defs);
        setAnswer(pickAnswer(loaded, difficulty) ?? "");
        setGuesses([]);
        setCurrent("");
        setStatus("playing");
        setResultOpen(false);
        resetHint();
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("failed to load word list:", err);
        setLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [lang, difficulty, resetHint]);

  const newGame = useCallback(() => {
    if (!words) return;
    clearTimeout(resultTimer.current);
    setAnswer(pickAnswer(words, difficulty) ?? "");
    setGuesses([]);
    setCurrent("");
    setStatus("playing");
    setResultOpen(false);
    setToast("");
    resetHint();
  }, [words, difficulty, resetHint]);

  const type = useCallback(
    (letter) => {
      if (status !== "playing") return;
      setCurrent((prev) =>
        Array.from(prev).length >= WORD_LENGTH ? prev : prev + letter
      );
    },
    [status]
  );

  const back = useCallback(() => {
    if (status !== "playing") return;
    setCurrent((prev) => Array.from(prev).slice(0, -1).join(""));
  }, [status]);

  const submit = useCallback(() => {
    if (status !== "playing" || !words) return;
    const S = LANG.strings;

    if (Array.from(current).length < WORD_LENGTH) return flash(S.TOO_SHORT);
    if (!words.guesses.has(current)) return flash(S.NOT_A_WORD);
    if (hardMode && !satisfiesHardMode(current, guesses, answer)) return flash(S.HARD);

    const next = [...guesses, current];
    const won = current === answer;
    const lost = !won && next.length >= effectiveMax;

    setGuesses(next);
    setCurrent("");
    hint.clearDeadline();

    if (won || lost) finish(won);
    if (won) flash(S.VICTORY);
  }, [
    status, words, LANG, current, guesses, answer,
    hardMode, effectiveMax, flash, finish, hint,
  ]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && hint.chooserOpen) return hint.close();
      if (e.key === "Enter") {
        e.preventDefault();
        return submit();
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        return back();
      }
      if (Array.from(e.key).length !== 1) return;
      const ch = toLower(e.key, lang);
      if (LANG.alphabet.includes(ch)) {
        e.preventDefault();
        type(ch);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lang, LANG, submit, back, type, hint]);

  const letterStates = useMemo(
    () => (keyboardHints ? keyStates(guesses, answer) : {}),
    [keyboardHints, guesses, answer]
  );

  if (loadError) return <div className="toast">{LANG.strings.LOAD_FAILED}</div>;
  if (!words || !answer) return <div className="toast">{LANG.strings.LOADING}</div>;

  const turns = guesses.length;

  return (
    <div className="game">
      <aside className="sidebar">
        <div>
          <h3 className="brand">React Wordle</h3>
          <div className="brand-sub">
            {LANG.name} · {ui.dict.replace("WORDS", words.guesses.size)}
          </div>
        </div>

        <div className="card guess-card">
          <div className="card-kicker">{ui.guess}</div>
          <div className="guess-count">
            {Math.min(turns + (status === "playing" ? 1 : 0), effectiveMax)} / {effectiveMax}
          </div>
          <div className="progress">
            {Array.from({ length: max }, (_, i) => {
              const state = i < turns ? "is-used" : i >= effectiveMax ? "is-burned" : "";
              return <div key={i} className={`progress-seg ${state}`.trim()} />;
            })}
          </div>
        </div>

        <StatTiles ui={ui} stats={stats} />
        <Legend ui={ui} size="sm" />

        <div className="sidebar-actions">
          <button
            type="button"
            className="btn btn-secondary hint-btn"
            onClick={hint.open}
            disabled={!hint.canTake}
          >
            {hint.hint ? ui.hintUsed : ui.hint}
          </button>
          <button type="button" className="btn btn-secondary" onClick={newGame}>
            {ui.newWord}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onExit}>
            {ui.close}
          </button>
        </div>
      </aside>

      <div className="board-area">
        {hint.hint && (
          <HintPanel LANG={LANG} lang={lang} hint={hint.hint} length={WORD_LENGTH} />
        )}
        {hint.secondsLeft !== null && <Countdown ui={ui} seconds={hint.secondsLeft} />}

        <Board
          lang={lang}
          max={max}
          effectiveMax={effectiveMax}
          answer={answer}
          guesses={guesses}
          current={current}
          status={status}
          shake={shake}
        />

        <Keyboard
          LANG={LANG}
          lang={lang}
          letterStates={letterStates}
          onKey={type}
          onEnter={submit}
          onBackspace={back}
        />
      </div>

      {toast && <Toast message={toast} />}

      {hint.chooserOpen && (
        <HintChooser
          LANG={LANG}
          remaining={hint.remaining}
          hasMeanings={Object.keys(definitions).length > 0}
          onPick={hint.take}
          onClose={hint.close}
        />
      )}

      {resultOpen && (
        <ResultDialog
          LANG={LANG}
          lang={lang}
          answer={answer}
          meanings={definitions[answer]}
          kicker={status === "won" ? ui.wonKicker : ui.lostKicker}
          title={status === "won" ? LANG.strings.VICTORY : LANG.strings.NO_MORE_GUESSES}
          body={
            status === "won"
              ? ui.wonBody
                  .replace("TURNS", turns)
                  .replace("MAX", effectiveMax)
                  .replace("STREAK", stats.streak)
              : ui.lostBody
          }
          onClose={() => setResultOpen(false)}
          onAgain={() => {
            setResultOpen(false);
            newGame();
          }}
        />
      )}
    </div>
  );
}

function Board({ lang, max, effectiveMax, answer, guesses, current, status, shake }) {
  return (
    <div className="board">
      {Array.from({ length: max }, (_, row) => {
        const burned = row >= effectiveMax; // ipucuna verilen satırlar
        const guess = guesses[row];
        const isCurrent = row === guesses.length && status === "playing" && !burned;
        const revealed = guess ? score(guess, answer) : null;
        const letters = Array.from(guess ?? (isCurrent ? current : ""));

        return (
          <div
            className={`board-row${isCurrent && shake ? " is-shaking" : ""}${
              burned ? " is-burned" : ""
            }`}
            key={row}
          >
            {Array.from({ length: WORD_LENGTH }, (_, col) => {
              const ch = letters[col];

              if (revealed) {
                return (
                  <div
                    key={col}
                    className={`tile tile-${revealed[col]} tile-reveal`}
                    style={{ animationDelay: `${col * 130}ms` }}
                  >
                    {toUpper(ch, lang)}
                  </div>
                );
              }

              return (
                <div
                  // key'e harfi de katmak, aynı hücreye yeni harf gelince
                  // tilePop animasyonunun yeniden çalışmasını sağlıyor
                  key={`${col}-${ch ?? ""}`}
                  className={`tile ${ch ? "tile-filled tile-pop" : "tile-empty"}`}
                >
                  {ch ? toUpper(ch, lang) : ""}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
