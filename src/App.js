import { useState, useEffect } from "react";
import { LANGUAGES } from "./languages";
import { LanguagePicker, Segmented, Legend } from "./components";
import Wordle from "./Wordle";
import Hangman from "./Hangman";
import "./App.css";

/**
 * Başlangıç ekranındaki örnek tahta. Dil bağımsız olması bilerek: hangi dil
 * seçili olursa olsun aynı üç satır gösteriliyor.
 */
const DEMO_ROWS = [
  [["P", "absent"], ["L", "absent"], ["A", "present"], ["N", "absent"], ["T", "present"]],
  [["R", "correct"], ["E", "correct"], ["T", "present"], ["R", "absent"], ["O", "absent"]],
  [["R", "correct"], ["E", "correct"], ["A", "correct"], ["C", "correct"], ["T", "correct"]],
];

/** Adam Asmaca için üretilen uzunluklar (bkz. scripts/build-wordlists.mjs). */
const HANGMAN_LENGTHS = [6, 7, 8, 9];

/**
 * @param difficulty  cevap havuzu kademesi: "" (karışık) | "yaygin" | "orta" | "nis".
 *                    "nis" niş kelime oyunu demek.
 */
export default function App({
  language = "tr-TR",
  difficulty = "",
  maxGuesses = 6,
  hardMode = false,
  keyboardHints = true,
}) {
  const [screen, setScreen] = useState("start");
  const [lang, setLang] = useState(language);
  const [game, setGame] = useState("wordle");
  const [length, setLength] = useState(7);

  const LANG = LANGUAGES[lang];

  // Başlangıç ekranında Enter oyunu başlatır.
  useEffect(() => {
    if (screen !== "start") return;
    const onKeyDown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        setScreen("game");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [screen]);

  return (
    <div className="page">
      <div className="page-blob page-blob-top" aria-hidden="true" />
      <div className="page-blob page-blob-bottom" aria-hidden="true" />

      <div className="page-inner">
        {screen === "start" ? (
          <StartScreen
            LANG={LANG}
            lang={lang}
            game={game}
            length={length}
            maxGuesses={maxGuesses}
            onLanguage={setLang}
            onGame={setGame}
            onLength={setLength}
            onStart={() => setScreen("game")}
          />
        ) : game === "wordle" ? (
          <Wordle
            LANG={LANG}
            lang={lang}
            difficulty={difficulty}
            maxGuesses={maxGuesses}
            hardMode={hardMode}
            keyboardHints={keyboardHints}
            onExit={() => setScreen("start")}
          />
        ) : (
          <Hangman
            LANG={LANG}
            lang={lang}
            length={length}
            difficulty={difficulty}
            onExit={() => setScreen("start")}
          />
        )}
      </div>
    </div>
  );
}

function StartScreen({
  LANG, lang, game, length, maxGuesses, onLanguage, onGame, onLength, onStart,
}) {
  const ui = LANG.ui;
  const isHangman = game === "hangman";

  return (
    <div className="start">
      <div className="start-left">
        <span className="tag tag-accent-2">{ui.kicker}</span>
        <h1 className="hero-title">{ui.titleTop}</h1>
        <h1 className="hero-title hero-title-alt">
          {isHangman ? ui.gameHangman : ui.titleBottom}
        </h1>
        <p className="hero-tagline">
          {isHangman ? ui.hangmanHow : ui.tagline.replace("MAX", maxGuesses)}
        </p>
        <p className="hero-help">{isHangman ? ui.hangmanTagline ?? ui.how : ui.how}</p>

        <div className="field-label">{ui.game}</div>
        <Segmented
          name="game"
          value={game}
          onChange={onGame}
          options={[
            { value: "wordle", label: ui.gameWordle },
            { value: "hangman", label: ui.gameHangman },
          ]}
        />

        {isHangman && (
          <>
            <div className="field-label">{ui.wordLength}</div>
            <Segmented
              name="length"
              value={length}
              onChange={onLength}
              options={HANGMAN_LENGTHS.map((n) => ({ value: n, label: String(n) }))}
            />
          </>
        )}

        <div className="field-label">{ui.language}</div>
        <LanguagePicker lang={lang} onLanguage={onLanguage} />

        <div>
          <button type="button" className="btn btn-primary start-btn" onClick={onStart}>
            {ui.start}
          </button>
        </div>
      </div>

      <div className="start-right">
        <div className="demo-board">
          {DEMO_ROWS.map((row, r) => (
            <div className="demo-row" key={r}>
              {row.map(([ch, state], c) => (
                <div className={`tile demo-tile tile-${state}`} key={c}>
                  {ch}
                </div>
              ))}
            </div>
          ))}
        </div>
        <Legend ui={ui} size="lg" />
      </div>
    </div>
  );
}
