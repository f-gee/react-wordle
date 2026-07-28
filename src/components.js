import { LANGUAGES } from "./languages";
import { toUpper } from "./words";
import { HINT_COSTS, HINT_PRESSURE_AT } from "./hint";

/* İki oyunun da kullandığı parçalar. */

export function LanguagePicker({ lang, onLanguage, className = "" }) {
  return (
    <div className={`seg ${className}`.trim()}>
      {Object.entries(LANGUAGES).map(([code, entry]) => (
        <label className="seg-opt" key={code}>
          <input
            type="radio"
            name="language"
            value={code}
            checked={code === lang}
            onChange={() => onLanguage(code)}
          />
          {entry.name}
        </label>
      ))}
    </div>
  );
}

/** Genel amaçlı seçim şeridi: oyun seçimi, kelime uzunluğu vb. */
export function Segmented({ name, value, options, onChange, className = "" }) {
  return (
    <div className={`seg ${className}`.trim()}>
      {options.map((option) => (
        <label className="seg-opt" key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

export function Legend({ ui, size }) {
  const items = [
    ["correct", ui.right],
    ["present", ui.near],
    ["absent", ui.none],
  ];

  return (
    <div className={`legend legend-${size}`}>
      {items.map(([state, label]) => (
        <div className="legend-row" key={state}>
          <span className={`legend-swatch tile-${state}`} />
          <span className="legend-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Sanal klavye.
 *
 * Wordle'da Enter/⌫ var ve tuşlar kullanıldıktan sonra basılmaya devam eder.
 * Adam Asmaca'da harf başına tek hak olduğu için kullanılan tuş kilitlenir ve
 * eylem tuşları hiç gösterilmez.
 */
export function Keyboard({
  LANG, lang, letterStates, onKey, onEnter, onBackspace,
  actions = true, lockUsed = false,
}) {
  // Tuşlar odak almamalı: aksi hâlde fiziksel Enter, son tıklanan tuşu tetikler.
  const noFocus = (e) => e.preventDefault();

  return (
    <div className="keyboard">
      {LANG.keyboardLayout.map((rowStr, i) => {
        const isLastRow = i === LANG.keyboardLayout.length - 1;

        return (
          <div className="key-row" key={i}>
            {actions && isLastRow && (
              <button
                type="button"
                className="key key-action"
                onMouseDown={noFocus}
                onClick={onEnter}
              >
                {LANG.enter}
              </button>
            )}

            {Array.from(rowStr).map((ch) => {
              const state = letterStates[ch];
              return (
                <button
                  type="button"
                  key={ch}
                  className={`key${state ? ` key-${state}` : ""}`}
                  onMouseDown={noFocus}
                  onClick={() => onKey(ch)}
                  disabled={lockUsed && !!state}
                >
                  {toUpper(ch, lang)}
                </button>
              );
            })}

            {actions && isLastRow && (
              <button
                type="button"
                className="key key-action"
                onMouseDown={noFocus}
                onClick={onBackspace}
                aria-label="Backspace"
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

export function Toast({ message }) {
  return <div className="toast">{message}</div>;
}

export function Countdown({ ui, seconds }) {
  return <div className="countdown">{ui.hintTimed.replace("SECONDS", seconds)}</div>;
}

/** Alınan ipucunu gösterir: ya kırpılmış anlam ya da yerinde açılan harf. */
export function HintPanel({ LANG, lang, hint, length }) {
  const ui = LANG.ui;

  if (hint.kind === "meaning") {
    return (
      <div className="hint-panel">
        <div className="hint-label">{ui.meaning}</div>
        <div className="hint-text">{hint.text ?? ui.hintNoMeaning}</div>
      </div>
    );
  }

  return (
    <div className="hint-panel">
      <div className="hint-label">{ui.hintLetter}</div>
      <div className="hint-letters">
        {Array.from({ length }, (_, i) => (
          <span key={i} className={`hint-slot${i === hint.index ? " is-shown" : ""}`}>
            {i === hint.index ? toUpper(hint.letter, lang) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * @param hasMeanings  o dil için anlam dosyası üretilmiş mi. Üretilmemişse
 *                     (şu an İngilizce) anlam seçeneği hiç gösterilmez —
 *                     hak yakıp boş kutu göstermek yerine.
 */
export function HintChooser({ LANG, remaining, hasMeanings = true, onPick, onClose }) {
  const ui = LANG.ui;

  const options = [
    ...(hasMeanings
      ? [{ kind: "meaning", title: ui.hintMeaning, note: ui.hintMeaningNote }]
      : []),
    { kind: "letter", title: ui.hintLetter, note: ui.hintLetterNote },
  ];

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog hint-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-kicker">{ui.hint}</div>
        <div className="dialog-title">{ui.hintTitle}</div>

        {remaining <= HINT_PRESSURE_AT && <div className="hint-warn">{ui.hintWarn}</div>}

        <div className="hint-options">
          {options.map((option) => (
            <button
              type="button"
              key={option.kind}
              className="hint-option"
              onClick={() => onPick(option.kind)}
            >
              <span className="hint-option-head">
                <span className="hint-option-title">{option.title}</span>
                <span className="hint-option-cost">
                  {ui.hintCost.replace("COST", HINT_COSTS[option.kind])}
                </span>
              </span>
              <span className="hint-option-note">{option.note}</span>
            </button>
          ))}
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {ui.close}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Oyun sonu kutusu. Kelimenin anlamları burada tam hâliyle gösteriliyor —
 * oyun bittiği için gizlemeye gerek yok, öğretici kısım da bu.
 */
export function ResultDialog({
  LANG, lang, answer, meanings, kicker, title, body, onClose, onAgain,
}) {
  const ui = LANG.ui;

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog result-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-kicker">{kicker}</div>
        <div className="dialog-title">{title}</div>

        <div className="dialog-inset">
          <div className="dialog-inset-label">{ui.was}</div>
          <div className="dialog-answer">{toUpper(answer, lang)}</div>

          {meanings?.length > 0 && (
            <ol className="meaning-list">
              {meanings.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </ol>
          )}
        </div>

        <p className="dialog-body">{body}</p>

        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {ui.close}
          </button>
          <button type="button" className="btn btn-primary" onClick={onAgain}>
            {ui.again}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Basit istatistik üçlüsü; iki oyunda da aynı. */
export function StatTiles({ ui, stats }) {
  const winPct = stats.played
    ? `${Math.round((stats.wins / stats.played) * 100)}%`
    : "—";

  return (
    <div className="stats">
      {[
        { value: String(stats.played), label: ui.played },
        { value: winPct, label: ui.winPct },
        { value: String(stats.streak), label: ui.streak },
      ].map((stat) => (
        <div className="stat" key={stat.label}>
          <div className="stat-value">{stat.value}</div>
          <div className="stat-label">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
