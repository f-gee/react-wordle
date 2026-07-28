import { useState } from "react";
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
    <div>
      <h1>React Wordle</h1>
      <button onClick={onStart}>Start Game</button>
    </div>
  );
}

function GameScene() {
  const [letters, setLetters] = useState(Array(6).fill(""));

  const handleChange = (index, value) => {
    const updated = [...letters];
    updated[index] = value.slice(0, 1).toUpperCase(); // one letter per box
    setLetters(updated);
  };

  return (
    <div>
      <h1>Guess the word</h1>
      <div style={{ display: "flex", gap: "8px" }}>
        {letters.map((letter, i) => (
          <input
            key={i}
            type="text"
            maxLength={1}
            value={letter}
            onChange={(e) => handleChange(i, e.target.value)}
            style={{
              width: "40px",
              height: "40px",
              textAlign: "center",
              fontSize: "24px",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default App;