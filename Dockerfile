FROM node:22-alpine

# pnpmをグローバルインストール
RUN npm install -g pnpm@10.4.1

WORKDIR /app

# 依存関係のインストール
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ソースコードのコピーとビルド
COPY . .
RUN pnpm run build

EXPOSE 3000

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
