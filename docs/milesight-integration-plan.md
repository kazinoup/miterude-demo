# ミテルデ × Milesight Webhook 連携 実装計画

> **対象**: ミテルデ (温湿度モニタリング SaaS) の Phase F〜G（Webhook 受信・自動配信）以降の実装計画書
> **最終更新**: 2026-05-08
> **状態**: 設計フェーズ。実装着手前の合意ドキュメント。

> **⚠ 重要**: 本ドキュメントの DB スキーマ詳細は [`docs/database-schema.md`](./database-schema.md) に統合されました。
> 全テーブル DDL・RLS 方針・ロール体系（4 階層）は schema 側を正とし、本ドキュメントは
> **Milesight 固有の運用フロー / Webhook 受信仕様 / アラート判定アルゴリズム** にフォーカスします。
> 表記が食い違っている場合は schema 側を優先してください。

---

## 0. このドキュメントの位置付け

ミテルデは現在、React + Vite + localStorage で動作する**フロントエンド完結のモック**です。
Phase F（Webhook 受信）以降では、これを **Milesight Development Platform (MDP) からの Webhook を受信して、リアルタイムに温湿度を監視する本番アプリ**へと進化させます。

本ドキュメントは、その実装に着手する前に**設計と決定事項を文章として固める**ことを目的とします。
実装中はここを起点に作業を進めてください。

> 全体のフェーズ計画（A〜G）は `database-schema.md` の「7. 実装フェーズ」を参照してください。
> 本ドキュメントは Phase F・G（Webhook 受信、アラート判定、通知配信）の詳細仕様を扱います。

---

## 1. ゴール

冷蔵庫・冷凍庫など現場のセンサーから上がってくるデータを、

1. **Milesight MDP → ミテルデ** へ Webhook で受信する
2. 受信データを永続化（PostgreSQL）し、ダッシュボードでリアルタイム表示する
3. 逸脱を検知して通知グループ経由で関係者に通知する
4. 過去データ（CSV インポート）と Webhook で受け取る今後のデータを**シームレスに統合**する
5. **マルチテナント**として複数組織を分離した状態で同時運用できる

---

## 2. 前提と決定事項

ユーザーとの議論で確定した事項：

| 項目 | 決定 |
|---|---|
| **Webhook 受信の所在** | ミテルデ側（ツクルデではなく） |
| **CSV インポート機能** | 残す（旧システム移行 + バックフィル用途） |
| **バックエンド** | **Supabase + Vercel** （A 案） |
| **マルチテナント方式** | 1 テナント = 1 Milesight Application（1:1 マッピング） |
| **未登録センサーの扱い** | Webhook 着信時に**自動で `unassigned` 状態で新規登録**。データは即座に蓄積。命名・割当はユーザーが後から実施 |
| **データ取り込み** | 非同期（`raw_events` で生保管 → 別ジョブが正規化） |
| **アラート設計** | 2 軸：①連続逸脱回数で「**判定**」、②通知グループの timing で「**通知頻度**」 |
| **過去データ** | センサーごとに CSV 過去 + Webhook 現在を時系列で連続表示 |
| **スケール想定** | 将来 1万台規模も視野（要 Edge Function + TimescaleDB） |
| **認証** | Clerk（既にモック化済）+ Supabase Auth との JWT 連携 |
| **配信方式** | Supabase Realtime（WebSocket）でフロント自動更新 |

---

## 3. システム構成

### 3.1 全体図

```
┌──────────────────────────────────────┐
│   Milesight Development Platform     │
│   (MDP)                              │
│                                      │
│   ┌─Application A (= Tenant A)─┐     │
│   │ Devices: EM320-TH × N      │     │
│   │ Webhook URL:               │     │
│   │   …/milesight/{org_a_id}   │     │
│   │ Secret: <random>           │─┐   │
│   └────────────────────────────┘ │   │
│   ┌─Application B (= Tenant B)─┐ │   │
│   │ …                          │─┤   │
│   └────────────────────────────┘ │   │
└──────────────────────────────────┼───┘
                                   │ HTTPS POST (JSON)
                                   ▼
            ┌──────────────────────────────────────────┐
            │  Vercel API Route (Edge Runtime)         │
            │  POST /api/webhooks/milesight/[org_id]   │
            │  - Header: X-Webhook-Secret 検証         │
            │  - idempotency_key で重複排除            │
            │  - webhook_inbox に INSERT のみ          │
            │  - **即 200 OK 返却**                    │
            └──────────────────┬───────────────────────┘
                               │
                               ▼
            ┌──────────────────────────────────────────┐
            │  Supabase Postgres                       │
            │  ┌────────────────┐                      │
            │  │ webhook_inbox  │ ← 全 payload を生で  │
            │  │ (payload_raw)  │   保管               │
            │  └────────┬───────┘                      │
            │           │ Edge Function (cron 1min)    │
            │           ▼                              │
            │  ┌────────────────────────┐              │
            │  │ sensor_readings        │ ← 時系列     │
            │  │ sensors                │   (bigint    │
            │  │ gateway_status_events  │    identity) │
            │  └────────┬───────────────┘              │
            │           │ Realtime Channel (WebSocket) │
            │           ▼                              │
            │  ┌──────────────────┐                    │
            │  │ alert_logs       │ ← 判定結果を       │
            │  │                  │   フラットに蓄積   │
            │  └────────┬─────────┘                    │
            │           │                              │
            │           ▼                              │
            │  ┌──────────────────────┐                │
            │  │ Alert Evaluator      │                │
            │  │ Notif Dispatcher     │ → メール/Slack/│
            │  │ (cron 1min)          │   Webhook      │
            │  │ → notification_      │                │
            │  │   dispatches         │                │
            │  └──────────────────────┘                │
            └──────────────────┬───────────────────────┘
                               │
                               ▼
            ┌──────────────────────────────────────────┐
            │  ミテルデ フロントエンド (React + Vite)   │
            │  - Vercel Static Hosting                 │
            │  - Supabase JS Client (Realtime 購読)    │
            │  - Clerk 認証                            │
            └──────────────────────────────────────────┘
```

### 3.2 採用技術と理由

| 層 | 採用 | 理由 |
|---|---|---|
| **フロント** | React 19 + Vite（既存）+ Vercel | 既存資産を活かす。Vercel デプロイは1コマンド |
| **API** | Vercel API Route（Edge Runtime） | Webhook 受信に最適。コールドスタート短い、グローバル分散 |
| **DB** | Supabase（PostgreSQL + TimescaleDB extension） | 時系列 + RLS + Realtime + Auth が1パッケージ |
| **認証** | Clerk（org 機能）+ Supabase JWT 検証 | Clerk は既存。Supabase RLS と JWT で連携可能 |
| **リアルタイム配信** | Supabase Realtime（WebSocket） | postgres 行変更を即フロントへ。自前実装ゼロ |
| **非同期処理** | Supabase Edge Function + pg_cron | 軽量、Postgres にネイティブ統合 |
| **将来のキュー（10万台超想定）** | Inngest または QStash の検討余地 | Phase 15 以降 |

---

## 4. データベーススキーマ — 概要

> **詳細な DDL・全テーブル定義は [`docs/database-schema.md`](./database-schema.md) を参照。**
> 本セクションは Milesight 連携の文脈で関わるテーブルの位置づけだけ抜粋する。

### 4.1 Milesight 連携で主に触れるテーブル

| テーブル | 役割（Milesight 連携の観点） |
|---|---|
| `organizations` | テナント（1 org = 1 Milesight Application） |
| `manufacturer_integrations` | Milesight / IoT Mobile 連携設定。Webhook secret、有効/無効、`config jsonb`（Milesight 双方向 API 用 client_id 等もここに） |
| `sensors` | センサーマスタ。`serial_number`（DevEUI 相当）と `name` を持つ。命名状態は `name IS NULL` で「未割り当て」と判定 |
| `gateways` | ゲートウェイマスタ。`external_id` に Milesight 側の MAC を入れる |
| `webhook_inbox` | **Webhook 生 payload 保管。冪等性キーで重複排除**。Milesight 連携の入り口 |
| `sensor_readings` | 正規化された時系列計測（bigint identity）。webhook_inbox から Edge Function でパースして INSERT |
| `gateway_status_events` | ゲートウェイの online/offline 遷移履歴 |
| `alert_logs` | 判定結果のフラットなイベントログ。連続逸脱の状態管理は **このテーブルから動的に算出** する設計（独立した state テーブルは持たない） |
| `notification_dispatches` | 通知配信履歴。`alert_log_ids[]` でまとめ送信のスナップショットを保持 |
| `notification_groups` / `notification_channels` | 配信先（メール/Slack/Webhook） |
| `dashboards` / `widgets` | ダッシュボード（既存） |
| `dashboard_checkins` + `_sensor_comments` + `_segment_comments` | 確認記録。`alert_logs.confirm_comment` への伝搬元 |

### 4.2 Milesight 連携で「特殊な」設計判断

- **`manufacturer_integrations` の `config jsonb`** に Milesight 固有設定（`app_name` / `client_id` / `client_secret` / `server_address` 等）を入れる。
  メーカー別に専用テーブル（旧 `milesight_applications`）を作らず、JSONB で柔軟に持つ方針。
- **「未割り当てセンサー」の判定**: 旧設計では `sensor_status` enum を持っていたが、現スキーマでは
  `sensors.name IS NULL`（ユーザー命名がない状態）を「未割り当て」と扱う。`name` を設定した瞬間に「割り当て済」となる。
- **アラート状態管理**: 旧設計では `alert_states` + `alerts` の二段構成だったが、現スキーマでは
  `alert_logs` の単一テーブルにフラット化。連続逸脱の判定状態（連続カウンタ等）は
  Edge Function（or アプリ層）が `alert_logs` を SELECT して算出する。
- **TimescaleDB**: 当面は通常の Postgres + `bigint identity` で運用。月数百万行を超える規模になったら
  `sensor_readings` を partitioned table（`PARTITION BY RANGE (measured_at)`）に切り替え検討。

### 4.3 RLS について

詳細は `database-schema.md` の「4. RLS 方針」を参照。
**Webhook 受信 API は service_role キー**で動作させ、RLS をバイパスする
（テナント分離は URL の `org_id` + secret 検証で担保）。

---

## 5. Webhook エンドポイント仕様

### 5.1 URL 設計

```
POST https://app.miterude.example.com/api/webhooks/milesight/{org_id}
Content-Type: application/json
Header: X-Webhook-Secret: <secret>
Body: <Milesight-formatted JSON>
```

- `org_id`: ミテルデ内の `organizations.id` (UUID)
- `X-Webhook-Secret`: テナントごとに発行されたシークレット。`manufacturer_integrations.webhook_secret`（manufacturer='Milesight' の行）と照合
- リクエストボディは Milesight が決める形式（実物の JSON 構造は探索フェーズで把握）

### 5.2 受信ハンドラの責務（最小化）

```
1. Header の secret 検証 → 不一致なら 401
2. body から idempotency_key を算出
   ┌ event_id があれば: hash(org_id, event_id)
   └ なければ:           hash(org_id, payload全体, received_minute)
3. webhook_inbox に INSERT (重複なら ON CONFLICT DO NOTHING)
   - manufacturer = 'Milesight'
   - payload_raw = body
   - parse_status = 'pending'
4. 200 OK を即返却
   ※パース・正規化・アラート評価は一切行わない
```

> **冪等性の実装**: `webhook_inbox` には `unique (organization_id, payload_raw->>'event_id')` 等の
> 部分インデックスを追加するか、もしくは `idempotency_key` 列を追加して unique 制約を貼る方式を検討。
> マイグレーション SQL 起こす段階で確定する。

これにより応答時間は概ね**100ms以下**に抑える。Milesight 側のタイムアウトと再送ループを回避。

### 5.3 受信レスポンス

```
HTTP/1.1 200 OK
Content-Type: application/json

{ "ok": true }
```

400/401/500 を返すと Milesight 側がリトライしてくる。重複は冪等性で排除されるので問題なし。

---

## 6. マルチテナント運用フロー

### 6.1 想定される運用ステップ

ユーザー（自社）が新規組織を導入するときのフロー：

```
1. [自社] Clerk で組織を作成 → ミテルデにテナントが生まれる
2. [自社] MDP で Application を新規作成（テナント名と同じ名前）
3. [自社] MDP の "Devices" にセンサー（EM320-TH, UG65 等）を追加し、
          作成した Application に割り当て
4. [自社] ミテルデ管理画面の「設定 → デバイス連携 → Milesight」に行き、
          そのテナント用の **Webhook URL** と **Secret** を取得
5. [自社] MDP の Application Settings に
          - Callback URI を貼り付け
          - Secret を貼り付け（双方向に同じ値）
          - Webhook を Enable
          - 「Test」ボタンで疎通確認 (WEBHOOK_TEST が来る)
6. [自社] センサーの電源を入れて、ゲートウェイ経由で MDP に登録
7. [自動] MDP がセンサーデータを Webhook で送信開始
8. [自動] ミテルデが受信、未登録なので sensors に
          `name=NULL`（= 未割り当て）で自動登録、sensor_readings に蓄積開始
9. [顧客] ミテルデの「未割り当てセンサー」一覧（`name IS NULL` でフィルタ）から、
          DevEUI/シリアル番号を見て "3F 肉用冷蔵庫" などと命名
10. [顧客] 命名済センサーをダッシュボードに紐付けて運用開始
```

### 6.2 自社が管理するもの・顧客が管理するもの

| 管理者 | 担当範囲 |
|---|---|
| **自社（オペレーター）** | MDP のデバイス・アプリケーション登録、ハードウェア発送、ミテルデのテナント初期作成 |
| **顧客（テナント管理者）** | 未割当センサーの命名・ダッシュボード作成・通知設定・確認運用 |

これにより**顧客が自由にデバイスを追加できないが、運用に必要な操作は顧客側で完結**する設計になる。

---

## 7. アラート設計（2 軸）

### 7.1 設計の2軸

| 軸 | 設定の所在 | 役割 |
|---|---|---|
| **判定** | センサーの `alert_settings.deviationConsecutiveCount` | 連続 N 回の逸脱で初めてアラート確定 |
| **通知** | 通知グループの `timing` | 即時/1h/6h/12h/24h でまとめ送信 |

### 7.2 判定アルゴリズム

> **設計変更**: 旧設計の `alert_states` + `alerts` 二段構成を廃止し、
> `alert_logs` の単一テーブルにフラット化。連続カウンタは
> Edge Function 内のメモリ or `alert_logs` を SELECT して動的算出する。

```
[新しい sensor_readings INSERT]
        ↓
[逸脱判定]
   reading.value vs sensors.thresholds（個別閾値）
        ↓
[直近 N 件の連続逸脱をカウント]
   - 同センサー × 同 metric の sensor_readings を
     occurred_at desc で N 件 SELECT
   - 連続して逸脱しているか確認
        ↓
[アラート確定判定]
   if (連続逸脱 >= sensor.alert_settings.deviationConsecutiveCount
       AND 直近の alert_logs に同じセンサー×種別の未解消 'deviation-alert'
       が既に存在しない):
       → alert_logs に INSERT (kind='deviation-alert' or 'deviation-warn')
         - notification_status='pending'
         - confirm_comment は確認時に後追いで埋まる

   オフライン判定（cron で定期実行）:
       - sensors.last_seen_at が
         alert_settings.offlineThresholdMinutes を超過 →
         alert_logs に INSERT (kind='offline')

   バッテリー判定（reading 到着時）:
       - sensor_readings.battery <
         sensor.alert_settings.batteryThresholdPercent →
         alert_logs に INSERT (kind='battery')
```

> **「解消」イベントの扱い**: 現スキーマでは `alert_logs` は基本「発生」のみを記録する。
> 解消通知が必要な場合は `kind='deviation-resolved'` を将来追加するか、
> 直近の deviation-alert/warn が一定時間続かなかったら自動解消とする運用を採用。

### 7.3 通知ディスパッチ

```
[1分おきに動く cron ジョブ]
   alert_logs を notification_status='pending' で SELECT
        ↓
   通知グループの timing で scheduled_for を決定
        ↓
   通知グループの送信先（メール/Slack/Webhook）に
   alert_log_ids[] にひも付くアラートを集約してまとめ送信
        ↓
   notification_dispatches に履歴 INSERT
   alert_logs.notification_status='sent', notified_at=now()
```

タイミングごとの動作（`notification_groups.timing` で指定）:

| timing | scheduled_for の決め方 |
|---|---|
| `immediate` | アラート発生時刻 |
| `batch-1h` | 次の正時 (例: 14:23 → 15:00) |
| `batch-6h` | 0/6/12/18 時の次の到来時刻 |
| `batch-12h` | 0/12 時 |
| `batch-24h` | 翌 0 時 |

---

## 8. CSV インポートとの共存

### 8.1 統合方針

- CSV は**過去データの取り込み専用**として残す（移行用途）
- フロントから直接 Supabase の `sensor_readings` に書き込み
- センサーが既存なら `serial_number`（DevEUI 相当）をキーに紐付け、無ければ自動生成（CSV ファイル名 → `sensors.name`）

### 8.2 重複排除

- `sensor_readings (sensor_id, measured_at)` 部分ユニークインデックス（または upsert ロジック）で二重登録を防ぐ
- 既存行があれば skip（CSV 再インポート時の二重登録を防ぐ）

### 8.3 データソース判定

`sensor_readings.source_inbox_id` が NULL なら CSV、非 NULL なら Webhook 由来。
グラフは `measured_at` 順で連続表示するので、データソースが混在しても問題なし。

---

## 9. フロントエンド改修

### 9.1 既存資産の流用

Phase 1〜9 で作った React コンポーネント・型定義は**ほぼそのまま流用**できる：

- `DeviceStore`, `SensorStore`, `Dashboard`, `Widget` 型
- ダッシュボード・タイル・グラフ・マップ・逸脱ピックアップウィジェット
- アラート設定・通知グループ
- 確認チェックイン・運用メモ
- レポート出力

### 9.2 データレイヤの差し替え

現状は `src/lib/storage.ts` に集約された **テナントスコープ付き localStorage**
（キー: `miterude:tenant:<orgId>:state:v4`）で動作している。Phase A-1 でこの分離は完了済み。
本フェーズでは、ここを Supabase 経由に切り替える：

```ts
// 既存: src/lib/storage.ts （テナントスコープ付き localStorage）
loadState(orgId) / saveState(orgId, state)
   ↓ 置換
// 新規: src/lib/supabaseClient.ts + 各 store の fetch/upsert
- Supabase クライアント初期化（Clerk JWT を渡す）
- 各テーブルへの fetch/insert/update（RLS が org_id を担保）
- Realtime 購読 (subscribe)
```

### 9.3 Realtime 購読

```ts
// sensor_readings の INSERT を購読してウィジェットを即時更新
supabase
  .channel('sensor-readings')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'sensor_readings',
      filter: `organization_id=eq.${orgId}` },
    (payload) => {
      // React state を更新 → 各ウィジェットが即時再レンダリング
    }
  )
  .subscribe()

// alert_logs の INSERT も購読してアラート一覧／バッジを更新
supabase
  .channel('alert-logs')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'alert_logs',
      filter: `organization_id=eq.${orgId}` },
    (payload) => { /* … */ }
  )
  .subscribe()
```

### 9.4 「未割り当てセンサー」UI

サイドバー左下に新バッジ：

```
┌────────────────────────────┐
│ 登録センサー  27   [+]     │
│ 未割り当て   3 件 ⚠       │ ← クリックで未割り当てリストへ
└────────────────────────────┘
```

センサー一覧画面に「未割り当て」フィルタ（`sensors.name IS NULL`）を追加。
各行に「**割り当てる**」ボタン → 名称入力 + ダッシュボード紐付けモーダル
（`name` を設定した瞬間に「割り当て済」となる）。

---

## 10. 実装ステップ

> **位置づけ**: 全体フェーズ計画 A〜G は `database-schema.md` の「7. 実装フェーズ」を参照。
> 本セクションは Phase F（Webhook 受信）〜 Phase G（アラート判定 / 通知配信）の **詳細手順** を扱う。
> マルチテナント（Phase A）/ 設定移行（Phase B〜D）/ ダッシュボード（Phase E）はここでは前提とする。

### Phase F-1: バックエンド基盤（Supabase + Vercel 接続）

**目的**: Supabase + Vercel の土台を作り、Clerk と接続する。

**作業項目**:
1. Supabase プロジェクト作成（dev / production の2環境）
2. `database-schema.md` の DDL を順次適用（tenancy → settings → devices → dashboards → public sharing → data/logs の順）
3. RLS ポリシー作成（`database-schema.md` の「4. RLS 方針」参照）
4. Clerk-Supabase JWT 連携設定
   - Clerk Dashboard で Supabase JWT Template を作成
   - Supabase の Auth 設定で Clerk の JWKS URL を登録
5. Vercel プロジェクト作成
6. ミテルデの React コードを Vercel デプロイ（既存資産そのまま）
7. 環境変数設定（後述「環境変数」参照）
8. `app/api/webhooks/milesight/[org_id]/route.ts` の枠組みを作る（中身はまだダミー）

**完了条件**:
- Supabase ダッシュボードで全テーブルが見える
- Vercel に React がデプロイされ、URL でアクセスできる
- フロントから Supabase に test クエリが通る（自テナントのデータのみ見える）

**リスク**:
- Clerk の org 機能はプランによって制限あり → 事前に確認

---

### Phase F-2: Webhook 受信エンドポイント（探索フェーズ）

**目的**: ペイロード構造を把握する前に、生ペイロードを保管できる状態にする。

**作業項目**:
1. `POST /api/webhooks/milesight/[org_id]` を実装
   - Header `X-Webhook-Secret` を `manufacturer_integrations.webhook_secret`
     （該当 org × `manufacturer='Milesight'` の行）と照合
   - body から `idempotency_key` を生成
   - `webhook_inbox` に INSERT（ON CONFLICT DO NOTHING、`parse_status='pending'`）
   - 200 OK 即返却
2. `WEBHOOK_TEST` を判別してログに「テスト成功」を出力
3. ミテルデ管理画面の「設定 → デバイス連携 → Milesight」を実機能化
   - Webhook URL を実際の値で表示（コピー可能）
   - Secret を生成・再発行できる（`manufacturer_integrations.webhook_secret` を更新）
   - 過去の生イベントログをタイル表示（`webhook_inbox` 直近 50 件）
4. **テスト実行**:
   - 自社 Milesight Demo App から Test 送信
   - 実センサー 1〜2 台を 24 時間稼働
5. `webhook_inbox.payload_raw` を眺めて構造をリバースエンジニアリング

**完了条件**:
- 24 時間稼働させて `webhook_inbox` に 50+ 行ある
- WEBHOOK_TEST / DEVICE_DATA / PROPERTY / EVENT / ONLINE / OFFLINE の構造把握
- 同じ event_id が再送されても重複が入らない

**リスク**:
- Milesight ペイロードの公式スキーマが存在しないため、想定外のフィールドが将来追加される可能性
  → `webhook_inbox` で生保管しているので後追いで対応可能

---

### Phase F-3: パーサと永続化

**目的**: 実データを正規化テーブル（`sensor_readings` / `gateway_status_events`）に反映する。

**作業項目**:
1. **Edge Function `process_webhook_inbox`** を作成
   - cron で 1 分おき実行（pg_cron）
   - `parse_status='pending'` の行を最大 N 件取得して処理
   - 処理後は `parse_status='processed'`（失敗時は `'failed'` + `parse_error`）
2. **イベント別パーサ**:
   - `WEBHOOK_TEST` → `parse_status='processed'` 更新してスキップ
   - `DEVICE_DATA / PROPERTY` → `sensor_readings` に INSERT
     - `serial_number` (= DevEUI) でセンサー検索、無ければ自動登録
     - `source_inbox_id` に元の `webhook_inbox.id` を保持（再処理識別用）
   - `DEVICE_DATA / EVENT` → 必要に応じ `alert_logs` に直接 INSERT
   - `ONLINE / OFFLINE` → `gateways.online_status` 更新 + `gateway_status_events` に履歴 INSERT
3. **未登録センサーの自動登録**:
   ```sql
   insert into sensors (organization_id, serial_number, model, name)
   values ($org, $eui, $model, NULL)  -- name=NULL が「未割り当て」を意味する
   on conflict (organization_id, serial_number) do update
     set last_seen_at = excluded.last_seen_at
   returning id;
   ```
4. **未割り当て一覧画面** をフロントに追加（センサー一覧画面のフィルタ `name IS NULL`）
   - 各行に「**割り当てる**」ボタン → 名称入力 + ダッシュボード紐付けモーダル

**完了条件**:
- 実センサー 2 台が流したデータが `sensor_readings` に正規化されている
- 未登録 EUI で来たセンサーが `sensors` に `name=NULL` で並ぶ
- フロントの「未割り当て」フィルタにそれが表示される
- 割り当て後（`name` 設定後）、ダッシュボードで通常表示される

**リスク**:
- パーサのバグでデータが歪む → `webhook_inbox` から再処理可能な設計を死守
  （`parse_status` を `'pending'` に戻せば `process_webhook_inbox` が再実行する）

---

### Phase F-4: フロントエンドの Supabase 接続

**目的**: 現在テナントスコープ付き localStorage で動いているフロントを Supabase に切り替える。

**作業項目**:
1. **`src/lib/supabaseClient.ts` 新規作成**: クライアント初期化、認証、CRUD ヘルパ
2. **`src/lib/storage.ts` の `loadState/saveState` を Supabase 経由に置換**
   - 各 store（sensors, gateways, dashboards, widgets, notification_groups …）を Supabase テーブルから fetch
   - 変更時は upsert（RLS が `organization_id` を担保）
3. **Supabase Realtime 購読**:
   - `sensor_readings` の INSERT を購読 → 該当センサーの最新値を更新
   - `sensors`, `alert_logs`, `gateway_status_events` の変更も購読
4. **CSV インポートを Supabase 直接書き込みに変更**
   - フロントから `sensor_readings` に bulk insert
   - 既存の sensor が無ければ自動生成、`source_inbox_id=NULL` のまま（CSV 由来の印）
5. **過去 CSV + Webhook の連続グラフ確認**（`measured_at` で並べるだけで自動的に統合される）

**完了条件**:
- ブラウザのリロードで状態が消えない（Supabase に保存されている）
- 別タブで開くと同じテナントの状態が共有される
- センサーのデータが Webhook で更新されると、ダッシュボードが自動再描画される

**リスク**:
- Realtime 購読の数が多すぎるとブラウザ側の負荷増 → ウィジェット単位ではなくダッシュボード単位で集約購読

---

### Phase G-1: アラート評価と通知配信

**目的**: 2 軸（連続逸脱判定 + 通知タイミング）の判定・配信ロジックを実装。

**作業項目**:
1. **アラート評価関数**（Edge Function、`sensor_readings` INSERT 後 or 1 分 cron）
   - 直近 N 件の `sensor_readings` を SELECT して連続逸脱をカウント
   - 連続カウンタ ≥ `sensor.alert_settings.deviationConsecutiveCount` かつ
     直近に未解消の同種 `alert_logs` がない → `alert_logs` に INSERT
     （`kind='deviation-alert'` または `'deviation-warn'`、`notification_status='pending'`）
   - オフライン判定（cron 別系統）: `sensors.last_seen_at` 超過 → `alert_logs` に `kind='offline'`
   - バッテリー判定（reading 到着時）: `sensor_readings.battery` < 閾値 → `alert_logs` に `kind='battery'`
2. **通知ディスパッチャ**（cron 1 分おき Edge Function）
   - `alert_logs` で `notification_status='pending'` の行を集約
   - 通知グループの `timing` で `scheduled_for` を決定
   - `scheduled_for <= now()` のものをメール（Resend）/ Slack / Webhook に集約送信
   - `notification_dispatches` に履歴 INSERT（`alert_log_ids[]` でスナップショット保持）
   - 対応する `alert_logs.notification_status='sent'`, `notified_at=now()` に更新
3. **設定 UI の整合**:
   - センサーのアラート設定に「N 回連続で逸脱したらアラート発動」を明示（既存 `alert_settings` から）
   - 通知グループ側に「タイミング」を明示（既存）
4. **テスト**: 閾値を超える reading を流して、設定回数連続で発火することを確認

**完了条件**:
- テスト用閾値で `deviationConsecutiveCount=3` に設定 → 3 回連続で逸脱した瞬間に `alert_logs` 行が増える
- 通知グループの timing が `batch-1h` なら次の正時に `notification_dispatches` 行が増えメールが届く
- 解消時の扱いは 7.2 注記の方針に従う（`deviation-resolved` 追加 or 自動解消運用）

**リスク**:
- 通知重複（同じアラートに対して複数通知）→ `notification_dispatches.alert_log_ids[]` で送信済みを判定

---

### Phase G-2: 運用堅牢化とスケール準備

**目的**: 1 万台規模で動くように、運用品質を上げる。

**作業項目**:
1. **Webhook 受信のスケーリング**:
   - Vercel API Route を Edge Runtime に
   - レート制限（IP 単位 + テナント単位）
2. **Postgres チューニング**:
   - `sensor_readings` のパーティション化（`PARTITION BY RANGE (measured_at)`、月単位）
   - 必要なら TimescaleDB extension に切り替え（hypertable + 自動圧縮）
   - データ保持ポリシー（`webhook_inbox` 90 日、`sensor_readings` 無期限 or 集計後アーカイブ）
3. **障害対策**:
   - パース失敗 → `webhook_inbox.parse_status='failed'`, `parse_error` に記録、Slack に通知
   - 死活監視ダッシュボード（Webhook 成功率、パース成功率、未送信通知数）
4. **シークレット再発行**: Phase F-2 で UI を作った再発行ボタンを実機能化
5. **ロギング**: Vercel Logs / Supabase Logs / Sentry など
6. **バックアップ**: Supabase の Point-in-Time Recovery 有効化

**完了条件**:
- 1 万件/分の負荷テストでエラーが発生しない
- 監視ダッシュボードで成功率を可視化できる

---

## 11. テスト戦略

### 11.1 各 Phase での動作確認

| Phase | 確認方法 |
|---|---|
| F-1 | ローカルで Supabase クライアントから自テナント行の select が通る（RLS 確認） |
| F-2 | curl で偽の WEBHOOK_TEST を送り、`webhook_inbox` に `parse_status='pending'` で行が入る |
| F-2 | 同じ idempotency_key で連続送信、行が増えない |
| F-3 | 実センサーから 1 時間データを流し、`sensor_readings` に正しく入る（`source_inbox_id` あり） |
| F-3 | 未登録 EUI を擬似送信、`sensors` に `name=NULL` 行が増える |
| F-4 | 別ブラウザで同じテナントを開き、Webhook 着信時に両方で更新される（Realtime 確認） |
| G-1 | 閾値超え reading を 3 回連続で送信、`alert_logs` に `kind='deviation-alert'` 行が増える |
| G-1 | 通知グループ `timing='batch-1h'` で発火、次の正時に `notification_dispatches` が増えメール到達 |
| G-2 | 1 万件/分の負荷を JMeter / k6 で流し、エラー率 0 を確認 |

### 11.2 自動テスト

- **単体**: パーサ関数（payload → sensor_readings）の Vitest
- **統合**: Webhook 受信 → `sensor_readings` 反映までの E2E（Supabase test instance）
- **回帰**: 過去 `webhook_inbox` を `parse_status='pending'` にリセットして再処理しても、
  同じ `sensor_readings` が生成されることを保証（idempotent な再処理）

---

## 12. 残課題・次の決定事項

実装に入る前に、以下を決める必要があります：

| 項目 | 選択肢 |
|---|---|
| **ビルド構成** | (a) Vite + Vercel API Routes（既存資産流用、軽量） / (b) Next.js に移行（フルスタック標準だが移行工数大） |
| **メール送信** | (a) Resend（モダン、TypeScript SDK 良） / (b) SendGrid / (c) AWS SES |
| **Slack 連携** | (a) Incoming Webhook（簡単） / (b) Bolt SDK（高機能） |
| **Sentry / 監視** | 入れるか / 入れるならどのプラン |
| **CI/CD** | GitHub Actions + Vercel Preview デプロイ |
| **環境分離** | dev / staging / production の運用方針 |
| **ドメイン** | `app.miterude.example.com` などの本番ドメインを決める |

私の推奨：
- **ビルド構成: Vite + Vercel API Routes**（移行コスト最小、既存資産そのまま）
- **メール: Resend**（DX が良い、Vercel と相性◎）
- **Slack: Incoming Webhook**（要件として十分）
- **監視: Sentry の Free プラン**（フロント・バックエンドの例外捕捉）

---

## 付録 A: 環境変数

開発・本番で必要な環境変数：

```env
# ----- Supabase -----
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # サーバー側のみ。Webhook 受信処理で使用

# ----- Clerk -----
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
CLERK_JWT_SIGNING_KEY=...           # Supabase JWT 検証用

# ----- メール (Resend) -----
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=alerts@miterude.example.com

# ----- Webhook 受信 -----
WEBHOOK_LOG_LEVEL=info
WEBHOOK_RATE_LIMIT_PER_MINUTE=600
```

---

## 付録 B: 用語集

| 用語 | 意味 |
|---|---|
| **MDP** | Milesight Development Platform。センサー・ゲートウェイの管理 PaaS |
| **DevEUI** | Milesight デバイスの一意ID（24E124... のような16桁HEX）。`sensors.serial_number` に格納 |
| **EM320-TH** | Milesight 製の温湿度センサー（冷蔵庫・冷凍庫向け） |
| **UG65 / UG63** | Milesight 製のメインゲートウェイ / 中継パケットフォワーダー |
| **Webhook** | MDP がイベント発生時にミテルデに HTTP POST を送る仕組み |
| **テナント** | 1 顧客組織 = 1 `organizations` 行 = 1 Clerk Organization = 1 Milesight Application |
| **未割り当て** | センサーが自動登録されたが、ユーザーが命名・ダッシュボード紐付けをしていない状態（`sensors.name IS NULL`） |
| **逸脱判定** | reading が閾値を超えること。連続回数で `alert_logs` に昇格 |
| **アラート** | `alert_logs` の単一行（kind=deviation-alert / deviation-warn / offline / battery）。状態は別テーブルを持たず動的算出 |
| **通知ディスパッチ** | `alert_logs` を集約して通知グループ経由で外部（メール等）に送る処理。履歴は `notification_dispatches` |
| **冪等性** | 同じ操作を何度繰り返しても結果が同じになる性質。Webhook 再送対策（`webhook_inbox` の重複排除キー） |
| **RLS** | Row Level Security。Postgres のテナント分離機能（`organization_id` でフィルタ） |

---

## 付録 C: 参考リンク

- [Milesight Development Platform](https://sg-cloud.milesight.com/)
- [Supabase Docs](https://supabase.com/docs)
- [Supabase TimescaleDB extension](https://supabase.com/docs/guides/database/extensions/timescaledb)
- [Vercel Edge Functions](https://vercel.com/docs/functions/edge-functions)
- [Clerk + Supabase Integration](https://clerk.com/docs/integrations/databases/supabase)
- [Resend](https://resend.com/)

---

## 付録 D: チェックリスト（着手前）

実装に入る前に、以下が決まっていることを確認：

- [ ] Supabase プロジェクトのアカウント・プラン確定
- [ ] Vercel アカウント・プラン確定
- [ ] Clerk のプラン（org 機能を使うため Pro 以上が必要な可能性）
- [ ] Milesight Developer Account を持っている（テスト用）
- [ ] 本番ドメイン（`app.miterude.example.com` 等）の取得
- [ ] DNS の設定権限
- [ ] HTTPS 証明書（Vercel が自動発行）
- [ ] 自社が管理するテスト用センサー（EM320-TH × 1〜2 台、UG65 × 1 台）
- [ ] 監視サービス（Sentry など）のアカウント
- [ ] メール送信サービス（Resend など）のアカウントと送信元ドメイン認証

---

## 変更履歴

| 日付 | 内容 |
|---|---|
| 2026-05-05 | 初版作成（Phase 1〜9 完了後の設計合意） |
| 2026-05-08 | `database-schema.md` との整合性を取り、テーブル名・概念を統一。<br>主な変更: `raw_events` → `webhook_inbox` / `readings` → `sensor_readings` / `milesight_applications` → `manufacturer_integrations` / `alert_states + alerts` → `alert_logs`（フラット化）/ `device_eui` → `serial_number` / `sensor_status` enum → `name IS NULL` 規約。Phase 番号も A〜G 体系（F-1〜G-2）に再編。 |
