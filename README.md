# Uçuş Saati Studio 🎬

Ham çocuk/etkinlik kliplerini saniyeler içinde **sosyal medyaya hazır** videoya çeviren, CapCut tarzı ama **otomasyona** odaklı web tabanlı video kurgu stüdyosu.

8–10 ham klip yükleyin → uygulama otomatik olarak:

1. 🔇 Sessiz / ölü anları algılar ve kırpar
2. 📝 Konuşmadan **Türkçe altyazı** üretir
3. 🏷️ Logo bindirir
4. 🎵 Arka plan müziği ekler (konuşmada otomatik kısma)
5. 🎞️ Düzenlenebilir bir zaman çizelgesi oluşturur
6. 📤 Final **MP4** olarak dışa aktarır

Tamamen çalışan bir uygulamadır — mockup değildir. Gerçek yükleme, önizleme, altyazı düzenleme, zaman çizelgesi kurgu, sessizlik tespiti, logo bindirme, müzik katmanı ve FFmpeg ile gerçek render içerir.

---

## Teknoloji

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
- **Zustand** (undo/redo destekli durum yönetimi)
- **Sunucu tarafı FFmpeg** (render, sessizlik tespiti, dalga formu, müzik, ducking)
- **Whisper** (yerel `whisper` CLI veya OpenAI API) ile Türkçe konuşma tanıma
- Modüler mimari — her özellik ayrı `lib/` modülünde, kolayca genişletilebilir

---

## Gereksinimler

| Araç | Zorunlu mu? | Kurulum (macOS) |
|------|-------------|------------------|
| **Node.js 18+** | ✅ Evet | `brew install node` |
| **FFmpeg + ffprobe** | ✅ Evet (render için) | `brew install ffmpeg` |
| **Whisper** | ⚠️ Altyazı için | `pip install -U openai-whisper` |

> Altyazı sağlayıcısı yoksa diğer tüm özellikler (sessizlik kesimi, logo, müzik, export) yine de çalışır. Altyazıyı elle de ekleyebilirsiniz.

Sağ üstteki **FFmpeg** ve **Whisper** rozetleri ortamınızı otomatik algılar.

---

## Kurulum

```bash
cd ucus-editor
npm install
cp .env.example .env.local   # opsiyonel — varsayılanlar çalışır
npm run dev
```

Tarayıcıda aç: **http://localhost:5190**

### Whisper kurulumu (Türkçe altyazı)

```bash
pip install -U openai-whisper
# İlk çalıştırmada model (~460MB "small") indirilir.
```

`.env.local` içinde model seçilebilir (`tiny` < `base` < `small` < `medium` < `large`):

```bash
WHISPER_MODEL=small
```

Alternatif olarak OpenAI Whisper API:

```bash
TRANSCRIBE_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

---

## Kullanım Akışı

1. **Medya** → 8–10 klibi sürükle-bırak. Sıralamayı buradan ayarla.
2. **Oto Kurgu** → kesim hassasiyetini seç (Hafif / Dengeli / Sıkı) ve
   **"Tek Tıkla Temiz Kurgu"** ile sessizlik kesimi + birleştirme + Türkçe altyazıyı tek seferde yap.
3. **Altyazı** → stil seç (Temiz / Sarı Vurgu / TikTok / Belgesel), satırları elle düzenle.
4. **Logo** → şeffaf PNG yükle, konum/boyut/opaklık ayarla.
5. **Müzik** → hazır parça seç ya da kendi müziğini yükle; konuşmada otomatik kısma.
6. **Zaman çizelgesi** (alt) → kliplerden kırp, böl (S), sil (Delete), sürükleyip sırala, yakınlaştır.
7. **Dışa Aktar** → en-boy oranı (9:16 / 16:9 / 1:1 / Orijinal) ve kalite seç, **MP4 indir**.

### Klavye kısayolları

| Tuş | İşlev |
|-----|-------|
| `Boşluk` | Oynat / Duraklat |
| `S` | Seçili klibi oynatma çizgisinden böl |
| `Delete` / `Backspace` | Seçili klibi veya altyazıyı sil |
| `⌘/Ctrl + Z` | Geri al |
| `⌘/Ctrl + Shift + Z` | İleri al |
| `←` / `→` | 1 kare ilerle/geri (Shift ile 1 sn) |
| `Home` | Başa dön |

---

## Mimari

```
ucus-editor/
├─ app/
│  ├─ page.tsx                 # Editör girişi
│  ├─ layout.tsx · globals.css # Tema (koyu + mor, glassmorphism)
│  └─ api/
│     ├─ health/               # FFmpeg/Whisper algılama
│     ├─ upload/               # Akışla diske yükleme (+ probe + thumbnail)
│     ├─ media/[id]/           # Range destekli medya servis + thumbnail
│     ├─ silence/              # silencedetect + dalga formu
│     ├─ transcribe/           # Whisper (yerel/OpenAI)
│     ├─ music/                # Yerel üretilen hazır müzik kütüphanesi
│     ├─ export/               # Render işi (2 geçişli) + ilerleme
│     ├─ export/[id]/          # İş durumu
│     └─ download/[id]/        # Final MP4 indirme
├─ components/
│  ├─ Editor.tsx · Topbar · NavRail · Inspector
│  ├─ panels/                  # Media · AutoEdit · Subtitles · Logo · Music · Export
│  ├─ preview/                 # PreviewPlayer + SubtitleOverlay + LogoOverlay
│  └─ timeline/Timeline.tsx    # Klip/altyazı/müzik/logo izleri + dalga formu
└─ lib/
   ├─ types.ts                 # Ortak tip sözleşmesi
   ├─ store.ts                 # Zustand + undo/redo
   ├─ timeline.ts              # Zaman çizelgesi + sessizlik→klip + altyazı eşleme
   ├─ ffmpeg.ts                # ffmpeg/ffprobe sarmalayıcı
   ├─ silence.ts (→ffmpeg)     # —
   ├─ transcribe.ts            # Whisper sağlayıcıları
   ├─ subtitles.ts             # ASS üretimi + stil + sarma
   ├─ export-builder.ts        # 2 geçişli FFmpeg filter_complex kurucu
   ├─ music.ts                 # Hazır müzik üretimi
   └─ jobs.ts                  # Render iş takibi
```

### Render nasıl çalışır (2 geçiş)

- **Geçiş 1** — Klipler kırpılır, ölçeklenir (gerekirse bulanık arka plan dolgusu), birleştirilir
  veya yumuşak xfade ile geçiştirilir; ses normalize edilir, müzik karıştırılır (konuşmada
  sidechain ducking). Tek tip bir ara dosya üretilir.
- **Geçiş 2** — Logo bindirilir, altyazılar (ASS) gömülür, isteğe bağlı intro/outro eklenir,
  seçilen kalitede final MP4 kodlanır.

Karmaşık filtreler hata verirse sistem otomatik olarak geçişsiz / intro-outro'suz yeniden dener —
yani export her durumda bir sonuç üretmeye çalışır.

---

## Ortam Değişkenleri (`.env.local`)

| Değişken | Varsayılan | Açıklama |
|----------|------------|----------|
| `FFMPEG_PATH` / `FFPROBE_PATH` | PATH | Özel ffmpeg/ffprobe yolu |
| `TRANSCRIBE_PROVIDER` | `auto` | `auto` \| `local` \| `openai` |
| `WHISPER_MODEL` | `small` | `tiny`…`large` |
| `WHISPER_PATH` | `whisper` | Yerel whisper yolu |
| `OPENAI_API_KEY` | — | OpenAI Whisper için |

---

## Notlar

- Yüklenen dosyalar, render çıktıları ve üretilen müzik `./.data/` altında tutulur (gitignore'da).
- Hazır müzik parçaları ilk istekte FFmpeg ile **yerel olarak sentezlenir** (telifsiz, basit ambient
  pad'ler) — daha üretilmiş bir şey için kendi parçanızı yükleyin.
- Masaüstü kurgu deneyimi önceliklidir; arayüz koyu, premium ve creator-odaklıdır.

---

Made for **Uçuş Saati Projesi** ✈️
