# Dağıtım (Deploy) Rehberi

Bu uygulama **sunucu tarafı FFmpeg ile render** + **Whisper ile transkripsiyon** + **yüklenen dosyaların istekler arası saklanması** yapar. Bu yüzden dağıtım seçeneğin önemli.

---

## ✅ Önerilen: Konteyner / Sunucu (darboğaz YOK)

**Railway, Render, Fly.io veya bir VPS** — gerçek, sürekli çalışan bir Node sunucusu. FFmpeg image içinde gömülü, disk kalıcı, render süresi sınırsız. Her özellik tam çalışır.

Repo'da hazır bir `Dockerfile` var:

```bash
# Lokal test:
docker build -t ucus-studio ./ucus-editor
docker run -p 5190:5190 -v $PWD/ucus-data:/data \
  -e OPENAI_API_KEY=sk-...  -e TRANSCRIBE_PROVIDER=openai \
  ucus-studio
# → http://localhost:5190
```

**Railway / Render:**
1. Repo'yu bağla, root olarak `ucus-editor` klasörünü seç (veya Dockerfile yolunu göster).
2. Ortam değişkenleri:
   - `OPENAI_API_KEY` = OpenAI anahtarın (Türkçe altyazı için)
   - `TRANSCRIBE_PROVIDER` = `openai`
   - `DATA_DIR` = `/data` (kalıcı disk/volume bağla)
3. Deploy. Bitince public URL'den aç.

> Whisper'ı API yerine sunucuda yerel çalıştırmak istersen Dockerfile'a `pip install openai-whisper` ekleyip `TRANSCRIBE_PROVIDER=local` yap (image büyür, API maliyeti olmaz).

---

## ⚠️ Vercel ile dağıtım (sınırlı — dikkat)

Vercel **serverless** çalışır. Kod Vercel'e uyumlu hale getirildi (FFmpeg `ffmpeg-static` ile gömülü, dosyalar `/tmp`'a yazılır, Whisper OpenAI API ile), AMA serverless'in **yapısal sınırları** var:

| Sınır | Etki |
|------|------|
| Fonksiyon süresi (Hobby 60sn, Pro ~300sn) | Uzun/çok klipli videolarda render **zaman aşımına** uğrayabilir |
| `/tmp` her instance'a özel ve geçici | Yükleme bir instance'ta, export başka instance'ta olursa **dosya kaybolabilir** |
| Paylaşımlı bellek yok | Export iş durumu (`/api/export/[id]`) farklı instance'a düşerse görünmeyebilir |
| Whisper CLI yok | Altyazı **sadece** `OPENAI_API_KEY` ile çalışır |

**Yani:** Vercel kısa demolar / küçük videolar için iş görür; 8–10 klipli gerçek projelerinde darboğaz yaşarsın. Gerçek kullanım için yukarıdaki **Konteyner** yolunu kullan.

Yine de Vercel'e koymak istersen:
1. Proje kökü = `ucus-editor`.
2. Ortam değişkenleri: `OPENAI_API_KEY`, `TRANSCRIBE_PROVIDER=openai`.
3. `vercel.json` zaten fonksiyon sürelerini (Pro planda 300sn) ayarlıyor — **Pro plan** önerilir.
4. Tek seferde 1–3 kısa klip ile dene.

---

## Ortam değişkenleri özeti

| Değişken | Konteyner | Vercel |
|----------|-----------|--------|
| `TRANSCRIBE_PROVIDER` | `local` veya `openai` | `openai` (zorunlu) |
| `OPENAI_API_KEY` | openai ise | zorunlu |
| `DATA_DIR` | `/data` (kalıcı volume) | otomatik `/tmp` |
| `FFMPEG_PATH` / `FFPROBE_PATH` | opsiyonel | otomatik (static) |

Özet: **tam ve sorunsuz çalışması için konteyner/VPS** (Dockerfile hazır). Vercel mümkün ama serverless darboğazlarıyla sınırlı.
