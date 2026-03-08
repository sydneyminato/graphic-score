# Graphic Score — 線を描いて音を鳴らす

**音楽理論は必要ありません。ただ、描いてください。**

## これは何？

このアプリは、画面に線を描くとその通りの音が鳴る実験的な音響ツールです。

ドレミも楽譜も関係ありません。縦軸が周波数（音の高さ）、横軸が時間。描いた線がそのまま音になります。

西洋音楽理論の枠組みを外れて、音を自由にデザインしたい人のために作りました。

## 使い方

1. 画面に指やマウスで自由に線を描く
2. PLAY を押すと描いた線を左から右へなぞりながら音が出る
3. ループ時間（4 / 8 / 16 / 32秒）を選んでループ再生
4. 左のパネルで声部（Voice）を切り替えて複数の線を重ねる
5. 声部ごとに波形（正弦・三角・鋸歯・矩形）を選んで音色を変える
6. 声部ごとにパンポット（左右の定位）を設定してステレオ空間を作る
7. LFO SENS スライダーを上げると、各声部が線の激しさに応じて有機的に揺れ始める
8. 消しゴムツールで描いた線を消して描き直せる
9. SAVE で作品をファイルに保存、LOAD で読み込んで続きを描ける

## 録音する

REC ボタンから録音時間（1分 / 3分 / 5分 / 10分）を選んで録音できます。録音が完了すると .webm 形式のファイルが自動でダウンロードされます。

mp3やWAVに変換したい場合は、無料のオンラインツール https://cloudconvert.com で簡単に変換できます。

## 機能

- ポリフォニック再生 — 最大6声部を同時に鳴らせる
- 4種類の波形 — 正弦波・三角波・鋸歯波・矩形波
- 自由な音高 — 微分音を含む任意の周波数（80Hz〜3200Hz）
- ループ再生 — 4 / 8 / 16 / 32秒から選択
- パンポット — 声部ごとに左右の定位を設定
- LFO生命体システム — 描いた線の激しさを読み取り、6声部がそれぞれ固有の周期・感度で有機的に揺れる
- 録音機能 — 最大10分のループ録音、.webm形式で保存
- 作品の保存・読み込み — JSONファイルで描いた線を保存・再現
- 声部ごとのミュート — 個別にオン・オフ切り替え
- スマホ対応 — タッチ操作で描ける

## 技術

- React + Vite
- Web Audio API（MediaRecorder APIによる録音）
- Vercel でホスティング

---

# Graphic Score — Draw Lines, Make Sound

**No music theory required. Just draw.**

## What is this?

Graphic Score is an experimental sound tool where the lines you draw become sound.

No notes, no scales, no sheet music. The vertical axis represents frequency (pitch), and the horizontal axis represents time. Whatever you draw is played back as sound.

It was created for anyone who wants to design sound freely, outside the boundaries of Western music theory.

## How to use

1. Draw freely on the canvas with your finger or mouse
2. Press PLAY — a playhead moves left to right, reading your drawing as sound
3. Choose a loop duration (4 / 8 / 16 / 32 seconds)
4. Switch between voices in the left panel to layer multiple lines
5. Choose a waveform (sine / triangle / sawtooth / square) per voice to change timbre
6. Set the pan pot per voice to position sounds in the stereo field
7. Raise the LFO SENS slider — each voice begins to organically fluctuate based on the energy of its drawn line
8. Use the eraser tool to erase and redraw
9. SAVE your work as a file, LOAD it later to continue

## Recording

Press the REC button and choose a recording duration (1 / 3 / 5 / 10 minutes). When recording finishes, a .webm file is automatically downloaded.

To convert to mp3 or WAV, use the free online tool https://cloudconvert.com

## Features

- Polyphonic playback — up to 6 simultaneous voices
- 4 waveforms — sine, triangle, sawtooth, square
- Free pitch — any frequency including microtones (80Hz-3200Hz)
- Loop playback — choose from 4 / 8 / 16 / 32 seconds
- Pan pot — position each voice in the stereo field
- Biological LFO system — reads the energy of each drawn line and applies unique LFO rate, depth and inertia per voice
- Recording — loop record up to 10 minutes, saved as .webm
- Save / Load — save your composition as JSON and reload it anytime
- Per-voice mute — toggle each voice independently
- Mobile friendly — draw with touch input

## Tech

- React + Vite
- Web Audio API (recording via MediaRecorder API)
- Hosted on Vercel
