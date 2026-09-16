# 本番配備と運用

## 配備する構成

初期構成は Vercel（Next.js）・Render（常駐通信サーバーとKey Value）・Supabase（PostgreSQL）。同じシンガポール地域に揃え、通信サーバーは1台から開始する。VercelのRoot Directoryは `all-star-quiz`、RenderのBlueprint Pathは `all-star-quiz/render.yaml`。自動配備はRender側で無効にし、検証済みコミットを指定して配備する。VercelのGit連携も本番自動配備を止め、DB変更→通信→Webの順に手動で反映する。

`Dockerfile` は Node 22.22・非rootユーザーで動作する本番用通信イメージを作る。`render.yaml` は常時稼働の `0.5c-512mb`、Redis互換Key Valueの `256mb` を定義する。`noeviction` により負荷増大時に接続チケットの使用済み記録を勝手に破棄しない。メモリ不足時は失敗として扱い、容量増加を判断する。

**クラウドの契約・リソース作成・シークレット設定・公開URLでの最終確認は未実施。これらが終わるまで Issue #27 を完了扱いにしない。**

## 契約前に確認する内容

2026-09-16確認時点の想定は、Vercel Pro 1席・Supabase Pro 1プロジェクト・Renderの通信1台とKey Value1台。Vercelは月$20、Supabaseは月$25から。Renderは通信0.5 CPU/512 MBが月$7で、Key Value料金は契約画面で最終確認する。税・転送量・超過使用料は別途発生しうる。無料サービスへの自動変更や有料アップグレードは行わない。使用するアカウント、月額予算、従量課金の扱いを確定してから作成する。

参照：[Vercel料金](https://vercel.com/pricing)、[Supabase料金](https://supabase.com/pricing)、[Render料金](https://render.com/pricing)、[RenderプランID](https://render.com/docs/compute-plans)。

Vercelからの接続元IPが固定されない構成なので、BlueprintのRedis外部接続は全IPv4から到達可能にし、必ずパスワードとTLSで認証する。資格情報は両サーバーのシークレット管理だけに保存する。接続元IP制限が必要な運用では固定egressの契約・費用を先に決め、`ipAllowList` を具体的な範囲へ置き換える。[Render外部接続](https://render.com/docs/key-value)

## 環境変数と初回配備

両サーバーには次の値を設定する。`.env.example` はローカル専用で、その値を本番へコピーしない。

| 変数                     | 本番の値・注意                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| DEPLOYMENT_ENV           | `production`。VercelのProductionも自動検出                                                                                                      |
| APP_ORIGIN               | 利用者が開く単一の `https://...` Origin。末尾スラッシュなし                                                                                     |
| NEXT_PUBLIC_REALTIME_URL | Renderの公開 `https://...` Origin。Webのビルド時にも必要                                                                                        |
| ALLOWED_ORIGINS          | APP_ORIGINを含む完全一致リスト。ワイルドカード不可                                                                                              |
| DATABASE_URL             | 専用Supabaseプロジェクトのサーバー用接続。`sslmode=require&sslaccept=strict`。Webはpooler利用、必要に応じて `pgbouncer=true&connection_limit=3` |
| DIRECT_URL               | migration用直接接続またはsession pooler。transaction poolerは使用しない。TLS条件は同じ                                                          |
| REDIS_URL                | Renderの外部接続URL `rediss://...`。パスワードを含む。REST URLは不可                                                                            |
| REALTIME_TICKET_SECRET   | 暗号学的乱数で作った32文字以上の値。両サーバーで同じ。開発環境と共有しない                                                                      |
| RATE_LIMIT_ENABLED       | `true`                                                                                                                                          |
| LOG_REQUESTS             | 任意で `true`。本番は省略してもログを出す                                                                                                       |
| PORT                     | Renderが割り当てる待受ポート                                                                                                                    |

Supabaseはこのアプリ専用プロジェクトにする。Prismaのサーバー接続はアプリテーブルの所有者として行い、ブラウザーにDB資格情報やSupabaseのservice role鍵を渡さない。全アプリテーブルでRLSを有効にし、anon/authenticated向けの直接アクセスpolicyは作らない。

1. 有料構成・アカウント・予算を承認後、SupabaseとRedisを作成する。Preview用DB・Redis・鍵は別にする。
2. RenderとVercelの公開ホスト名を確定し、上記の値をそれぞれのシークレット管理に設定する。
3. 全値がある管理環境で `npm run deployment:check`。値自体は出力せず、TLS・Origin・鍵・制限の設定を検査する。本番起動時にも同じ検査を行う。
4. データが既にある場合は配備前バックアップを取得。Renderのpre-deployで `prisma migrate deploy` が成功したことを確認する。`migrate dev`・`db push` は本番で実行しない。
5. Renderの `/health` が200になってから同じコミットをVercelへ配備する。Webの `/api/health` も200になることを確認する。
6. 公開HTTPS URLで独立した2端末から作成・参加・回答・最終結果・履歴まで確認する。不許可Origin、他人の履歴、再接続も確認し、使用コミットと日時を記録する。

## ログ・監視・障害対応

Webは手続き名・HTTPステータス・所要時間・時刻をJSONで出す。回答内容、表示名、Cookie、接続文字列、鍵、IPそのものは記録しない。通信サーバーは起動・期限処理失敗を標準出力へ記録する。Vercel/Renderで5xx・429・再起動数と遅延を確認する。

外部監視に `/api/health` と `/health` を登録し、1分間隔、2回連続失敗で管理者へ通知する。両方ともDBとRedisの応答を確認し、失敗時は503、本文は `{"ok":false}` のみ。RenderのhealthCheckPathは設定済み。外部監視先と通知先は公開URL確定後に管理者の指定先へ設定する。

| 状況                    | 対応                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Redis停止・メモリ不足   | 更新APIは503、接続は切断・再同期。Redisの状態と容量を確認して復旧。既存DBの回答は消さない。全キー削除はしない |
| DB停止・migration不整合 | 新規ゲームの案内を停止し、接続・migrationログ・容量を確認。復旧後に期限ワーカーが未処理ゲームを回収           |
| 通信サーバー停止        | Renderで再起動と `/health` を確認。ブラウザーは再接続・snapshot取得。DB結果が正本                             |
| 429増加                 | 1分待って再試行。異常な操作頻度・共有IPの人数を確認。認証や制限を無効にして回避しない                         |
| 5xx・遅延が継続         | 配備前後のコミットとサービス状態を比較し、必要なら互換性を確認して直前のアプリを再配備                        |

API制限はRedisの原子的カウンターで、部屋作成・管理者ログインは送信元あたり20回/分、参加は120回/分。その他の変更操作は本人あたり120回/分（接続チケットは共通枠）。Vercelの管理する `x-vercel-forwarded-for` だけを送信元として信用する。Vercel以外では送信元不明の共通枠にまとめるため、多人数でself-hostする場合は信頼できるプロキシ識別を別途設計する。Redis停止時は制限対象操作を503で拒否する。既存のSocket.IOの接続チケット・Origin・メッセージ制限も維持する。

## バックアップ・復元・ロールバック

Supabase Proの毎日のバックアップ（7日保持）を基本とし、配備直前にはアプリの `public` スキーマを別途取得する。RPOは通常24時間、配備時は直前バックアップまで。RTOは復元量とサービス再配備に依存するため、実データで復旧訓練して測定する。[Supabaseバックアップ](https://supabase.com/docs/guides/platform/backups)

PostgreSQL 17の `pg_dump` を用意し、シークレット管理から `BACKUP_DATABASE_URL` を環境変数へ設定する。接続文字列をコマンド引数やログへ貼らない。

```sh
npm run db:backup -- /private/backup/quiz-before-deploy.dump
pg_restore --list /private/backup/quiz-before-deploy.dump
```

バックアップはモード0600で新規作成され、既存ファイルを上書きしない。独立した暗号化ストレージへ保存し、アクセス可能な管理者を限定する。名前・成績・画像・セッションハッシュを含むため、GitHubや公開リンクへ添付しない。アプリバックアップにはSupabaseのauth等の管理スキーマは含めない。

復元は元の本番DBへ直接上書きせず、専用の空DBへ行う。新規DBのpublicが空であることを確認して `DROP SCHEMA public`（CASCADEなし）を実行し、`pg_restore --no-owner --no-acl --single-transaction --exit-on-error` で復元する。接続先はPGHOST/PGDATABASE/PGUSER/PGPASSWORD等の環境変数で渡す。履歴件数・画像・RLS・migration状態を確認してから、管理された切替手順でアプリの接続先を変更する。Supabaseの管理バックアップを使う場合は同サービスの復元手順に従う。

`npm run test:backup` はローカルPostgreSQLコンテナに2つの一時DBを作り、実際のバックアップスクリプト・pg_restoreで履歴、画像バイト列、RLSを復元・比較し、一時DBだけを削除する。CIも毎回実行する。

アプリのロールバックでは、直前の検証済みコミットをRender→Vercelの順で再配備する。今回のmigrationはRLS追加で、既存アプリがDB所有者接続なら後方互換。将来のカラム削除等は旧アプリとの互換性を別途確認する。DBを安易に巻き戻すと新しい回答が失われるため、通常は前進修正を優先し、必要な復元は新DBで検証してから切り替える。

## 有効期限と保存期間

ゲストCookieは30日、管理者Cookieは8時間、部屋へのアクセスは24時間。期限切れ・Cookie削除で過去の本人として再認証する機能はない。ゲーム・結果・履歴・問題画像は自動削除せず、管理者が保存要否を判断するまでDBに保持する。容量を月次確認し、削除する場合は対象・保持方針・バックアップを確認してから実施する。Cookie失効とDB削除は別の操作。

## 検証コマンド

```sh
npm ci
npm run security:check
npm run check
docker build -t all-star-quiz-realtime:test .
npx playwright install chromium
QUIZ_E2E_IMAGE=all-star-quiz-realtime:test npm run test:e2e
npm run test:backup
```

コンテナE2Eは本番ビルドのWeb・非rootの通信コンテナ・専用DB/Redis名前空間で全体を検証する。ローカルサービス間はHTTP/TCPを使い、クラウドのTLS・シークレット設定・監視通知の実確認は公開時に別途行う。
