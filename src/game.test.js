import { score, keyStates, satisfiesHardMode } from "./game";
import {
  toUpper, toLower, normalizeKey, obscureDefinition, hintFromDefinitions,
} from "./words";

describe("score", () => {
  test("yerinde harfler yeşil, kelimede olanlar sarı", () => {
    expect(score("kalem", "gitme")).toEqual([
      "absent", "absent", "absent", "present", "present",
    ]);
  });

  test("tam bilinen kelimenin tamamı yeşil", () => {
    expect(score("gitme", "gitme")).toEqual(Array(5).fill("correct"));
  });

  /**
   * Tekrarlı harfler tek geçişte yanlış sonuç verir; iki geçişli puanlamanın
   * asıl sınandığı yer burası.
   */
  test("cevapta bir tane olan harf tahminde iki kez geçerse biri sarı kalır", () => {
    // cevap "kanat": tek 'a' değil iki 'a' var -> ikisi de işaretlenmeli
    expect(score("araba", "kanat")).toEqual([
      "present", "absent", "present", "absent", "absent",
    ]);
  });

  test("yerinde eşleşme sarıdan önce slotu tüketir", () => {
    // cevap "kitap", tahmin "kikir": ilk 'k' yerinde, ikinci 'k' karşılıksız
    const result = score("kikir", "kitap");
    expect(result[0]).toBe("correct");
    expect(result[2]).toBe("absent");
  });
});

describe("keyStates", () => {
  test("aynı harf birden çok tahminde geçtiyse en iyi sonuç kazanır", () => {
    const states = keyStates(["kalem", "mekan"], "gitme");
    expect(states.m).toBe("present");
    expect(states.e).toBe("present");
    expect(states.k).toBe("absent");
  });

  test("tahmin yoksa harf durumu da yok", () => {
    expect(keyStates([], "gitme")).toEqual({});
  });
});

describe("satisfiesHardMode", () => {
  const answer = "gitme";
  const past = ["kalem"]; // e ve m sarı çıkar

  test("bilinen sarı harfleri düşüren tahmin reddedilir", () => {
    expect(satisfiesHardMode("kadro", past, answer)).toBe(false);
  });

  test("bilinen harfleri kullanan tahmin kabul edilir", () => {
    expect(satisfiesHardMode("metre", past, answer)).toBe(true);
  });

  test("yeşile dönmüş konum değiştirilemez", () => {
    // "gitti" ile g,i,t yerinde çıkar
    expect(satisfiesHardMode("bitki", ["gitti"], answer)).toBe(false);
  });
});

describe("Türkçe harf dönüşümü", () => {
  test("i büyürken nokta korunur, ı noktasız kalır", () => {
    expect(toUpper("istanbul", "tr-TR")).toBe("İSTANBUL");
    expect(toUpper("sıcak", "tr-TR")).toBe("SICAK");
  });

  test("küçültme de simetrik", () => {
    expect(toLower("SICAK", "tr-TR")).toBe("sıcak");
    expect(toLower("İSTANBUL", "tr-TR")).toBe("istanbul");
  });

  test("İngilizcede i/I çifti Türkçe kuralına kaymaz", () => {
    expect(toUpper("iso", "en-US")).toBe("ISO");
    expect(toLower("ISO", "en-US")).toBe("iso");
  });

  /** Oyunun kelime listesiyle eşleşmesi bu gidiş-dönüşe bağlı. */
  test("büyüt-küçült turu kelimeyi bozmuyor", () => {
    for (const word of ["sıcak", "iğne", "ılık", "işlem", "çığır"]) {
      expect(toLower(toUpper(word, "tr-TR"), "tr-TR")).toBe(word);
    }
  });
});

describe("normalizeKey", () => {
  /**
   * Bazı klavye düzenleri Türkçe harfleri ayrık gönderiyor. Toplanmazlarsa iki
   * kod noktası olarak gelip "tek karakter mi" kontrolüne takılıyor ve tuş
   * sessizce yutuluyordu.
   */
  test("ayrık gelen harfler tek kod noktasına toplanır", () => {
    const ayrik = {
      "İ": "İ",  // I + birleşen nokta
      "ş": "ş",  // s + birleşen çengel
      "ü": "ü",
      "ğ": "ğ",
      "ç": "ç",
      "ö": "ö",
    };
    for (const [girdi, beklenen] of Object.entries(ayrik)) {
      const out = normalizeKey(girdi);
      expect(out).toBe(beklenen);
      expect(Array.from(out).length).toBe(1);
    }
  });

  test("zaten toplu gelen harf bozulmaz", () => {
    for (const ch of ["İ", "ş", "ü", "ğ", "ç", "ö", "ı", "a"]) {
      expect(normalizeKey(ch)).toBe(ch);
    }
  });

  test("tuş adları olduğu gibi kalır", () => {
    for (const key of ["Enter", "Backspace", "Escape"]) {
      expect(normalizeKey(key)).toBe(key);
    }
  });
});

describe("obscureDefinition", () => {
  test("tanım cevabı içeriyorsa maskelenir", () => {
    const out = obscureDefinition("Gitmek işi, gidiş biçimi", "gitme", "tr-TR");
    expect(out).not.toMatch(/gitm/i);
  });

  test("baştaki ele verici öbek atılır", () => {
    const out = obscureDefinition(
      "Yazma, çizme vb. işlerde kullanılan çeşitli biçimlerde araç",
      "kalem",
      "tr-TR"
    );
    expect(out).toBe("çizme vb. işlerde kullanılan çeşitli biçimlerde araç");
  });

  test("geriye anlamlı bir şey kalmıyorsa null döner", () => {
    expect(obscureDefinition("Gitmek işi", "gitme", "tr-TR")).toBeNull();
  });

  test("hintFromDefinitions kullanılabilir ilk tanımı seçer", () => {
    const hint = hintFromDefinitions(
      ["Gitmek işi", "Bir yerden bir yere yol alma, hareket etme durumu"],
      "gitme",
      "tr-TR"
    );
    expect(hint).toBeTruthy();
    expect(hint).not.toMatch(/gitm/i);
  });
});
