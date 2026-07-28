import { useState, useRef, useEffect } from "react";
import { LANGUAGES } from "./languages";
import "./App.css";

function App() {
  const [screen, setScreen] = useState("start");
  const [language, setLanguage] = useState("en-US");

  return (
    <div className="App">
      {screen === "start" ? (
        <StartScreen
          language={language}
          onLanguageChange={setLanguage}
          onStart={() => setScreen("game")}
        />
      ) : (
        <GameScene language={language} />
      )}
    </div>
  );
}

function StartScreen({ language, onLanguageChange, onStart }) {
  return (
    <div style={{ textAlign: "center", marginTop: "100px" }}>
      <h1>React Wordle</h1>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <select
          className="lang-select"
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
        >
          {Object.entries(LANGUAGES).map(([code, lang]) => (
            <option key={code} value={code}>
              {lang.name}
            </option>
          ))}
        </select>
        <button className="start-btn" onClick={onStart}>
          Start Game
        </button>
      </div>
    </div>
  );
}

const ROWS = 6;
const COLS = 5;

function GameScene({ language }) {
  const LANG = LANGUAGES[language];

  const [grid, setGrid] = useState(
    Array.from({ length: ROWS }, () => Array(COLS).fill(""))
  );
  const [active, setActive] = useState({ row: 0, col: 0 });
  const [wordList, setWordList] = useState([]);
  const [toast, setToast] = useState("");

  const inputRefs = useRef([]);
  const toastTimeoutRef = useRef(null);

  const showToast = (message) => {
    setToast(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(""), 2000);
  };

  useEffect(() => {
    const url = `${process.env.PUBLIC_URL}/wordlists/${language}.txt`;

    fetch(url)
      .then((res) => res.text())
      .then((text) => {
        const words = text
          .split("\n")
          .map((w) => w.trim().toLowerCase())
          .filter((w) => w.length > 0);
        setWordList(words);
      })
      .catch((err) => console.error("failed to load word list:", err));
  }, [language]);

  const focusBox = (row, col) => {
    setActive({ row, col });
    const el = inputRefs.current[row]?.[col];
    if (el) el.focus();
  };

  useEffect(() => {
    const handleDocMouseDown = (e) => {
      const activeEl = inputRefs.current[active.row]?.[active.col];
      if (!activeEl) return;

      if (e.target.closest("button") || e.target.closest("select")) return;

      if (e.target !== activeEl) {
        e.preventDefault();
        activeEl.focus();
      }
    };

    document.addEventListener("mousedown", handleDocMouseDown);
    return () => document.removeEventListener("mousedown", handleDocMouseDown);
  }, [active]);

  const setLetter = (row, col, letter) => {
    const updated = grid.map((r) => [...r]);
    updated[row][col] = letter;
    setGrid(updated);
  };

  const typeLetter = (letter) => {
    const { row, col } = active;
    setLetter(row, col, letter.toUpperCase());

    if (col < COLS - 1) {
      focusBox(row, col + 1);
    }
  };

  const handleBackspace = () => {
    const { row, col } = active;

    if (grid[row][col]) {
      setLetter(row, col, "");
    } else if (col > 0) {
      setLetter(row, col - 1, "");
      focusBox(row, col - 1);
    }
  };

  const handleEnter = () => {
    const { row } = active;
    const word = grid[row].join("");

    if (word.length < COLS) {
      return; // row not fully filled, ignore for now
    }

    if (!wordList.includes(word.toLowerCase())) {
      showToast(LANG.strings.NOT_A_WORD);
      return;
    }

    console.log("valid guess submitted:", word);
    // TODO: check against answer, advance to next row
  };

  const handleChange = (row, col, value) => {
    const letter = value.slice(0, 1);
    if (!letter) {
      handleBackspace();
      return;
    }
    setActive({ row, col });
    typeLetter(letter);
  };

  const handleKeyDown = (row, col, e) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      setActive({ row, col });
      handleBackspace();
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleEnter();
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      {toast && <div className="toast">{toast}</div>}

      <div style={{ display: "inline-block" }}>
        {grid.map((rowValues, row) => (
          <div
            key={row}
            style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "8px" }}
          >
            {rowValues.map((letter, col) => {
              const isActive = active.row === row && active.col === col;
              return (
                <input
                  key={col}
                  type="text"
                  maxLength={1}
                  value={letter}
                  onChange={(e) => handleChange(row, col, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(row, col, e)}
                  onFocus={() => setActive({ row, col })}
                  onMouseDown={(e) => {
                    if (!isActive) e.preventDefault();
                  }}
                  ref={(el) => {
                    if (!inputRefs.current[row]) inputRefs.current[row] = [];
                    inputRefs.current[row][col] = el;
                  }}
                  style={{
                    width: "40px",
                    height: "40px",
                    textAlign: "center",
                    fontSize: "24px",
                    cursor: "default",
                    caretColor: "transparent",
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      <VirtualKeyboard
        layout={LANG.keyboardLayout}
        onKeyPress={typeLetter}
        onEnter={handleEnter}
        onBackspace={handleBackspace}
      />
    </div>
  );
}

function VirtualKeyboard({ layout, onKeyPress, onEnter, onBackspace }) {
  return (
    <div style={{ marginTop: "30px" }}>
      {layout.map((rowStr, i) => {
        const isLastRow = i === layout.length - 1;
        return (
          <div
            key={i}
            style={{ display: "flex", justifyContent: "center", gap: "6px", marginBottom: "6px" }}
          >
            {isLastRow && (
              <button
                onClick={onEnter}
                style={{ padding: "10px 12px", fontSize: "16px", cursor: "pointer" }}
              >
                Enter
              </button>
            )}
            {rowStr.split("").map((key) => (
              <button
                key={key}
                onClick={() => onKeyPress(key)}
                style={{
                  padding: "10px 12px",
                  fontSize: "16px",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                {key}
              </button>
            ))}
            {isLastRow && (
              <button
                onClick={onBackspace}
                style={{ padding: "10px 12px", fontSize: "16px", cursor: "pointer" }}
              >
                ⌫
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default App;