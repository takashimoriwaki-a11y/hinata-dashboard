# Railway デプロイガイド

こころの訪問看護ステーションひなた ダッシュボードを Railway で独立運用するための手順書です。

---

## 前提条件

- [Railway](https://railway.app) アカウント（Hobby プラン以上）
- [GitHub](https://github.com) アカウント（リポジトリ: `takashimoriwaki-a11y/hinata-dashboard`）
- Google Cloud Console の OAuth クライアント設定済み

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

#### 必須の環境変数

| 変数名 | 説明 | 値の例 |
|--------|------|--------|
| `DATABASE_URL` | MySQL の接続文字列（Railway MySQL から自動入力） | `mysql://user:pass@host:3306/dbname` |
| `JWT_SECRET` | セッション署名キー（ランダムな長い文字列） | `openssl rand -hex 32` で生成 |
| `SETUP_KEY` | 初回セットアップ用キー（自分で決める） | 任意の文字列 |

#### Google OAuth 認証（スタッフのGoogleアカウントでログイン）

| 変数名 | 説明 | 値 |
|--------|------|-----|
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth クライアント ID | `981223020919-...apps.googleusercontent.com` |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth クライアントシークレット | `GOCSPX-...` |

#### Google API（スプレッドシート連携）

| 変数名 | 説明 |
|--------|------|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google サービスアカウントのメール |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Google サービスアカウントの秘密鍵 |
| `GOOGLE_SHEETS_API_KEY` | Google Sheets API キー |

#### AI・音声認識

| 変数名 | 説明 |
|--------|------|
| `GEMINI_API_KEY` | Google Gemini API キー（音声入力・AI機能） |

#### Web Push 通知（任意）

| 変数名 | 説明 |
|--------|------|
| `VAPID_PUBLIC_KEY` | Web Push 公開鍵 |
| `VAPID_PRIVATE_KEY` | Web Push 秘密鍵 |
| `VAPID_EMAIL` | Web Push 送信者メール |

**JWT_SECRET の生成方法（ターミナルで実行）:**
```bash
openssl rand -hex 32
```

**VAPID キーの生成方法:**
```bash
npx web-push generate-vapid-keys
```

### 4. Google OAuth のリダイレクト URI を設定

Google Cloud Console → APIs & Services → Credentials → OAuth クライアント「ひなた ダッシュボード」を開き、以下の URI を「承認済みのリダイレクト URI」に追加します:

```
https://hinata.up.railway.app/api/auth/google/callback
https://hinata.up.railway.app/api/auth/google/calendar/callback
```

> ※ `hinata.up.railway.app` の部分は Railway で割り当てられた実際のドメインに変更してください。

### 5. デプロイを実行

Railway が自動的にビルドとデプロイを開始します。  
ビルドログを確認し、エラーがないことを確認してください。

### 6. データベースのマイグレーション

デプロイ後、**一度だけ** マイグレーションを実行する必要があります。

Railway の **「Shell」** タブから直接実行:
```bash
pnpm db:push
```

または、**「Settings」** → **「Deploy」** → **「Start Command」** を一時的に以下に変更:
```
pnpm db:push && node dist/index.js
```

デプロイ後、元の `node dist/index.js` に戻してください。

### 7. 管理者アカウントの作成

#### 方法 A: メール/パスワードでセットアップ（初回のみ）

1. デプロイされたアプリの URL を開く（例: `https://hinata.up.railway.app`）
2. `/setup` ページにアクセス（例: `https://hinata.up.railway.app/setup`）
3. 以下を入力して管理者アカウントを作成:
   - **名前**: 森脇 崇
   - **メールアドレス**: ご自身のメールアドレス（Googleアカウントと同じメールアドレス推奨）
   - **パスワード**: 8文字以上のパスワード
   - **セットアップキー**: 環境変数 `SETUP_KEY` に設定した値

#### 方法 B: Google アカウントでログイン

1. 管理者がメールアドレスを事前に登録（方法 A でセットアップ後）
2. ログインページで「Google でログイン」ボタンをクリック
3. 職場の Google アカウント（`@kokoronohinata.com`）でログイン

> **注意**: Google ログインは、事前にメールアドレスが DB に登録されているユーザーのみ使用できます。新規スタッフは管理画面から追加してください。

---

## 費用の目安

Railway の Hobby プランで運用した場合の概算:

| リソース | 月額費用 |
|----------|----------|
| アプリサービス（512MB RAM） | ~$5 |
| MySQL データベース | ~$5 |
| **合計** | **~$10（約1,500円）** |

> ※ Hobby プランは月 $5 の基本料金 + 使用量課金。

---

## 新規スタッフの追加方法

1. 管理者アカウントでログイン
2. サイドバーの **「管理画面」** を開く
3. **「スタッフ管理」** タブを選択
4. **「スタッフを追加」** ボタンをクリック
5. 名前・メールアドレス・チーム・初期パスワードを入力

> スタッフは初回ログイン後、Google アカウントでのログインも使用可能になります（メールアドレスが一致する場合）。

---

## トラブルシューティング

### ビルドエラーが発生する場合

```
Error: Cannot find module 'xxx'
```

→ Railway の **「Settings」** → **「Build Command」** を以下に変更してみてください:
```
pnpm install && pnpm run build
```

### データベースに接続できない場合

- `DATABASE_URL` が正しく設定されているか確認
- Railway の MySQL サービスが起動しているか確認
- MySQL の接続文字列形式: `mysql://user:password@host:3306/dbname`

### Google ログインができない場合

- `GOOGLE_OAUTH_CLIENT_ID` と `GOOGLE_OAUTH_CLIENT_SECRET` が設定されているか確認
- Google Cloud Console でリダイレクト URI が正しく設定されているか確認
- ログインしようとしているメールアドレスが DB に登録されているか確認

### ログインできない場合（メール/パスワード）

- `/setup` ページでアカウントを作成したか確認
- `JWT_SECRET` が設定されているか確認

---

## 既存データの移行

Manus 上のデータを Railway に移行する場合は、データベースのエクスポート/インポートが必要です。

### Manus からデータをエクスポート

Manus の管理 UI → Database タブ → エクスポート機能を使用

### Railway にインポート

Railway の MySQL サービスに接続してインポート:
```bash
mysql -h HOST -u USER -p DATABASE < export.sql
```
