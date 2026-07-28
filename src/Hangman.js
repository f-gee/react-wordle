import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  loadWords, loadDefinitions, pickAnswer, toUpper, toLower, normalizeKey,
} from "./words";
import { useHint } from "./hint";
import { HangmanScene } from "./HangmanScene";
import {
  Keyboard, HintPanel, HintChooser, ResultDialog, StatTiles, Countdown, Toast,
} from "./components";

const STATS_KEY = "reactHangmanStats";
const EMPTY_STATS = { played: 0, wins: 0, streak: 0 };
const EMPTY_SET = new Set();

/** Kademe sayısı — 3B sahnedeki beliriş de buna göre bölünüyor. */
const STAGES = 6;

const TOAST_MS = 1900;
const RESULT_DELAY_MS = 900;

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

/**
 * Adam Asmaca.
 *
 * Wordle'dan farkı harf harf tahmin: doğru harf kelimede geçtiği her yerde
 * açılır, yanlış harf tehlikeyi bir kademe ilerletir. İpucu kuralları iki
 * oyunda da aynı (bkz. src/hint.js) — sadece burada hak yerine kademe yanıyor.
 */
export default function Hangman({ LANG, lang, length, difficulty, onExit }) {
  const ui = LANG.ui;

  const [words, setWords] = useState(null);
  const [definitions, setDefinitions] = useState({});
  const [loadError, setLoadError] = useState(false);

  const [answer, setAnswer] = useState("");
  const [guessed, setGuessed] = useState(EMPTY_SET); // denenen harfler
  const [status, setStatus] = useState("playing");
  const [toast, setToast] = useState("");
  const [resultOpen, setResultOpen] = useState(false);
  const [stats, setStats] = useState(EMPTY_STATS);

  const toastTimer = useRef(null);
  const resultTimer = useRef(null);

  const letters = useMemo(() => Array.from(answer), [answer]);
  const wrong = useMemo(
    () => [...guessed].filter((ch) => !letters.includes(ch)),
    [guessed, letters]
  );

  const flash = useCallback((message) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), TOAST_MS);
  }, []);

  const finish = useCallback(
    (won) => {
      setStatus(won ? "won" : "lost");
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

  // Zaten açılmış harflerin konumları — harf ipucu bunları atlasın diye.
  const revealedAt = useMemo(() => {
    const set = new Set();
    letters.forEach((ch, i) => {
      if (guessed.has(ch)) set.add(i);
    });
    return set;
  }, [letters, guessed]);

  const hint = useHint({
    budget: STAGES,
    used: wrong.length,
    playing: status === "playing",
    answer,
    definitions,
    locale: lang,
    revealedAt,
    onTimeout: () => finish(false),
  });

  // İpucu kademe yakıyor: kalan yanlış hakkı buna göre azalıyor.
  const maxWrong = STAGES - hint.burned;
  const stage = Math.min(STAGES, wrong.length + hint.burned);
  const remaining = hint.remaining;
  const { clearDeadline, reset: resetHint } = hint;

  useEffect(() => {
    setStats(readStats());
    return () => {
      clearTimeout(toastTimer.current);
      clearTimeout(resultTimer.current);
    };
  }, []);

  const newGame = useCallback(
    (loaded) => {
      const source = loaded ?? words;
      if (!source) return;
      clearTimeout(resultTimer.current);
      setAnswer(pickAnswer(source, difficulty) ?? "");
      setGuessed(new Set());
      setStatus("playing");
      setResultOpen(false);
      setToast("");
      resetHint();
    },
    [words, difficulty, resetHint]
  );

  useEffect(() => {
    let cancelled = false;
    setWords(null);
    setLoadError(false);

    Promise.all([loadWords(lang, length), loadDefinitions(lang, length)])
      .then(([loaded, defs]) => {
        if (cancelled) return;
        setWords(loaded);
        setDefinitions(defs);
        setAnswer(pickAnswer(loaded, difficulty) ?? "");
        setGuessed(new Set());
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
  }, [lang, length, difficulty, resetHint]);

  /**
   * Fonksiyonel güncelleme şart: hızlı ardışık tuşlar aynı render'da
   * toplanırsa doğrudan atama birbirini ezer ve sadece son harf kalır.
   * Kazanma/kaybetme kararı bu yüzden burada değil, aşağıdaki efektte.
   */
  const guess = useCallback(
    (letter) => {
      if (status !== "playing" || !answer) return;
      setGuessed((prev) => {
        if (prev.has(letter)) return prev;
        // Hak dolduysa yeni harf alma. Bu kontrol updater'ın içinde olmalı:
        // aynı render'da toplanan tuşlarda dışarıdaki `status` henüz
        // güncellenmemiş oluyor ve sayaç sınırı aşabiliyor.
        const wrongSoFar = [...prev].filter((ch) => !letters.includes(ch)).length;
        if (wrongSoFar >= maxWrong) return prev;

        const next = new Set(prev);
        next.add(letter);
        return next;
      });
      clearDeadline();
    },
    [status, answer, letters, maxWrong, clearDeadline]
  );

  // İpucu bir harf açtıysa o harfi denenmiş sayarız — kelimede görünür olur.
  const previousHint = useRef(null);
  useEffect(() => {
    if (!hint.hint || hint.hint === previousHint.current) return;
    previousHint.current = hint.hint;
    if (hint.hint.kind !== "letter") return;

    setGuessed((prev) => {
      const next = new Set(prev);
      next.add(hint.hint.letter);
      return next;
    });
  }, [hint.hint]);

  /**
   * Oyun sonu tek yerden karar veriliyor: harfle de olsa ipucuyla da olsa
   * kelime tamamlandıysa kazanıldı, yanlışlar hakkı doldurduysa kaybedildi.
   */
  useEffect(() => {
    if (status !== "playing" || !answer || !letters.length) return;

    if (letters.every((ch) => guessed.has(ch))) {
      finish(true);
      flash(LANG.strings.VICTORY);
      return;
    }
    if (wrong.length >= maxWrong) finish(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guessed, letters, answer, status, wrong.length, maxWrong]);

  // Fiziksel klavye
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && hint.chooserOpen) return hint.close();
      const key = normalizeKey(e.key);
      if (Array.from(key).length !== 1) return;
      const ch = toLower(key, lang);
      if (LANG.alphabet.includes(ch)) {
        e.preventDefault();
        guess(ch);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lang, LANG, guess, hint]);

  const letterStates = useMemo(() => {
    const map = {};
    for (const ch of guessed) map[ch] = letters.includes(ch) ? "correct" : "absent";
    return map;
  }, [guessed, letters]);

  // Yükleme sırasında erken return YOK: bileşen sökülürse 3B sahne de sökülür,
  // WebGL bağlamı ve fizik dünyası baştan kurulur. Yükleme durumu bunun yerine
  // üstte bir bildirim olarak gösteriliyor.
  const loading = !words || !answer;

  return (
    <div className="game">
      <aside className="sidebar">
        <div>
          <h3 className="brand">{ui.gameHangman}</h3>
          <div className="brand-sub">
            {LANG.name} · {ui.letters.replace("N", length)} ·{" "}
            {ui.dict.replace("WORDS", words ? words.answers.length : 0)}
          </div>
        </div>

        <div className="card guess-card">
          <div className="card-kicker">{ui.wrongLabel}</div>
          <div className="guess-count">
            {wrong.length} / {maxWrong}
          </div>
          <div className="progress">
            {Array.from({ length: STAGES }, (_, i) => {
              const state =
                i < wrong.length ? "is-used" : i >= maxWrong ? "is-burned" : "";
              return <div key={i} className={`progress-seg ${state}`.trim()} />;
            })}
          </div>
        </div>

        <StatTiles ui={ui} stats={stats} />

        <div className="sidebar-actions">
          <button
            type="button"
            className="btn btn-secondary hint-btn"
            onClick={hint.open}
            disabled={!hint.canTake || remaining <= 1}
          >
            {hint.hint ? ui.hintUsed : ui.hint}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => newGame()}>
            {ui.newWord}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onExit}>
            {ui.close}
          </button>
        </div>
      </aside>

      <div className="board-area">
        {/* Kazanınca kopanlar yerine dönmüyor — yeni oyunda stage 0'a inince
            hepsi toparlanıyor. Havada duran uzvun geri zıplaması tuhaf olurdu. */}
        <HangmanScene stage={stage} active={status === "playing"} />

        {hint.hint && (
          <HintPanel LANG={LANG} lang={lang} hint={hint.hint} length={length} />
        )}
        {hint.secondsLeft !== null && (
          <Countdown ui={ui} seconds={hint.secondsLeft} />
        )}

        <div className="word-slots">
          {letters.map((ch, i) => {
            const shown = guessed.has(ch) || status !== "playing";
            return (
              <span
                key={i}
                className={`word-slot${shown ? " is-open" : ""}${
                  !guessed.has(ch) && status === "lost" ? " is-missed" : ""
                }`}
              >
                {shown ? toUpper(ch, lang) : ""}
              </span>
            );
          })}
        </div>

        <Keyboard
          LANG={LANG}
          lang={lang}
          letterStates={letterStates}
          onKey={guess}
          actions={false}
          lockUsed
        />
      </div>

      {toast && <Toast message={toast} />}
      {!toast && (loading || loadError) && (
        <Toast
          message={loadError ? LANG.strings.LOAD_FAILED : LANG.strings.LOADING}
        />
      )}

      {hint.chooserOpen && (
        <HintChooser
          LANG={LANG}
          remaining={remaining}
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
              ? ui.hangmanWonBody
                  .replace("WRONG", wrong.length)
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
