# 型付きAPI

`/api/trpc` をtRPC v11のFetch adapterで提供する。実装は `src/lib/server/api`、クライアントは `src/lib/api-client.ts`。画面は `api.rooms.create/join/get/leave` を利用する。サーバーのAppRouter型はtype-only importで共有し、DBコードをクライアントに同梱しない。

- Zodで名前1〜20文字、6文字のコード、未定義フィールドを検証。コードは大文字に正規化する。
- 作成・参加は検証後に必要ならゲストセッションを発行。取得・退出は有効な本人セッションを必須とする。所属はサービス層で検証する。
- mutationのOriginは完全一致。1リクエスト1操作とし、バッチを受け付けない。
- 戻り値にも公開用スキーマを指定し、内部のトークン・回答・正解など未定義の情報を除去する。
- 認証切れ401、権限なし403、ルームなし404、競合409、入力不正400、障害500を区別する。入力エラーはfieldErrorsを提供し、予期しない障害のスタックや内部メッセージは返さない。
- 応答はno-store。セッションCookieを返すため、同じOriginのHTTPクライアントを使用する。
- 旧 `/api/rooms` は同じルーターを呼ぶ互換窓口として維持する。旧クライアントに対するレスポンス形状とステータスを維持し、ロジックを重複実装しない。

検証は `npm run check`。実際のtRPCクライアント→Fetch adapter→DBを通し、入力拒否・なりすまし拒否・障害時の情報秘匿を確認する。

参考: [Fetch adapter](https://trpc.io/docs/server/adapters/fetch)、[vanilla client](https://trpc.io/docs/client/vanilla/setup)。
