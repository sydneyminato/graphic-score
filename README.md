# Graphic Score — 線を描いて音を鳴らす

**音楽理論は必要ありません。ただ、描いてください。**

---

## これは何？

このアプリは、画面に線を描くとその通りの音が鳴る実験的な音響ツールです。

ドレミも楽譜も関係ありません。縦軸が周波数（音の高さ）、横軸が時間。描いた線がそのまま音になります。

西洋音楽理論の枠組みを外れて、音を自由にデザインしたい人のために作りました。

---

## 使い方

1. 画面に指や マウスで自由に線を描く
2. **PLAY** を押すと描いた線を左から右へなぞりながら音が出る
3. ループ時間（4 / 8 / 16 / 32秒）を選んでループ再生
4. 左のパネルで声部（Voice）を切り替えて複数の線を重ねる
5. 声部ごとに波形（正弦・三角・鋸歯・矩形）を選んで音色を変える
6. 消しゴムツールで描いた線を消して描き直せる

音楽の知識がなくても、誰でも直感的に音を試せます。

---

## 機能

- **ポリフォニック再生** — 最大6声部を同時に鳴らせる
- **4種類の波形** — 正弦波・三角波・鋸歯波・矩形波
- **自由な音高** — 微分音を含む任意の周波数（80Hz〜3200Hz）
- **ループ再生** — 4 / 8 / 16 / 32秒から選択
- **声部ごとのミュート** — 個別にオン・オフ切り替え
- **スマホ対応** — タッチ操作で描ける

---

## 技術

- React + Vite
- Web Audio API
- Vercel でホスティング

---

---

# Graphic Score — Draw Lines, Make Sound

**No music theory required. Just draw.**

---

## What is this?

Graphic Score is an experimental sound tool where the lines you draw become sound.

No notes, no scales, no sheet music. The vertical axis represents frequency (pitch), and the horizontal axis represents time. Whatever you draw is played back as sound.

It was created for anyone who wants to design sound freely, outside the boundaries of Western music theory.

---

## How to use

1. Draw freely on the canvas with your finger or mouse
2. Press **PLAY** — a playhead moves left to right, reading your drawing as sound
3. Choose a loop duration (4 / 8 / 16 / 32 seconds)
4. Switch between voices in the left panel to layer multiple lines
5. Choose a waveform (sine / triangle / sawtooth / square) per voice to change timbre
6. Use the eraser tool to erase and redraw

No musical knowledge needed — anyone can explore sound intuitively.

---

## Features

- **Polyphonic playback** — up to 6 simultaneous voices
- **4 waveforms** — sine, triangle, sawtooth, square
- **Free pitch** — any frequency including microtones (80Hz–3200Hz)
- **Loop playback** — choose from 4 / 8 / 16 / 32 seconds
- **Per-voice mute** — toggle each voice independently
- **Mobile friendly** — draw with touch input

---

## Tech

- React + Vite
- Web Audio API
- Hosted on Vercel
