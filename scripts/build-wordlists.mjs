/**
 * Kelime listesi üreteci.
 *
 * Her dil kendi kaynaklarını tanımlıyor; Türkçeye özgü olan her şey (ek
 * çözümleyicisi, mastar kuralı, özel ad bayrağı) `morphology` bayrağına bağlı,
 * böylece başka dil eklemek kaynak tanımlamaktan ibaret.
 *
 * Çıktılar (dil ve uzunluk başına):
 *   public/wordlists/<dil>.<n>.txt              kabul edilen tahminler
 *   public/wordlists/<dil>.<n>.answers.txt      cevap havuzu, frekansa göre sıralı
 *   public/wordlists/<dil>.<n>.definitions.json cevapların anlamları (varsa)
 *   public/wordlists/<dil>.<n>.meta.json        kademe sınırları + istatistik
 *
 * Kullanım:
 *   npm run wordlists                      tüm diller, tüm uzunluklar
 *   npm run wordlists -- --lang=en-US      tek dil
 *   npm run wordlists -- --length=5,6-9    uzunluk listesi ve aralığı
 *   npm run wordlists -- --offline         sadece önbellekten
 *   npm run wordlists -- --refresh         önbelleği yok say
 *   npm run wordlists -- --verbose         elenen kelimeleri listele
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = path.join(ROOT, "scripts", ".cache");
const LIST_DIR = path.join(ROOT, "scripts", "wordlists");
const OUT_DIR = path.join(ROOT, "public", "wordlists");

const CACHE_MAX_AGE_DAYS = 30;
const MAX_DEFINITIONS = 3;

const FREQ_BASE =
  "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018";

/**
 * TDK Güncel Türkçe Sözlük'ün tam dökümü.
 *
 * Neden bu, sozluk.gov.tr API'si değil: API kelime başına bir istek istiyor ve
 * ~50 istekten sonra bağlantıyı kesiyor. Bu döküm aynı veriyi tek dosyada
 * veriyor — anlamlar, tür bilgisi ve özel ad bayrağı dâhil.
 */
const GTS_URL =
  "https://raw.githubusercontent.com/ogun/guncel-turkce-sozluk/master/sozluk/v12/v12.gts.json.tar.gz";

const LANGUAGES = {
  "tr-TR": {
    label: "Türkçe",
    // q/w/x bilerek yok: klavyede var ama Türkçe kelimede geçmez.
    alphabet: "abcçdefgğhıijklmnoöprsştuüvyz",
    lengths: [5, 6, 7, 8, 9],
    dictionary: { kind: "gts", url: GTS_URL, file: "gts.json", archive: "gts.tar.gz" },
    frequency: { url: `${FREQ_BASE}/tr/tr_full.txt`, file: "tr_full.txt" },
    seed: "tr-TR.seed.txt",
    // Ek çözümleyicisi, mastar kuralı ve özel ad filtresi Türkçeye özgü.
    morphology: true,
    tierBase: { yaygin: 1000, orta: 100, nis: 10 },
  },
  "en-US": {
    label: "English",
    alphabet: "abcdefghijklmnopqrstuvwxyz",
    lengths: [5],
    // Anlam kaynağı yok; sözlük olarak kelime listesinin kendisi kullanılıyor.
    dictionary: { kind: "seed" },
    frequency: { url: `${FREQ_BASE}/en/en_full.txt`, file: "en_full.txt" },
    seed: "en-US.seed.txt",
    morphology: false,
    // İngilizce korpus Türkçeden büyük; eşikler ona göre.
    tierBase: { yaygin: 20000, orta: 2000, nis: 200 },
  },
};

const TIER_LABELS = {
  yaygin: "herkesin bildiği",
  orta: "tanıdık",
  nis: "niş ama adil",
};

/**
 * Eşikler kelime uzunluğuna göre bölünüyor: uzun kelimeler korpusta doğal
 * olarak daha seyrek geçiyor. Sabit eşikte 8-9 harflilerin neredeyse tamamı
 * "nadir" sayılırdı.
 */
function tierThresholds(config, length) {
  const divisor = Math.max(1, 2 ** (length - 5)); // 5:1  6:2  7:4  8:8  9:16
  return Object.entries(config.tierBase).map(([name, base]) => ({
    name,
    label: TIER_LABELS[name],
    min: Math.max(1, Math.round(base / divisor)),
  }));
}

// ---------------------------------------------------------------------------
// Metin yardımcıları
// ---------------------------------------------------------------------------

/**
 * Küçük harfe çevirme dile bağlı: Türkçede I -> ı, İ -> i. JS'in varsayılanı
 * ikisini de "i" yapar ve kelimeler eşleşmez. İngilizcede tam tersi geçerli,
 * o yüzden dilin locale'i kullanılıyor.
 */
function lower(text, locale) {
  return text.toLocaleLowerCase(locale);
}

/** kâğıt -> kagit değil kağıt: düzeltme işaretini taşıyıcı harfe indirger. */
function foldCircumflex(text) {
  return text
    .normalize("NFC")
    .replace(/[âÂ]/g, "a")
    .replace(/[îÎ]/g, "i")
    .replace(/[ûÛ]/g, "u")
    .replace(/[ôÔ]/g, "o")
    .replace(/[êÊ]/g, "e");
}

function makeNormalizer(locale) {
  return (text) => lower(foldCircumflex(text.trim()), locale);
}

function makeValidator(alphabet) {
  const letters = new Set([...alphabet]);
  return {
    isWord: (word) => word.length > 0 && [...word].every((c) => letters.has(c)),
    isPlayable: (word, length) =>
      [...word].length === length && [...word].every((c) => letters.has(c)),
  };
}

// ---------------------------------------------------------------------------
// Kaynak yükleme (önbellekli)
// ---------------------------------------------------------------------------

function log(msg) {
  process.stdout.write(msg + "\n");
}

function cacheIsFresh(file, { offline, refresh }) {
  if (!fs.existsSync(file) || refresh) return false;
  const ageDays = (Date.now() - fs.statSync(file).mtimeMs) / 86400000;
  return offline || ageDays < CACHE_MAX_AGE_DAYS;
}

async function loadText(source, label, options) {
  const cached = path.join(CACHE_DIR, source.file);

  if (cacheIsFresh(cached, options)) {
    log(`  ${label}: önbellek`);
    return fs.readFileSync(cached, "utf8");
  }
  if (options.offline) throw new Error(`--offline verildi ama önbellek yok: ${cached}`);

  log(`  ${label}: indiriliyor...`);
  const res = await fetch(source.url);
  if (!res.ok) throw new Error(`${source.url} -> HTTP ${res.status}`);
  const text = await res.text();

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cached, text, "utf8");
  log(`  ${label}: ${(text.length / 1e6).toFixed(1)} MB indirildi`);
  return text;
}

/**
 * Tek dosyalık bir .tar.gz'i açar. Node'da tar okuyucu yok ama tek dosyalık
 * arşiv basit: 512 baytlık başlık, ardından içerik. Boyut başlıkta sekizlik
 * yazılı. Harici bağımlılık eklememek için bu kadarı elle yapılıyor.
 */
function untarSingleFile(gzBuffer) {
  const tar = zlib.gunzipSync(gzBuffer);
  const rawSize = tar.subarray(124, 136).toString("ascii").replace(/\0/g, "").trim();
  const size = parseInt(rawSize, 8);
  if (!Number.isFinite(size) || size <= 0) throw new Error("tar başlığı okunamadı");
  return tar.subarray(512, 512 + size);
}

async function ensureArchive(source, label, options) {
  const target = path.join(CACHE_DIR, source.file);

  if (cacheIsFresh(target, options)) {
    log(`  ${label}: önbellek`);
    return target;
  }
  if (options.offline) throw new Error(`--offline verildi ama önbellek yok: ${target}`);

  log(`  ${label}: indiriliyor...`);
  const res = await fetch(source.url);
  if (!res.ok) throw new Error(`${source.url} -> HTTP ${res.status}`);
  const archive = Buffer.from(await res.arrayBuffer());

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(target, untarSingleFile(archive));
  log(`  ${label}: ${(archive.length / 1e6).toFixed(1)} MB indirildi, ` +
      `${(fs.statSync(target).size / 1e6).toFixed(0)} MB açıldı`);
  return target;
}

/** `#` yorum satırlarını ve boşlukları atarak elle tutulan listeleri okur. */
function readCuratedList(file, normalize) {
  if (!file) return new Set();
  const full = path.join(LIST_DIR, file);
  if (!fs.existsSync(full)) return new Set();
  const words = fs
    .readFileSync(full, "utf8")
    .split(/\r?\n/)
    .map((line) => normalize(line.split("#")[0]))
    .filter(Boolean);
  return new Set(words);
}

// ---------------------------------------------------------------------------
// Sözlük ayrıştırma
// ---------------------------------------------------------------------------

/**
 * TDK dökümünü satır satır okur (JSON Lines).
 *
 * Sözlük deyim, atasözü ve ek de içerdiği için sadece tek parçalı, saf harften
 * oluşan maddeler alınır.
 *
 * Özel ad kararı iki sinyale birden bakar: TDK'nın `ozel_mi` bayrağı ve
 * maddenin büyük harfle başlaması. Aynı yazılışın hem özel hem cins ad maddesi
 * varsa (Akrep burcu / akrep hayvanı) kelime cins ad sayılır ve korunur.
 */
async function parseGts(filePath, normalize, isWord) {
  const common = new Set();
  const proper = new Set();
  const verbStems = new Set();
  const definitions = new Map();

  const reader = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of reader) {
    if (!line.trim()) continue;

    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // bozuk satır varsa döküm yine de kullanılabilir
    }

    const raw = entry.madde?.trim();
    if (!raw) continue;
    if (/[^A-Za-zÇĞİÖŞÜçğıöşüÂÎÛÔÊâîûôê]/.test(raw)) continue;

    const word = normalize(raw);
    if (!isWord(word)) continue;

    // Fiil kökünü sakla: "gitmek" -> "git". Çekimli form elemesinde kullanılır.
    if (/(mak|mek)$/.test(word) && [...word].length > 5) {
      verbStems.add(word.slice(0, -3));
    }

    if (entry.ozel_mi === "1" || /^[A-ZÇĞİÖŞÜ]/.test(raw)) proper.add(word);
    else common.add(word);

    const senses = (entry.anlamlarListe ?? [])
      .map((sense) => sense?.anlam?.trim())
      .filter(Boolean);
    if (senses.length) {
      if (!definitions.has(word)) definitions.set(word, []);
      definitions.get(word).push(...senses);
    }
  }

  for (const word of common) proper.delete(word);
  return { common, proper, verbStems, definitions };
}

/** "kelime sayı" satırları. Sadece istenen uzunluktakiler toplanır. */
function parseFrequency(text, lengths, normalize, isWord) {
  const freq = new Map();
  for (const line of text.split("\n")) {
    const sep = line.indexOf(" ");
    if (sep < 1) continue;
    const word = normalize(line.slice(0, sep));
    if (!lengths.has([...word].length)) continue;
    if (!isWord(word)) continue;
    const count = Number(line.slice(sep + 1));
    if (!Number.isFinite(count)) continue;
    freq.set(word, (freq.get(word) || 0) + count);
  }
  return freq;
}

// ---------------------------------------------------------------------------
// Türkçe: türetilmiş / çekimli form elemesi
// ---------------------------------------------------------------------------

/** Yapım ekleri: yeni kelime türetirler, zamanla kalıplaşabilirler. */
const DERIVATIONAL = [
  "lı", "li", "lu", "lü",
  "cı", "ci", "cu", "cü", "çı", "çi", "çu", "çü",
  "lık", "lik", "luk", "lük",
  "sız", "siz", "suz", "süz",
];

/** Çekim ekleri ve fiil adı: kelimenin kendisi değil, bir hâli. Asla cevap olmaz. */
const INFLECTIONAL = [
  "dı", "di", "du", "dü", "tı", "ti", "tu", "tü",
  "dan", "den", "tan", "ten", "ndan", "nden",
  "mış", "miş", "muş", "müş",
  "ma", "me",
];

/**
 * Kelimenin ne tür bir ek aldığını söyler; almadıysa null.
 *
 * Ayrım önemli çünkü ikisine farklı davranıyoruz:
 *   "gitti", "yapma"  -> çekim. Ne kadar sık geçerse geçsin cevap olmamalı.
 *   "mutlu", "hızlı"  -> yapım. Yeterince sık geçiyorsa artık kalıplaşmıştır
 *                        ve cevap olmayı hak eder; seyrekse ("tuzlu") oyunu
 *                        ucuzlatır, elenir.
 *
 * Çekim önce bakılıyor: "gitme" hem -me hem başka kalıba uyabilir.
 */
function derivationKind(word, lexicon, verbStems) {
  const matches = (suffixes) =>
    suffixes.some((suffix) => {
      if (!word.endsWith(suffix)) return false;
      const stem = word.slice(0, -suffix.length);
      if ([...stem].length < 3) return false;
      return lexicon.has(stem) || verbStems.has(stem);
    });

  if (matches(INFLECTIONAL)) return "inflectional";
  if (matches(DERIVATIONAL)) return "derivational";
  return null;
}

/**
 * Bu frekansın üstündeki yapım ekli kelimeler kalıplaşmış sayılır.
 * "mutlu" 84.000, "hızlı" 53.000 kez geçiyor — bunlar artık ek almış bir kök
 * değil, kelimenin kendisi.
 */
const LEXICALIZED_FREQ = 2500;

// ---------------------------------------------------------------------------
// Üretim
// ---------------------------------------------------------------------------

function buildLength({
  code, config, length, dict, freq, seed, allow, deny, collator, isPlayable,
  minFreq, verbose, infinitives,
}) {
  const tiers = tierThresholds(config, length);
  const floor = minFreq ?? tiers[tiers.length - 1].min;
  const noInfinitives =
    config.morphology && (infinitives === undefined ? length >= 6 : !infinitives);

  // --- tahmin listesi -----------------------------------------------------
  const guesses = new Set();
  const dropped = { proper: new Set(), denied: new Set() };

  for (const word of new Set([...dict.common, ...seed, ...allow])) {
    if (!isPlayable(word, length)) continue;
    if (deny.has(word) && !allow.has(word)) {
      dropped.denied.add(word);
      continue;
    }
    if (dict.proper.has(word) && !allow.has(word)) {
      dropped.proper.add(word);
      continue;
    }
    guesses.add(word);
  }

  // --- cevap havuzu -------------------------------------------------------
  // Tahmin listesinin, gerçekten kullanılan ve türetilmemiş alt kümesi.
  const lexicon = new Set([...dict.common, ...seed]);
  const answers = [];
  const rejected = { rare: 0, derived: [], infinitive: 0 };

  for (const word of guesses) {
    const count = freq.get(word) || 0;
    if (allow.has(word)) {
      answers.push([word, count]);
      continue;
    }
    if (count < floor) {
      rejected.rare++;
      continue;
    }
    // Mastar, Adam Asmaca'da kelimeyi ele veriyor: "-mak/-mek" anlaşılınca üç
    // harf bedavaya geliyor. 5 harfte kapatılmıyor, çünkü orada "yemek",
    // "demek" gibi maddeler isim olarak da geçerli.
    if (noInfinitives && /(mak|mek)$/.test(word)) {
      rejected.infinitive++;
      continue;
    }
    if (config.morphology) {
      const kind = derivationKind(word, lexicon, dict.verbStems);
      if (kind === "inflectional" || (kind === "derivational" && count < LEXICALIZED_FREQ)) {
        rejected.derived.push(word);
        continue;
      }
    }
    answers.push([word, count]);
  }

  // Frekansa göre azalan; eşitlikte alfabetik -> deterministik çıktı.
  answers.sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]));

  // answers sıralı olduğu için her kademe bitişik bir dilim.
  const tierRanges = {};
  let cursor = 0;
  for (const tier of tiers) {
    if (tier.min < floor) continue;
    const start = cursor;
    while (cursor < answers.length && answers[cursor][1] >= tier.min) cursor++;
    tierRanges[tier.name] = {
      min: tier.min,
      label: tier.label,
      range: [start, cursor],
      count: cursor - start,
    };
  }

  // --- yaz ----------------------------------------------------------------
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const base = path.join(OUT_DIR, `${code}.${length}`);
  const guessList = [...guesses].sort(collator.compare);
  const answerList = answers.map(([w]) => w);

  fs.writeFileSync(`${base}.txt`, guessList.join("\n") + "\n", "utf8");
  fs.writeFileSync(`${base}.answers.txt`, answerList.join("\n") + "\n", "utf8");

  // Anlamlar sadece cevap havuzu için ve sadece sözlüğü olan dillerde.
  let described = 0;
  if (dict.definitions.size) {
    const meanings = {};
    for (const word of answerList) {
      const senses = dict.definitions.get(word);
      if (!senses?.length) continue;
      // TDK çapraz göndermeyi "►" ile yazıyor ("► bütün"); okunur hâle getir.
      const cleaned = [...new Set(senses.map((s) => s.replace(/►\s*/g, "bkz. ")))];
      meanings[word] = cleaned.slice(0, MAX_DEFINITIONS);
      described++;
    }
    fs.writeFileSync(`${base}.definitions.json`, JSON.stringify(meanings), "utf8");
  }

  const meta = {
    language: code,
    wordLength: length,
    generatedBy: "scripts/build-wordlists.mjs",
    minFrequency: floor,
    hasDefinitions: described > 0,
    counts: { guesses: guessList.length, answers: answerList.length, described },
    tiers: tierRanges,
  };
  fs.writeFileSync(`${base}.meta.json`, JSON.stringify(meta, null, 2) + "\n", "utf8");

  // --- rapor --------------------------------------------------------------
  const tierLine = Object.entries(tierRanges)
    .map(([name, t]) => `${name} ${t.count}`)
    .join("  ");
  log(
    `  ${length} harf │ tahmin ${String(guessList.length).padStart(5)} │ ` +
      `cevap ${String(answerList.length).padStart(5)} │ ` +
      `elenen: özel ad ${dropped.proper.size}, deny ${dropped.denied.size}, ` +
      `seyrek ${rejected.rare}` +
      (config.morphology ? `, türemiş ${rejected.derived.length}` : "") +
      (noInfinitives ? `, mastar ${rejected.infinitive}` : "")
  );
  log(
    `           └ ${tierLine}   (eşik freq>=${floor})` +
      (described ? ` · anlamı olan ${described}` : "")
  );

  if (verbose && rejected.derived.length) {
    log(`           türemiş: ${rejected.derived.sort(collator.compare).slice(0, 30).join(" ")}`);
  }

  return meta;
}

async function buildLanguage(code, options) {
  const config = LANGUAGES[code];
  const lengths = options.lengths ?? config.lengths;
  const normalize = makeNormalizer(code);
  const { isWord, isPlayable } = makeValidator(config.alphabet);
  const collator = new Intl.Collator(code);

  log("");
  log(`── ${config.label} (${code}) ──`);

  const seed = readCuratedList(config.seed, normalize);
  const allow = readCuratedList(`${code}.allow.txt`, normalize);
  const deny = readCuratedList(`${code}.deny.txt`, normalize);

  const freqText = await loadText(config.frequency, `${config.label} frekans`, options);
  const freq = parseFrequency(freqText, new Set(lengths), normalize, isWord);

  // Sözlük: TDK dökümü varsa anlam ve özel ad bilgisi de gelir; yoksa
  // kelime listesinin kendisi sözlük yerine geçer.
  let dict;
  if (config.dictionary.kind === "gts") {
    const file = await ensureArchive(config.dictionary, "TDK tam döküm", options);
    dict = await parseGts(file, normalize, isWord);
  } else {
    dict = {
      common: seed,
      proper: new Set(),
      verbStems: new Set(),
      definitions: new Map(),
    };
  }

  log(
    `madde ${dict.common.size} · özel ad ${dict.proper.size} · ` +
      `anlamı olan ${dict.definitions.size} · çekirdek ${seed.size} · ` +
      `allow ${allow.size} · deny ${deny.size} · frekans ${freq.size}`
  );

  return lengths.map((length) =>
    buildLength({
      code, config, length, dict, freq, seed, allow, deny, collator, isPlayable,
      ...options,
    })
  );
}

async function build(options) {
  const codes = options.langs ?? Object.keys(LANGUAGES);
  const index = { languages: {} };

  log("Kaynaklar indiriliyor / önbellekten okunuyor:");

  for (const code of codes) {
    if (!LANGUAGES[code]) throw new Error(`bilinmeyen dil: ${code}`);
    const built = await buildLanguage(code, options);
    index.languages[code] = built.map((m) => ({
      length: m.wordLength,
      guesses: m.counts.guesses,
      answers: m.counts.answers,
      hasDefinitions: m.hasDefinitions,
    }));
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, "index.json"),
    JSON.stringify(index, null, 2) + "\n",
    "utf8"
  );

  log("");
  log(`${codes.length} dil üretildi -> public/wordlists/`);
}

// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : undefined;
};

/** "5,6-9" -> [5,6,7,8,9] */
function parseLengths(spec) {
  if (!spec) return undefined;
  const out = new Set();
  for (const part of String(spec).split(",")) {
    const range = part.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const [, a, b] = range.map(Number);
      for (let n = Math.min(a, b); n <= Math.max(a, b); n++) out.add(n);
    } else if (part.trim()) {
      out.add(Number(part.trim()));
    }
  }
  const lengths = [...out].filter((n) => Number.isInteger(n) && n >= 2 && n <= 20);
  if (!lengths.length) throw new Error(`--length çözümlenemedi: ${spec}`);
  return lengths.sort((a, b) => a - b);
}

const minFreqRaw = value("min-freq");

build({
  offline: flag("offline"),
  refresh: flag("refresh"),
  verbose: flag("verbose"),
  langs: value("lang")?.split(","),
  lengths: parseLengths(value("length")),
  minFreq: minFreqRaw === undefined ? undefined : Number(minFreqRaw),
  // Varsayılan uzunluğa göre: 6+ harfte mastarlar cevap havuzuna girmez.
  infinitives: flag("infinitives") ? true : flag("no-infinitives") ? false : undefined,
}).catch((err) => {
  console.error("\nHata:", err.message);
  process.exit(1);
});
