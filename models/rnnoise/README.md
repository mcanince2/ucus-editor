# RNNoise model

`sh.rnnn` is the "somnolent-hogwash" model (speech signal, recording noise)
from https://github.com/GregorR/rnnoise-models, trained for
[RNNoise](https://github.com/xiph/rnnoise) (Xiph.Org, BSD-3-Clause).
The model repository states the model files themselves are not creative
works and are not subject to copyright.

It is used by ffmpeg's `arnndn` filter to remove background noise from the
speech track at export time ("Müzik & Ses → Arka plan gürültüsünü sil").
Override the path with the `RNNOISE_MODEL` environment variable.
