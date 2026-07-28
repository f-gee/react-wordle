import { useState, useCallback, useEffect, useRef } from "react";
import { hintFromDefinitions } from "./words";

/**
 * İki oyunda da aynı ipucu kuralları geçerli — Wordle'da tahmin hakkı,
 * Adam Asmaca'da tehlike kademesi yakılıyor ama mantık aynı.
 *
 *   anlam  2 hak      harf  3 hak
 *   Oyuncuya her zaman en az 1 hak kalır: bedel gerekiyorsa kısılır.
 *   Kalan hak 3 veya altındayken ipucu alınırsa son hak 10 saniyeye bağlanır.
 */
export const HINT_COSTS = { meaning: 2, letter: 3 };
export const HINT_PRESSURE_AT = 3;
export const HINT_DEADLINE_MS = 10000;

/**
 * Kalan hak, yakılan bedeli de içerdiği için hook'un kendisi hesaplıyor:
 * çağıran taraf toplam bütçeyi ve oynanarak harcanan kısmı veriyor, aksi hâlde
 * "kalan hak -> ipucu bedeli -> kalan hak" döngüsü oluşuyor.
 *
 * @param budget       toplam hak (Wordle'da satır, Asmaca'da kademe sayısı)
 * @param used         oyuncunun oynayarak harcadığı hak
 * @param playing      oyun sürüyor mu
 * @param answer       gizli kelime (küçük harf)
 * @param definitions  kelime -> anlam dizisi
 * @param locale       "tr-TR" gibi; harf büyütme için
 * @param revealedAt   zaten bilinen harf konumları (harf ipucu bunları atlar)
 * @param onTimeout    süre dolunca çağrılır
 */
export function useHint({
  budget,
  used,
  playing,
  answer,
  definitions,
  locale,
  revealedAt,
  onTimeout,
}) {
  const [burned, setBurned] = useState(0);
  const [hint, setHint] = useState(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [deadline, setDeadline] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);

  // Süre dolduğunda çağrılacak fonksiyon her render değişebilir; efektin
  // sayacı sıfırlamaması için ref'te tutuluyor.
  const timeoutRef = useRef(onTimeout);
  timeoutRef.current = onTimeout;

  /** Tahmin yapıldı; süre baskısı biter. Kimliği sabit olmalı: çağıran
   *  bileşenlerin tuş işleyicileri buna bağımlı. */
  const clearDeadline = useCallback(() => setDeadline(null), []);

  const reset = useCallback(() => {
    setBurned(0);
    setHint(null);
    setChooserOpen(false);
    setDeadline(null);
    setSecondsLeft(null);
  }, []);

  const remaining = budget - burned - used;

  const take = useCallback(
    (kind) => {
      if (hint || !playing) return;
      setChooserOpen(false);

      // Bedel kısılabilir ama oyuncu asla hakkı biten duruma düşmez.
      const spend = Math.max(0, Math.min(HINT_COSTS[kind], remaining - 1));
      const timed = remaining <= HINT_PRESSURE_AT;
      setBurned((b) => b + spend);

      if (kind === "meaning") {
        setHint({
          kind,
          text: hintFromDefinitions(definitions[answer], answer, locale),
        });
      } else {
        const letters = Array.from(answer);
        const pool = letters
          .map((_, i) => i)
          .filter((i) => !revealedAt?.has(i));
        const index = pool.length
          ? pool[Math.floor(Math.random() * pool.length)]
          : 0;
        setHint({ kind, index, letter: letters[index] });
      }

      if (timed) setDeadline(Date.now() + HINT_DEADLINE_MS);
    },
    [hint, playing, remaining, definitions, answer, locale, revealedAt]
  );

  useEffect(() => {
    if (!deadline || !playing) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        setDeadline(null);
        timeoutRef.current?.();
      }
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [deadline, playing]);

  return {
    burned,
    hint,
    chooserOpen,
    secondsLeft,
    remaining,
    canTake: !hint && playing && remaining > 1,
    open: () => setChooserOpen(true),
    close: () => setChooserOpen(false),
    take,
    reset,
    clearDeadline,
  };
}
