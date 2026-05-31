# FlowCraft — セットアップ手順

## 必要なもの
- Googleアカウント（Firebase用）
- GitHubアカウント（Vercel用）

---

## STEP 1 — Firebase プロジェクトを作る

1. https://console.firebase.google.com にアクセス
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力（例: `flowcraft-app`）
4. Googleアナリティクスは「無効」でOK → 作成

### Realtime Database を有効化
1. 左メニュー「構築」→「Realtime Database」
2. 「データベースを作成」→ロケーションは **us-central1** または **asia-southeast1**
3. **テストモード**で開始（後で変更可）

### Firebase設定を取得
1. プロジェクトのトップページ（歯車アイコン）→「プロジェクトの設定」
2. 「マイアプリ」→「ウェブアプリを追加」（`</>`アイコン）
3. アプリ名を入力 → 「アプリを登録」
4. **firebaseConfig の中身をコピー**

### app.js に貼り付ける
`app.js` の先頭にある `FIREBASE_CONFIG` を、コピーした値で書き換えてください：

```javascript
const FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",           // ← 自分の値
  authDomain: "your-app.firebaseapp.com",
  databaseURL: "https://your-app-default-rtdb.firebaseio.com",
  projectId: "your-app",
  storageBucket: "your-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc..."
};
```

---

## STEP 2 — Vercel にデプロイ

### GitHubにアップロード
1. https://github.com にログイン
2. 「New repository」→ 名前を入力（例: `flowcraft`）→「Create repository」
3. このフォルダの3ファイル（`index.html`, `style.css`, `app.js`, `vercel.json`）をアップロード

### Vercelにデプロイ
1. https://vercel.com にアクセス（GitHubでログイン）
2. 「Add New Project」→ GitHubのリポジトリを選択
3. 設定はデフォルトのまま「Deploy」
4. ✅ 完成！URLが発行されます（例: `https://flowcraft-xxxx.vercel.app`）

---

## 使い方

### ボードを作成
- 「新しいボードを作成」でランダムIDのボードが作られます

### 共同編集
- 画面上部の「ボードID」をコピーして仲間に共有
- 仲間はIDを入力して「参加」するだけ
- またはURLの末尾に `#ボードID` をつけて共有（例: `https://flowcraft.vercel.app#ABC1234`）

### 操作
| 操作 | 方法 |
|------|------|
| 図形追加 | 左サイドバーのボタン |
| 移動 | ドラッグ |
| リサイズ | 右下の紫の■をドラッグ |
| ラベル編集 | ダブルクリック |
| 接続（矢印） | 「接続」ボタンON → ノードを順にクリック |
| テキスト配置 | 「テキスト」ボタン → ダブルクリックで編集 |
| 削除 | 選択してDeleteキー または「削除」ボタン |
| ズーム | マウスホイール |
| パン | 空白エリアをドラッグ |

---

## Firebase セキュリティルール（公開後に設定推奨）

Realtime Database → ルール に以下を設定：

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

---

## ファイル構成

```
flowchart-app/
├── index.html    # メインHTML
├── style.css     # スタイル
├── app.js        # アプリロジック + Firebase連携
├── vercel.json   # Vercelデプロイ設定
└── README.md     # この手順書
```
