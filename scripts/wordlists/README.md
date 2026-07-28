# Kelime listesi sistemi

`public/wordlists/` altındaki dosyalar **elle düzenlenmez**, üretilir:

```bash
npm run wordlists
```

Tek komut iki dili ve tüm uzunlukları üretir: Türkçe 5–9 harf (Wordle 5, Adam
Asmaca 6–9), İngilizce 5 harf.

Türkçeye özgü olan her şey — ek çözümleyicisi, mastar kuralı, özel ad bayrağı —
dilin `morphology` ayarına bağlı. Yeni dil eklemek kaynak tanımlamaktan ibaret.

## Neden üretiliyor

Türkçe sondan eklemeli. Elle tutulan bir listede kaçınılmaz olarak biriken
sorunlar var, hepsi otomatik çözülüyor:

| Sorun | Örnek | Çözüm |
|---|---|---|
| Özel adlar cevap oluyor | `izmir`, `alman`, `burak` | TDK'nın `ozel_mi` bayrağı + büyük harf kontrolü |
| Çekimli form cevap oluyor | `gitti`, `yapma`, `raylı` | ek çözümleyicisi cevap havuzundan düşürür |
| Mastar oyunu bozuyor | `burkmak`, `pislenmek` | 6+ harfte cevap havuzuna alınmaz |
| Kelimenin ne kadar bilindiği bilinmiyor | `bijon` mu `değil` mi? | frekans korpusuna göre kademelenir |

İlk çekirdek liste (`tr-TR.seed.txt`, 5528 kelime) elle toplanmıştı ve içinde
~210 özel ad vardı; hepsi ilk üretimde otomatik ayıklandı.

## Kaynaklar

| Dil | Kaynak | Ne veriyor |
|---|---|---|
| tr | [TDK GTS tam dökümü](https://github.com/ogun/guncel-turkce-sozluk) (v12) | 99.236 madde — kelime, **anlamlar**, tür, özel ad bayrağı |
| tr | [OpenSubtitles 2018 tr](https://github.com/hermitdave/FrequencyWords) | 2M kelime frekansı — kelime ne kadar biliniyor |
| tr | `tr-TR.seed.txt` | elle toplanmış çekirdek liste |
| en | `en-US.seed.txt` | 14.855 kelimelik 5 harf listesi (sözlük yerine de bu kullanılıyor) |
| en | [OpenSubtitles 2018 en](https://github.com/hermitdave/FrequencyWords) | 1.6M kelime frekansı |

> Neden `sozluk.gov.tr/gts` API'si değil: kelime başına bir istek istiyor ve
> ~50 istekten sonra bağlantıyı kesiyor. Aynı veri bu dökümde tek dosyada;
> hız sınırı yok, çevrimdışı çalışıyor, sürümü sabit.

İkisi de `scripts/.cache/` altına iner (git'e girmez), 30 gün sonra tazelenir.
`--offline` ile sadece önbellekten üretilir.

## Çıktılar

Her uzunluk için üç dosya, artı bir dizin:

| Dosya | İçerik |
|---|---|
| `<dil>.<n>.txt` | kabul edilen tahminler — oyuncunun yazabileceği her şey |
| `<dil>.<n>.answers.txt` | cevap havuzu, **frekansa göre azalan sıralı** |
| `<dil>.<n>.definitions.json` | cevapların anlamları (en çok 3) — sözlüğü olan dillerde |
| `<dil>.<n>.meta.json` | kademe sınırları + üretim istatistikleri |
| `index.json` | hangi dil ve uzunluklar üretilmiş |

| Dil / uzunluk | Tahmin | Cevap | Anlamı olan |
|---|---|---|---|
| tr 5 | 5402 | 3115 | 3113 |
| tr 6 | 6044 | 2692 | 2692 |
| tr 7 | 7904 | 2399 | 2399 |
| tr 8 | 8918 | 2403 | 2403 |
| tr 9 | 7470 | 1341 | 1341 |
| en 5 | 14855 | 3944 | — |

Cevap havuzu tahmin listesinin alt kümesi: oyuncu `tuzlu` yazabilir ama cevap
asla `tuzlu` olmaz.

### Zorluk kademeleri

`meta.json` içindeki `tiers`, `answers.txt`'te bitişik dilimlere karşılık gelir.
Eşikler uzunluğa göre bölünüyor — uzun kelimeler korpusta doğal olarak daha
seyrek geçtiği için sabit eşikte 8–9 harflilerin neredeyse tamamı "nadir"
sayılırdı.

| Kademe | 5 harf eşiği | Örnek (5 harf) |
|---|---|---|
| `yaygin` | ≥ 1000 | `güzel`, `zaman`, `sorun` |
| `orta` | ≥ 100 | `kaval`, `çeyiz`, `doruk` |
| `nis` | ≥ 10 | `bijon`, `güfte`, `tiraj`, `reyon` |

Eşiğin altındakiler tahmin olarak geçerli ama cevap olmuyor — `gaşiy`, `yekdü`
gibi kimsenin bilmediği sözlük maddeleri.

## Ek çözümleyicisi

`kök + ek` kalıbına uyan kelimeleri cevap havuzundan düşürür. Ayrım önemli:

- **Çekim eki** (`gitti`, `yapma`, `gidenden`) — ne kadar sık geçerse geçsin
  cevap olmaz. Kelimenin kendisi değil, bir hâli.
- **Yapım eki** (`mutlu`, `hızlı`, `güçlü`) — frekansı 2500'ün üstündeyse
  kalıplaşmış sayılır ve cevap olur. Altındaysa (`tuzlu`, `raylı`) elenir;
  yoksa oyuncu "herhangi bir isim + lı" oynayabilir hâle gelir.

Ek listesi **bilerek dar**. Denenip çıkarılanlar:

- `-ım/-im` → `bilim`, `bölüm`, `çözüm` kalıplaşmış isimler
- `-ın/-in` → `burun`, `derin`, `basın` zaten kök
- `-da/-de` → `delta` = `del`+`ta` gibi saçma eşleşmeler
- `-ca/-ce` → `akça`, `parça`, `bunca`

## Elle kürasyon

Üretim, elle yazılmış iki listeye saygı duyar — her `npm run wordlists`'te
yeniden uygulanırlar. Kürasyon bu yüzden üretimden sağ çıkar.

**`tr-TR.deny.txt`** — tamamen çıkar. Küfür/hakaret, TDK'nın "Yabancı Sözlere
Karşılıklar" maddeleri (`mouse`, `donut`, `start`), kök olmayan formlar
(`ondan`, `canım`), özel ad sızıntıları.

**`tr-TR.allow.txt`** — her filtreyi ez, doğrudan cevap havuzuna al. Ek
çözümleyicisinin yanlış pozitiflerini geri alır: `gerçi` ger(mek)+çi değil,
`sancı` san(mak)+cı değil; `dolma`, `sarma`, `çizme` artık fiil adı değil isim.

Bir kelime eklerken yanına `#` ile gerekçe yaz. Listeler tüm uzunluklarda
ortak: bir kelime bir uzunlukta yasaksa hepsinde yasaktır.

## Seçenekler

```bash
npm run wordlists                     # tüm diller, tüm uzunluklar
npm run wordlists -- --lang=en-US     # tek dil
npm run wordlists -- --length=7       # tek uzunluk
npm run wordlists -- --length=5,6-9   # liste ve aralık
npm run wordlists -- --offline        # sadece önbellekten
npm run wordlists -- --refresh        # önbelleği yok say
npm run wordlists -- --min-freq=25    # cevap havuzunu daralt
npm run wordlists -- --infinitives    # mastarları da cevap havuzuna al
npm run wordlists -- --verbose        # elenen kelimeleri listele
```

## İngilizce — şimdilik eksik olanlar

İngilizce çalışıyor ama Türkçe kadar rafine değil. `en-US.deny.txt` bu yüzden
boş bir başlangıç dosyası olarak duruyor:

- **Anlam yok.** Ücretsiz, toplu indirilebilir bir İngilizce sözlük dökümü
  bağlanmadı. Oyun sonunda anlam gösterilmiyor ve "Anlam" ipucu menüde hiç
  çıkmıyor (`hasMeanings` ile).
- **Çoğullar cevap olabiliyor** — `gasps`, `bulbs`, `coals`. Türkçedeki ek
  çözümleyicisinin karşılığı yok. Kural yazılabilir ("sonu -s ve tekili
  frekans listesinde geçiyorsa çoğuldur") ama tekil biçim 5 harflik çekirdek
  listede olmadığı için frekans korpusuna bakmak gerekir.
- **Özel adlar sızıyor** — `devon`, `pluto`. TDK'nın `ozel_mi` bayrağının
  karşılığı yok.

## Bilinen pürüz (Türkçe)

Kalıplaşmış çekim ifadeleri (`yeridir`, `hakkında`, `boyunca`) TDK'da madde
başı olduğu için havuza girebiliyor; ek çözümleyicisi yakalayamıyor çünkü
kökleri (`yeri`, `hakkı`) sözlükte tek başına bu anlamda geçmiyor. Bulunanlar
`tr-TR.deny.txt`'nin "dilbilgisel kalıplar" bölümünde; rastladıkça oraya
eklemek en temiz yol.

## Yeni dil eklemek

`LANGUAGES` tablosuna bir kayıt yeter:

```js
"de-DE": {
  label: "Deutsch",
  alphabet: "abcdefghijklmnopqrstuvwxyzäöüß",
  lengths: [5],
  dictionary: { kind: "seed" },        // ya da anlam veren bir döküm
  frequency: { url: ".../de/de_full.txt", file: "de_full.txt" },
  seed: "de-DE.seed.txt",
  morphology: false,                   // ek çözümleyicisi Türkçeye özgü
  tierBase: { yaygin: 20000, orta: 2000, nis: 200 },
}
```

Sonra `src/languages.js`'e alfabe, klavye düzeni ve metinleri ekle.
