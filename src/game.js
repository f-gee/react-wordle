/**
 * Oyun kuralları. Saf fonksiyonlar — React'ten bağımsız, test edilebilir.
 *
 * Kelimeler her yerde küçük harfle tutulur; büyük harfe çevirme sadece
 * görüntülemede yapılır (bkz. src/words.js toUpper).
 */

export const WORD_LENGTH = 5;

/**
 * Tahmini cevaba göre puanlar. İki geçişli, çünkü tekrarlı harfler tek geçişte
 * yanlış sonuç verir: cevap "kalem", tahmin "kakao" ise ikinci "k" sarı
 * olmamalı — ilk "k" o slotu zaten tüketti.
 */
export function score(guess, answer) {
  const g = Array.from(guess);
  const a = Array.from(answer);
  const result = g.map(() => "absent");
  const used = a.map(() => false);

  // 1. geçiş: yerinde olanlar, slotu tüketerek
  g.forEach((ch, i) => {
    if (a[i] === ch) {
      result[i] = "correct";
      used[i] = true;
    }
  });

  // 2. geçiş: kalanlar, sadece tüketilmemiş slotlara karşı
  g.forEach((ch, i) => {
    if (result[i] === "correct") return;
    const j = a.findIndex((c, k) => !used[k] && c === ch);
    if (j > -1) {
      result[i] = "present";
      used[j] = true;
    }
  });

  return result;
}

/**
 * Klavyedeki her harfin durumu. Bir harf birden çok tahminde geçtiyse en iyi
 * sonuç kazanır: correct > present > absent.
 */
export function keyStates(guesses, answer) {
  const rank = { absent: 1, present: 2, correct: 3 };
  const map = {};

  for (const guess of guesses) {
    const sc = score(guess, answer);
    Array.from(guess).forEach((ch, i) => {
      if (!map[ch] || rank[sc[i]] > rank[map[ch]]) map[ch] = sc[i];
    });
  }
  return map;
}

/**
 * Zor mod: bilinen ipuçları kullanılmak zorunda.
 * Yeşile boyanmış bir konum değiştirilemez, sarı çıkmış bir harf düşürülemez.
 *
 * Kuralı karşılıyorsa true döner.
 */
export function satisfiesHardMode(guess, guesses, answer) {
  const fixed = {}; // konum -> harf
  const required = new Set(); // kelimede geçmesi gereken harfler

  for (const past of guesses) {
    const sc = score(past, answer);
    Array.from(past).forEach((ch, i) => {
      if (sc[i] === "correct") fixed[i] = ch;
      else if (sc[i] === "present") required.add(ch);
    });
  }

  const current = Array.from(guess);
  const spotsOk = Object.entries(fixed).every(([i, ch]) => current[i] === ch);
  const lettersOk = [...required].every((ch) => current.includes(ch));

  return spotsOk && lettersOk;
}
