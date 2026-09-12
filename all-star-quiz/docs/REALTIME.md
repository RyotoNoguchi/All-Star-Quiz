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

現在のクライアント操作は `SYNC_ROOM({}, ack)` です。成功時に `{ ok: true, state: RoomView, serverTime }`、不正入力は `{ ok: false, code: 'BAD_REQUEST' }` を返します。現在は待合室の同期が対象です。進行中の完全な状態同期はIssue #15、画面接続はIssue #16で拡張します。部屋や参加者のIDをクライアント操作で変更できません。未知のイベント、過大なパケット、毎秒20件を超えるイベントを拒否します。

信頼されたサーバー側 `notifyRoom(gameId)` が配信する `ROOM_UPDATED` はversionだけを含みます。Redis Adapterで複数インスタンスの同じ部屋に配信されます。クライアントから任意の部屋へ配信する機能はありません。Redis切断時はローカル接続を切り、復旧後の再認証・同期を要求します。Pub/Subは永続イベントログではないため、取り逃したイベントの復元にはDB状態を使います。

`GET /health` はRedis接続が利用可能なら200、不可なら503です。SIGINT/SIGTERMで通信・Redis・DB接続を閉じます。

結合テストは実際のWebSocketとRedisを使い、2台のサーバーへの同時接続、部屋分離、認証、チケット改ざん・期限・再利用、再接続、セッション失効・退出、不正操作を検証します。

参考: [Socket.IO Redis Adapter](https://socket.io/docs/v4/redis-adapter/)、[接続ミドルウェア](https://socket.io/docs/v4/middlewares/)、[サーバー設定](https://socket.io/docs/v4/server-options/)。
