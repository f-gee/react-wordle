/**
 * Kelime listelerinin yüklenmesi ve Türkçeye duyarlı harf işlemleri.
 *
 * Listeler scripts/build-wordlists.mjs tarafından üretiliyor; buradaki tek iş
 * onları okumak. Ayrıntı için scripts/wordlists/README.md.
 */

/**
 * Türkçede i/I çifti simetrik değil: i -> İ, ı -> I.
 * Locale'siz toUpperCase() "i"yi "I" yapar ve kelime listesiyle eşleşme bozulur.
 */
export function toUpper(text, locale) {
  return text.toLocaleUpperCase(locale);
}

export function toLower(text, locale) {
  return text.toLocaleLowerCase(locale);
}

function parseList(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  // Bazı statik sunucular eksik dosya için 404 yerine index.html döndürür.
  // Kelime listesi görünümünde HTML'i sessizce yutmayalım.
  if (lines.some((line) => line.includes("<") || line.includes(" "))) {
    throw new Error("kelime listesi beklenen biçimde değil");
  }
  return lines;
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

/**
 * Bir dilin kelime verisini yükler.
 *
 * guesses  Set   kabul edilen tahminler. Set çünkü her Enter'da aranıyor.
 * answers  Array cevap havuzu, frekansa göre azalan sıralı.
 * tiers    Object zorluk kademesi -> answers dizisindeki [başlangıç, bitiş).
 *
 * Cevap havuzu ve meta dosyası yoksa (henüz üretilmemiş bir dil) tahmin
 * listesine düşer, oyun yine çalışır.
 */
export async function loadWords(language, length) {
  const base = `${process.env.PUBLIC_URL}/wordlists/${language}.${length}`;

  const guessText = await fetchText(`${base}.txt`);
  const guesses = parseList(guessText);

  const [answers, meta] = await Promise.all([
    fetchText(`${base}.answers.txt`)
      .then(parseList)
      .catch(() => guesses),
    fetchText(`${base}.meta.json`)
      .then(JSON.parse)
      .catch(() => null),
  ]);

  return {
    guesses: new Set(guesses),
    answers,
    tiers: meta?.tiers ?? null,
  };
}

/**
 * Havuzdan bir cevap seçer.
 *
 * tier verilmezse tüm havuz kullanılır. Bilinmeyen ya da o dil için üretilmemiş
 * bir kademe istenirse yine tüm havuza düşer.
 */
/**
 * Kelime anlamları. Oyunun sonunda ve ipucunda kullanılıyor, açılışta gerekmez;
 * bu yüzden ayrı dosya ve tembel yükleniyor. Dil başına bir kez indirilir.
 *
 * Dosya yoksa boş nesne döner — anlam gösterilmez, oyun çalışmaya devam eder.
 */
const definitionRequests = new Map();

export function loadDefinitions(language, length) {
  const key = `${language}.${length}`;
  if (!definitionRequests.has(key)) {
    const url = `${process.env.PUBLIC_URL}/wordlists/${key}.definitions.json`;
    definitionRequests.set(
      key,
      fetchText(url)
        .then(JSON.parse)
        .catch(() => ({}))
    );
  }
  return definitionRequests.get(key);
}

/**
 * İpucunda gösterilecek anlamı zorlaştırır. Oyun sonundaki anlam tam kalır;
 * bu sadece oyun sürerken gösterilen sürüm.
 *
 * TDK tanımları iki şekilde kelimeyi ele veriyor:
 *   1. Kelimenin kendisini içeriyorlar — "gitme" için "Gitmek işi"
 *   2. En açık ifadeyle başlıyorlar — "kalem" için "Yazma, çizme vb. ..."
 *
 * Bu yüzden aynı kökten gelen sözcükler maskeleniyor ve baştaki ilk öbek
 * atılıyor. Geriye anlamlı bir şey kalmazsa null döner, çağıran sıradaki
 * tanımı dener.
 */
export function obscureDefinition(text, answer, locale) {
  if (!text) return null;

  // Türkçe sondan eklemeli: kökü tutturmak için ilk 4 harf yeterli
  // ("gitme" -> "gitm", "Gitmek" de yakalanır).
  const stem = Array.from(toLower(answer, locale)).slice(0, 4).join("");

  const masked = text
    .split(/(\s+)/)
    .map((token) => {
      const bare = toLower(token.replace(/[^\p{L}]/gu, ""), locale);
      return bare.length >= 4 && bare.startsWith(stem) ? "…" : token;
    })
    .join("");

  // Baştaki ilk öbeği at; tanımın en ele verici kısmı orası.
  const clauses = masked.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  let trimmed;
  if (clauses.length > 1) {
    trimmed = clauses.slice(1).join(", ");
  } else {
    const parts = masked.trim().split(/\s+/);
    trimmed = parts.length > 5 ? parts.slice(2).join(" ") : masked.trim();
  }

  trimmed = trimmed.trim();
  return trimmed.length >= 12 ? trimmed : null;
}

/** Verilen tanımlardan ipucu olarak kullanılabilecek ilkini döndürür. */
export function hintFromDefinitions(definitions, answer, locale) {
  for (const text of definitions ?? []) {
    const obscured = obscureDefinition(text, answer, locale);
    if (obscured) return obscured;
  }
  return null;
}

export function pickAnswer(words, tier) {
  const range = tier && words.tiers?.[tier]?.range;
  const [start, end] = range ?? [0, words.answers.length];
  const pool = words.answers.slice(start, end);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
