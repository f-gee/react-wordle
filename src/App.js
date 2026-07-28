import { useState, useRef } from "react";
import { LANGUAGES } from "./languages";
import "./App.css";

function App() {
  const [screen, setScreen] = useState("start"); // "start" | "game"

  return (
    <div className="App">
      {screen === "start" ? (
        <StartScreen onStart={() => setScreen("game")} />
      ) : (
        <GameScene />
      )}
    </div>
  );
}

function StartScreen({ onStart }) {
  return (
    <div style={{ textAlign: "center", marginTop: "100px" }}>
      <h1>React Wordle</h1>
      <button onClick={onStart}>Start Game</button>
    </div>
  );
}

const ROWS = 6;
const COLS = 5;
const LANG = LANGUAGES["en-US"];

function GameScene() {
  const [grid, setGrid] = useState(
    Array.from({ length: ROWS }, () => Array(COLS).fill(""))
  );
  const [active, setActive] = useState({ row: 0, col: 0 });

  const inputRefs = useRef([]);

  const focusBox = (row, col) => {
    setActive({ row, col });
    const el = inputRefs.current[row]?.[col];
    if (el) el.focus();
  };

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
    console.log("submitted guess:", word);
    // TODO: validate word, check against answer, advance to next row
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
                    if (!isActive) e.preventDefault(); // block clicking into non-active boxes
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