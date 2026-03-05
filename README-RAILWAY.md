# Railway デプロイガイド

こころの訪問看護ステーションひなた ダッシュボードを Railway で独立運用するための手順書です。

---

## 前提条件

- [Railway](https://railway.app) アカウント（作成済み）
- [GitHub](https://github.com) アカウント（リポジトリ: `takashimoriwaki-a11y/hinata-dashboard`）

---

## デプロイ手順

### 1. Railway で新規プロジェクトを作成

1. [Railway ダッシュボード](https://railway.app/dashboard) を開く
2. **「New Project」** をクリック
3. **「Deploy from GitHub repo」** を選択
4. `takashimoriwaki-a11y/hinata-dashboard` を選択

### 2. MySQL データベースを追加

1. プロジェクト画面で **「+ New」** → **「Database」** → **「Add MySQL」** をクリック
2. MySQL サービスが作成されたら、**「Variables」** タブで `DATABASE_URL` をコピーしておく

### 3. 環境変数を設定

アプリのサービスを選択し、**「Variables」** タブで以下を設定します。

| 変数名 | 説明 | 必須 |
|--------|------|------|
| `DATABASE_URL` | MySQL の接続文字列（自動入力される場合あり） | ✅ |
| `JWT_SECRET` | セッション署名キー（ランダムな長い文字列） | ✅ |
| `SETUP_KEY` | 初回セットアップ用キー（自分で決める） | ✅ |
| `GEMINI_API_KEY` | Google Gemini API キー（音声入力・AI機能） | 任意 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google サービスアカウントのメール | 任意 |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Google サービスアカウントの秘密鍵 | 任意 |

**JWT_SECRET の生成方法（ターミナルで実行）:**
```bash
openssl rand -hex 32
```

### 4. デプロイを実行

Railway が自動的にビルドとデプロイを開始します。  
ビルドログを確認し、エラーがないことを確認してください。

### 5. データベースのマイグレーション

デプロイ後、**一度だけ** マイグレーションを実行する必要があります。

Railway の **「Settings」** → **「Deploy」** → **「Start Command」** を一時的に以下に変更:
```
pnpm db:push && node dist/index.js
```

デプロイ後、元の `node dist/index.js` に戻してください。

または、Railway の **「Shell」** タブから直接実行:
```bash
pnpm db:push
```

### 6. 管理者アカウントの作成

1. デプロイされたアプリの URL を開く（例: `https://hinata-dashboard.up.railway.app`）
2. `/setup` ページにアクセス（例: `https://hinata-dashboard.up.railway.app/setup`）
3. 以下を入力して管理者アカウントを作成:
   - **名前**: 森脇 崇
   - **メールアドレス**: ご自身のメールアドレス
   - **パスワード**: 8文字以上のパスワード
   - **セットアップキー**: 環境変数 `SETUP_KEY` に設定した値

4. アカウント作成後、自動的にホーム画面にリダイレクトされます

---

## 費用の目安

Railway の Hobby プランで運用した場合の概算:

| リソース | 月額費用 |
|----------|----------|
| アプリサービス（512MB RAM） | ~$5 |
| MySQL データベース | ~$5 |
| **合計** | **~$10（約1,500円）** |

> ※ Trial プランは $5 まで無料。Hobby プランは月 $5 の基本料金 + 使用量課金。

---

## トラブルシューティング

### ビルドエラーが発生する場合

```
Error: Cannot find module 'xxx'
```

→ `nixpacks.toml` の `pnpm install --frozen-lockfile` が失敗している可能性があります。  
Railway の **「Settings」** → **「Build Command」** を以下に変更してみてください:
```
pnpm install && pnpm run build
```

### データベースに接続できない場合

- `DATABASE_URL` が正しく設定されているか確認
- Railway の MySQL サービスが起動しているか確認
- MySQL の接続文字列形式: `mysql://user:password@host:3306/dbname`

### ログインできない場合

- `/setup` ページでアカウントを作成したか確認
- `JWT_SECRET` が設定されているか確認

---

## 既存データの移行

Manus 上のデータを Railway に移行する場合は、データベースのエクスポート/インポートが必要です。  
詳細は別途ご相談ください。
