# Railway デプロイガイド

こころの訪問看護ステーションひなた ダッシュボードを **Railway** 上で独立運用する手順書。  
**前提**: Week 1（Manus依存完全除去）が完了していること。

---

## 📋 デプロイ前チェックリスト

- [ ] Week 1 の変更が `migration-week1` ブランチにコミット済み
- [ ] Railway アカウント作成済み（Hobby プラン $5/月以上推奨）
- [ ] Google Cloud Console の OAuth クライアントID 作成済み
- [ ] Google Cloud Console のサービスアカウント + JSON キー保持済み
- [ ] Gemini API キー取得済み

---

## 🚀 デプロイ手順

### 1. Railway でプロジェクト作成（既に作成済みならスキップ）

1. [Railway ダッシュボード](https://railway.com/dashboard) を開く
2. **「New Project」** → **「Deploy from GitHub repo」**
3. `takashimoriwaki-a11y/hinata-dashboard` を選択
4. **デプロイブランチを `migration-week1` に設定**（Settings → Branch）

### 2. MySQL データベースを追加

1. プロジェクト画面で **「+ New」** → **「Database」** → **「Add MySQL」**
2. MySQL サービスが立ち上がったら「**Variables**」タブ で `MYSQL_URL` が発行されていることを確認
3. アプリサービスに戻り、「**Variables**」タブで新しい変数を追加：
   ```
   DATABASE_URL = ${{ MySQL.MYSQL_URL }}
   ```
   （RailwayのReference記法。変数追加画面で「Add Reference」→「MySQL.MYSQL_URL」で選択可）

### 3. 環境変数の設定

`.env.example` を参考に、以下を **Variables タブ** に追加。**旧Manusの値をコピペするのではなく新規発行** してください（セキュリティ観点で重要）。

| 変数名 | 必須 | 値の発行方法 |
|---|---|---|
| `JWT_SECRET` | ✅ | Railway の「Generate Variable」ボタン、または `openssl rand -hex 32` |
| `SETUP_KEY` | ✅ | 任意の長めの文字列（例: `hinata-2026-new-start-xxx`） |
| `OWNER_EMAIL` | ✅ | `takashimoriwaki@kokoronohinata.com` |
| `VITE_GOOGLE_OAUTH_CLIENT_ID` | ✅ | Google Cloud Console から |
| `GOOGLE_OAUTH_CLIENT_ID` | ✅ | 上と同じ値 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | ✅ | 同上（新規発行推奨） |
| `GEMINI_API_KEY` | ✅ | Google AI Studio で新規発行 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | ✅ | 新規サービスアカウント作成推奨 |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | ✅ | 新規JSONキーから抽出（改行は `\n`） |
| `GOOGLE_SHEETS_API_KEY` | ✅ | 新規発行推奨 |
| `VAPID_PUBLIC_KEY` | ✅ | `npx web-push generate-vapid-keys` で新規発行 |
| `VAPID_PRIVATE_KEY` | ✅ | 同上 |
| `VAPID_EMAIL` | ✅ | `mailto:admin@kokoronohinata.com` |
| `VITE_GOOGLE_PICKER_API_KEY` | 任意 | My Links 機能を使う場合 |

### 4. Google OAuth リダイレクトURIの追加

Google Cloud Console → APIs & Services → Credentials で OAuth クライアントを開き、
**「承認済みのリダイレクトURI」** に以下を追加：

```
https://<Railway発行ドメイン>.up.railway.app/api/auth/google/callback
https://<Railway発行ドメイン>.up.railway.app/api/auth/google/calendar/callback
https://<Railway発行ドメイン>.up.railway.app/api/auth/google/picker/callback
```

※ Railway の Settings → Networking → Public Domain で確認。  
※ カスタムドメイン `hinata.kokoronohinata.com` 版も後で追加。

### 5. 初回ビルド＆デプロイ

1. GitHub push を検知して Railway が自動ビルド・デプロイ開始
2. **Deployments** タブでビルドログを確認、**Success** になれば OK
3. 公開URLで動作確認: `https://<Railway発行ドメイン>/api/health`
4. `{"status":"ok",...}` が返れば起動成功

### 6. データベーススキーマ初期化

**一度だけ** 実行：

```bash
# Railway の Shell タブから
pnpm db:push
```

または、Settings → Deploy → Start Command を一時的に:
```
pnpm db:push && node dist/index.js
```
→ 完了後、元の `node dist/index.js` に戻す。

### 7. 既存データの移行（TiDB → Railway MySQL）

```bash
# ① TiDB から最新CSV取得（ローカルまたはManus稼働サーバーで）
DATABASE_URL="mysql://tidb-user:pass@tidb-host:port/dbname" \
  OUTPUT_DIR="./db-export/csv" \
  node scripts/export-all-tables-to-csv.mjs

# ② CSVを Railway MySQL にインポート
DATABASE_URL="<Railway MySQL の MYSQL_PUBLIC_URL>" \
  CSV_DIR="./db-export/csv" \
  node scripts/import-csvs-to-mysql.mjs
```

※ 外部からの接続は `MYSQL_PUBLIC_URL`（`MYSQL_URL` は内部通信専用）

### 8. 管理者アカウントの初期化

**方法A：Google OAuth 経由（推奨）**
1. `https://<Railway発行ドメイン>/login` にアクセス
2. **「Google でログイン」** ボタン
3. `takashimoriwaki@kokoronohinata.com` でログイン
4. `OWNER_EMAIL` と一致するため自動で admin 権限付与

**方法B：/setup ページ経由**
1. `https://<Railway発行ドメイン>/setup`
2. 名前・メール・パスワード・`SETUP_KEY` を入力

### 9. 動作確認（ステージング）

- [ ] Google ログイン → ダッシュボード表示
- [ ] スケジュールスクショのアップロード（Base64でDB保存）
- [ ] 音声入力（Gemini）→ テキスト化
- [ ] スタッフ管理画面（管理者のみ）
- [ ] メッセージ送信・リアクション
- [ ] タスク作成・完了
- [ ] 勤怠打刻
- [ ] スプレッドシート連携（議事録タイトル取得等）

---

## 🔄 カスタムドメイン切替（Week 2 後半）

1. Railway Settings → Networking → **「+ Custom Domain」**
2. `hinata.kokoronohinata.com` を入力
3. 表示されるCNAMEレコードをDNSプロバイダに設定
4. SSL証明書反映を待つ（数分〜1時間）
5. Google OAuth Redirect URIにカスタムドメイン版追加
6. 動作確認後、旧Manus環境（`hinatadash-zgp48rw5.manus.space`）を停止

---

## 💰 費用目安（Railway Hobbyプラン）

| リソース | 月額 |
|---|---|
| アプリサービス (512MB RAM) | $5 |
| MySQL | $5 |
| **合計** | **約 $10（約1,500円/月）** |

※ スクリーンショットをBase64でDBに保存するため、長期稼働で使用量が一定以上になると追加費用の可能性。

---

## 🔐 Manus環境停止時のキーローテーション

Railway安定稼働後、**旧キーを全て無効化・再発行** してください:

- [ ] Google Service Account → 旧JSONキーを削除
- [ ] Google OAuth Client Secret → 旧シークレットを無効化
- [ ] Gemini API Key → 旧キー削除
- [ ] Google Sheets API Key → 旧キー削除
- [ ] Google Picker API Key → 旧キー削除
- [ ] VAPID キーペア → 新規発行（旧キーで購読中のユーザーは再購読必要）
- [ ] JWT_SECRET → 新規（既存セッション全失効）
- [ ] Manus 環境変数画面 → すべての秘密情報を削除

---

## 🆘 トラブルシューティング

### ビルドエラー
- `Dockerfile` / `nixpacks.toml` の設定確認
- `pnpm-lock.yaml` と `package.json` の整合性確認

### データベース接続エラー
- `DATABASE_URL` 形式: `mysql://user:pass@host:port/dbname`
- Railway MySQL 起動中か
- `MYSQL_URL`（内部）と `MYSQL_PUBLIC_URL`（外部）を混同していないか

### ヘルスチェック失敗
- `/api/health` が 200 を返すか: `curl https://<domain>/api/health`
- ビルド成果物 `dist/index.js` 存在確認

### Google ログイン不可
- Redirect URI の末尾スラッシュ含め完全一致
- `@kokoronohinata.com` 以外はドメイン制限でブロック
- ブラウザコンソールで詳細エラー確認

### スクリーンショット表示されない
- S3廃止によりDB直接保存方式
- 既存 `imageUrl` が `http...manus-s3...` のままなら失効
- `SELECT id, imageUrl, LEFT(imageData, 50) FROM schedule_screenshots LIMIT 5;` で状態確認
- データ移行時に `imageData` (base64) が入っていれば OK
