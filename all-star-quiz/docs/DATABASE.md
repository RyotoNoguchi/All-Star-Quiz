# PostgreSQLの開発・検証手順

## 初回起動

`all-star-quiz/` で実行する。

```sh
cp .env.example .env
docker compose up -d --wait
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

既存の `.env` がある場合は上書きせず不足する設定を追加する。PostgreSQLはloopbackの55432ポートを使用し、他プロジェクトの5432ポートと分離する。Composeの固定パスワードはローカル専用。本番ではTLSと独立した資格情報を設定する。

## 保存と排他

ルーム・参加者はPostgreSQLのGame／Participant／Userに保存する。CookieのトークンはSHA-256のハッシュだけをDBに保持し、公開レスポンスには返さない。参加・退出はGame行のロックの下で定員・重複・ホスト移譲を処理し、複数サーバーでも同じ制約を守る。

ルーム取得でも24時間の期限を検査し、期限切れはfinished／expiredに確定して404を返す。最後の参加者が退出した待機ルームは削除する。対戦開始後の退出と結果の永続化は #11・#24 で実装する。

Question／GameQuestion／Answer／GameResultの初期スキーマも用意済み。GameQuestionのsnapshotはゲーム開始時に問題の編集から切り離すために使用する。実際の出題・回答APIは後続Issueで実装する。

旧 `.data/rooms.json` は変更せず残す。新DBは新しいルームから利用するため、旧ファイルにだけ存在する招待コードは再作成が必要。今後の再起動では同じDBボリュームを使用する限りルームを保持する。

## テスト

```sh
npm run check
```

`test:run`はDB不要の単体テスト、`test:db`は実際のPostgreSQLを使用する。`TEST_DATABASE_URL`のDBにランダムな専用schemaを作成し、migrationを適用してテスト終了後にそのschemaだけ削除する。開発データのschemaは消去しない。テスト先にはローカル／CIの専用DBを指定する。

DBテストでは別のNodeプロセス2つによる同時参加、20人制限、重複名と同一参加者の再送、ホスト引き継ぎ、期限切れの永続化、プロセス再起動後の復元を確認する。CIでもPostgreSQL serviceを使い、毎回migrationから検証する。

## 運用

停止は `docker compose stop`、再開は `docker compose up -d --wait`。データを保持するためボリュームを削除しない。スキーマ変更時は `npx prisma migrate dev --name <変更名>` でmigrationを作成し、本番は `npm run db:migrate` を配備前に実行する。本番への `migrate dev` やテストDB設定の使用は禁止。
