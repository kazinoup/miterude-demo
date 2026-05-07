# 対応デバイス画像

設定画面の「対応デバイス」タブで使う製品画像を配置するフォルダ。

## 命名規則

`{manufacturer}-{model}.png` を小文字・ハイフン区切りで使う。

例:
- `milesight-em320-th.png`
- `milesight-am102.png`（対応予定: 室内用温湿度センサー）
- `milesight-ug65.png`
- `milesight-ug63.png`

`src/lib/supportedDevices.ts` の `imageUrl` フィールドが
`/devices/{ファイル名}` を参照する形になっている。

## 推奨フォーマット

- 形式: PNG（透過）または JPG
- アスペクト比: 4:3 〜 16:9（横長推奨）
- 解像度: 横 600〜1000px 程度
- 背景: 透過 or 白
- 容量: 1 ファイル 200KB 程度を目安

## 画像が無いとき

`imageUrl` が未設定 or 404 のとき、カードは種別アイコン
（センサーなら Cpu、ゲートウェイなら Router）にフォールバックする。
