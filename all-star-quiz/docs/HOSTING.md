# 配備構成（ADR-002）

2026-09-11 / Issue #2。実際のクラウド配備は #27、認証付き通信は #10。

## 決定

Next.jsの画面・HTTP APIをVercel、Socket.IOと締切ワーカーを独立した常駐Node.jsコンテナに配置する。PostgreSQL（Supabase）を正本、Redisを共有状態・配信・処理調停に使う。初期コンテナ配備先はRenderの常時稼働Web Serviceとする。停止する無料インスタンスは本番対戦に使用しない。予算・アカウントは配備時に確認し、今回は契約しない。

Vercelの現行資料ではWebSocketとSocket.IOのWebSocket transportがBetaで利用可能。ただし接続はFunctionの最大実行時間で切れる。本アプリは10秒締切とゲームをまたぐ接続を扱うため、v1ではプロセス寿命を管理できる独立サーバーを選ぶ。「VercelはWebSocket非対応」という旧前提は使用しない。

根拠: [Vercel WebSockets](https://vercel.com/docs/functions/websockets)。Next.js 15のRoute Handlerに常駐Socket.IOを直接埋め込む構成は採用しない。

## 接続とデータの責任

| 接続 | 用途・認証 |
|---|---|
| ブラウザー → Vercel HTTPS | ルーム／認証／問題管理。HttpOnlyの同一ホストCookie |
| ブラウザー → realtime HTTPS/WSS | `/socket.io`、WebSocketのみ。HTTPで取得する短命の接続チケットをhandshake.authに渡す（URLには含めない） |
| Next.js／常駐サーバー → PostgreSQL | TLS、サーバー資格情報のみ。会員・参加権・問題・回答・結果の正本 |
| Next.js／常駐サーバー → Redis | 認証TLS接続。ルーム状態・イベント通知・存在確認・期限処理 |

Cookieを別ドメインに広げない。#5・#10でDBの同じ参加者IDに紐づく短命チケットを発行・検証し、roomId・有効期限・nonceで制限する。Origin許可リストは完全一致で、CORSだけを認証代わりにしない。資格情報をNEXT_PUBLIC変数に置かない。プレビュー環境は本番のDB／Redis／鍵と分離する。

## 複数台・障害・長時間接続

Socket.IOはWebSocketのみを使うためHTTP polling用のsticky sessionは不要。各ノードの配信にはRedis adapterを使い、ゲーム状態の正本にはしない。根拠: [複数ノード](https://socket.io/docs/v4/using-multiple-nodes/)、[Redis adapter](https://socket.io/docs/v4/redis-adapter/)。

- DBトランザクションとルームversionで回答・締切を一度だけ確定。Redisの排他権を失ったワーカーの書込みをversionで拒否する。
- 締切を永続化し、常駐ワーカーが期限到達を処理。再起動で未処理締切を回収する。setTimeoutだけに依存しない。
- 再接続は指数バックオフし、必ずsnapshot取得。Redis adapterの配信を欠落のないイベントログとして扱わない。
- Redis断では更新を失敗として返し、確定していない回答を受理済みにしない。復帰後はDBから共有状態を再構築する。
- SIGTERMで新規受付を止め、実行中処理を終了して接続を閉じる。クライアントは別ノードへ復帰する。プロキシはWebSocket upgradeとidle timeoutを設定する。

## 環境変数

`.env.example` は値の形式のみ。実値は開発環境かホスティングのシークレット管理に保存する。

| 名前 | 使用先 | 意味 |
|---|---|---|
| DATABASE_URL | 両サーバー | PostgreSQL接続（Next.jsはプーリング接続） |
| DIRECT_URL | マイグレーション | PostgreSQL直接接続 |
| REDIS_URL | 両サーバー | Pub/Sub対応のredis(s) URL。REST専用URLは不可 |
| AUTH_SECRET | Next.js | 認証鍵（#5） |
| REALTIME_TICKET_SECRET | 両サーバー | 短命接続チケット署名鍵（#10） |
| APP_ORIGIN | 両サーバー | 利用者向けの単一Origin |
| ALLOWED_ORIGINS | 常駐サーバー | 許可Originのカンマ区切り |
| NEXT_PUBLIC_REALTIME_URL | ブラウザー | 常駐サーバーの公開HTTPS URL |
| PORT | 常駐サーバー | コンテナのHTTP待受ポート |

## 起動と検証

現在のアプリ: Node 22.22.0で `npm ci` → `npm run dev`。本番ビルドは `npm run build` → `npm start`。作業ディレクトリはリポジトリ内の `all-star-quiz/`。

構成の通信検証: `npm run test:transport`。loopback上の独立HTTP/Socket.IOサーバーに2クライアントで接続し、確認応答、再接続、不許可Originの拒否を確認する。ゲームデータや認証を持たない検証専用で、本番サービスとして起動しない。

#4・#9ではローカルPostgreSQL／Redisの起動設定を追加する。#10では常駐サーバーの `npm run realtime` とコンテナ設定を追加する。#27ではVercelのRoot Directoryを `all-star-quiz` に設定し、コンテナは同ディレクトリでビルド・起動、健康確認・DB migrationの実行手順を整備する。

今回確認済みなのはローカルでの独立プロセス配置が可能なtransportと既存Next.jsの本番ビルド。クラウド配備、認証、共有Redis配信、耐障害性の実証はそれぞれ #10・#9・#26・#27の完了条件であり、未実装。

## 費用が発生する操作

常時稼働コンテナの有料プラン選択、Supabase／Redisの有料プランへの変更、Vercelの課金プラン・追加使用量、独自ドメイン購入が対象。契約前に料金・上限と構成を提示して確認する。本Issueで外部リソースや課金契約は作成しない。
