# 常駐リアルタイムサーバー

Next.jsとは別プロセスでSocket.IOを起動します。`npm run build` はWebと通信サーバーをビルドします。開発は `npm run realtime:dev`、本番は `npm run realtime:start` です。生成物は `.realtime/server.cjs` です。常駐Node環境の起動コマンドに設定してください。外部環境への配備はIssue #27で行います。

必要な設定:

- `DATABASE_URL` / `DIRECT_URL`: Webと同じPostgreSQL
- `REDIS_URL`: Webと同じRedis。本番はTLS接続
- `REALTIME_TICKET_SECRET`: Webと通信サーバーで同じ、32文字以上のランダム秘密値。サンプル値は起動時に拒否
- `ALLOWED_ORIGINS`: `http://localhost:3000` など許可するWebのOriginをカンマ区切りで指定。ワイルドカード・パス・末尾スラッシュは不可
- `PORT`: 通信サーバーの待受ポート（既定3001）
- `NEXT_PUBLIC_REALTIME_URL`: ブラウザーから到達する接続先。ブラウザー統合はIssue #16

参加者はCookieで認証済みの `realtime.ticket({ code })` を同一Originから呼び、60秒以内にチケットを `auth: { ticket }` として接続します。通信方式は `transports: ['websocket']` に固定します。生のセッションCookieを別ドメインの通信サーバーへ送る必要はありません。

チケットは署名・Origin・有効期限を確認し、DBで現在のセッションと部屋への参加を検証します。Redisで1回だけ消費するため、別インスタンスへの再利用も拒否します。再接続時は新しいチケットを取得します。接続後は同期要求ごとと5秒ごとに認証を再確認し、セッション／部屋期限で切断します。短い切断で参加者を退出扱いにはしません。

`SYNC_ROOM({}, ack)` は待機・出題・締切・結果・終了の全状態を `{ ok: true, state: PrivateGameSnapshot, serverTime }` で返します。HTTPの `games.snapshot({ code })` でも取得できます。本人の回答受付票だけを追加し、他人の回答、正解・解説・最終問題フラグは結果発表まで公開しません。不正入力は `{ ok: false, code: 'BAD_REQUEST' }` を返します。画面接続はIssue #16で実装します。部屋や参加者のIDをクライアント操作で変更できません。未知のイベント、過大なパケット、毎秒20件を超えるイベントを拒否します。

信頼されたサーバー側 `notifyRoom(gameId)` が配信する `ROOM_UPDATED` はversionだけを含みます。Redis Adapterで複数インスタンスの同じ部屋に配信されます。クライアントから任意の部屋へ配信する機能はありません。Redis切断時はローカル接続を切り、復旧後の再認証・同期を要求します。Pub/Subは永続イベントログではないため、取り逃したイベントの復元にはDB状態を使います。

`GET /health` はRedis接続が利用可能なら200、不可なら503です。SIGINT/SIGTERMで通信・Redis・DB接続を閉じます。

結合テストは実際のWebSocketとRedisを使い、2台のサーバーへの同時接続、部屋分離、認証、チケット改ざん・期限・再利用、再接続、セッション失効・退出、不正操作を検証します。

参考: [Socket.IO Redis Adapter](https://socket.io/docs/v4/redis-adapter/)、[接続ミドルウェア](https://socket.io/docs/v4/middlewares/)、[サーバー設定](https://socket.io/docs/v4/server-options/)。

## ゲームイベントと復元

`GAME_EVENT` は `gameId / eventId / version / serverTime / type / payload` を持ちます。部屋の作成・参加・退出・問題準備・ホスト移譲は `STATE_SYNC`、開始／次問は `QUESTION_STARTED`、受付数は `ANSWER_COUNT_UPDATED`、締切は `QUESTION_CLOSED`、正解と脱落発表は `QUESTION_ENDED`、終了は `GAME_ENDED` です。回答受付票は `SUBMIT_ANSWER` の本人へのackにのみ含みます。

状態更新とイベント保存は同じDBトランザクションで行い、公開更新1回につきversionが1増えます。常駐サーバーは100msごとに未配信イベントを取得し、ゲーム単位のDBアドバイザリロックで複数配信者を直列化して、version順にRedisへ発行します。成功後に配信済みを記録します。失敗すると未配信のまま再試行します。発行後のクラッシュでは重複する可能性があるため、クライアントはversionで重複を除外します。

各通信サーバーは専用Redisチャンネルを購読し、現在のセッションと参加を確認して、対象の部屋のローカル接続にだけ配信します。公開スキーマで不要なフィールドを除外してから発行します。`applyGameEvent` は過去・重複・別部屋のイベントを無視し、versionの欠落や問題ID不一致を検出したら再同期を要求します。遅れて届いたスナップショットで新しい状態に巻き戻りは生じません。最終問題のベル通知は新着の `QUESTION_ENDED` だけが返し、再同期では返しません。

Pub/Subの購読者への到達は保証されないため、接続時・再接続時・version欠落時には必ず現在のスナップショットを取得します。保存イベントをクライアントが任意に検索するAPIはありません。

## ブラウザーの接続管理

`useGameConnection(code)` が待合室の状態と接続状態（接続中・接続済み・再接続中・失敗・参加無効）を管理します。ホーム画面の2秒ポーリングは廃止し、接続完了・version欠落・タブへの復帰時にスナップショットを取得します。通信断では新しいチケットを発行し直し、1/2/4/8秒間隔で最大5回接続を試みます。失敗後は「再接続する」で再試行できます。

古い接続とリクエストは世代番号・中断シグナルで無効化し、退出後や別ルームに移動した後の応答を反映しません。同じブラウザーの別タブにはBroadcastChannelで退出を通知し、非対応環境・別端末ではサーバーの参加認証と切断後の再認証で反映します。退出、参加期限切れ、セッション失効は参加画面に戻します。通信URLはビルド時の `NEXT_PUBLIC_REALTIME_URL` を使用します。
