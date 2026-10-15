# Kiku original browser demo music

These four short instrumental compositions were created specifically for this
portfolio demo. Every tone, bass note and percussion sound is synthesized from
oscillators and seeded noise by `scripts/kiku-simulator/compose-audio.py`.
There are no sampled recordings, external songs, MIDI files or third-party loops.
Track names match the illustrative firmware fixture; the music does not claim
to be an existing artist's recording.

| File | Tempo | Length | Character |
| --- | ---: | ---: | --- |
| afterglow.mp3 | 94 BPM | 20.426 s | Warm electric keys, soft bass and brushed beat |
| paper-satellites.mp3 | 108 BPM | 17.778 s | Glassy, lightly syncopated keys |
| coastal-lines.mp3 | 100 BPM | 19.200 s | Open major harmony and airy melody |
| night-bus-home.mp3 | 82 BPM | 23.415 s | Slower, darker late-night instrumental |

Each is an eight-bar, 44.1 kHz stereo loop, encoded as a gapless 128 kbps MP3.
The checked-in JSON records exact source sample durations. Total download is
about 1.3 MB for all four, with only the selected track downloaded on demand.
Original synthesis has conservative level/headroom; decoding the delivered MP3s
measures approximately 0.1195 RMS and peak levels below 0.73 full scale.

## License and provenance

The original composition definitions, synthesizer implementation and generated
recordings are dedicated to the public domain under CC0 1.0 Universal
(SPDX: CC0-1.0): https://creativecommons.org/publicdomain/zero/1.0/.
To the extent copyright or related rights exist in this generated material,
those rights are waived to the fullest extent permitted by law. No attribution
is required. The synthesis source and this provenance note are retained so the
assets can be audited and regenerated. This does not change licensing of any
firmware, CAD, website code, dependencies, or other assets.

Regenerate with Python, NumPy, SciPy and a local ffmpeg build with libmp3lame:

    python scripts/kiku-simulator/compose-audio.py

These files are browser demonstration music, not captured hardware output, real
FM reception, Bluetooth media, the firmware decoder or a firmware DSP emulator.
