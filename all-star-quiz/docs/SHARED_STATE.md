# 共有状態と排他制御

PostgreSQLをゲーム・参加者・回答の正本とします。待合室の読み取りではDBで部屋の有効期限、参加権限、versionを確認してから、同じversionのRedisキャッシュを利用します。参加・退出でversionが変わると旧キャッシュは利用しません。Redisに正解・認証情報・他人の回答は保存しません。

Redisの状態キーは `quiz:v1:{gameId}:state`、有効期間は最大60秒または部屋の残り時間です。Luaによる更新で古いversionからの上書きを拒否します。キャッシュ消失・破損・Redis停止時はDBから復元します。接続とコマンドは1秒で打ち切り、次回操作で再接続します。Redis障害時もDBの認可を省略しません。

`createSharedStore().acquire(gameId, ttlMs)` はSET NX PXで処理担当の期限付きリースを取得します。取得できない場合はnullを返し、Redis障害時は例外です。解放はランダムな所有トークンをLuaで照合します。遅れた旧所有者が新所有者のリースを削除できません。

リースは期限切れ・Redis再起動で失われます。そのため決定的なゲーム変更は引き続きPostgreSQLの部屋行ロック内でフェーズ・version・冪等キーを検証します。Redisリースだけを根拠にDB変更やイベント配信を確定してはいけません。ゲーム進行・回答の永続的な冪等性は後続Issue #11〜#15で実装します。

ローカルは `docker compose up -d` でPostgreSQLとRedisを起動します。`REDIS_URL` は56379ポート、テスト用 `TEST_REDIS_URL` も同ポートです。本番はTLSの `rediss://` を設定し、ネットワークと認証で保護します。CIはRedisサービスを起動します。DB結合テストはランダムなRedis接頭辞で分離され、他のキーを消しません。

検証は別Nodeプロセス間の共有・リース競合、旧version拒否、TTL・旧所有者解放拒否、接続再作成、キャッシュ消失からのDB復元、Redis接続失敗時の待合室継続を対象とします。

参考: [Redis分散ロック](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)、[Node.js接続](https://redis.io/docs/latest/develop/clients/nodejs/connect/)。
