# 🚀 Discord to Webhook Extension

Discord のメッセージを別の Discord チャンネルに Webhook 経由で転送する Chrome 拡張機能です。

## 📦 機能

- ✅ Discord の各メッセージに「📤」ボタンを追加
- ✅ ボタンクリックでメッセージを Webhook 経由で転送
- ✅ Webhook URL の設定・管理UI
- ✅ 他人のメッセージ転送時の警告表示
- ✅ 成功/失敗の通知表示
- ✅ Chrome Manifest V3 準拠

## 📂 ファイル構成

```
DiscordToWebhookExtension/
├── manifest.json          # Chrome拡張のマニフェストファイル
├── content.js             # メッセージ検出・ボタン挿入・DOM操作
├── popup.html             # 設定UIのHTML
├── popup.js               # 設定UIのJavaScript
├── styles.css             # スタイルシート
├── utils/
│   └── webhook.js         # Webhook送信機能
└── README.md              # このファイル
```

## 🛠️ インストール方法

1. **このフォルダをダウンロード**
2. **Chrome を開き、`chrome://extensions/` にアクセス**
3. **右上の「デベロッパーモード」を有効化**
4. **「パッケージ化されていない拡張機能を読み込む」をクリック**
5. **このフォルダを選択**

## 🎯 使用方法

### 1. Webhook URL の設定

1. Chrome の拡張機能アイコンをクリック
2. 「Webhook URL」フィールドに Discord Webhook URL を入力
3. 「保存」ボタンをクリック
4. 「テスト送信」で動作確認（任意）

### 2. メッセージの転送

1. `https://discord.com/channels/` にアクセス
2. 各メッセージの横に「📤」ボタンが表示される
3. ボタンをクリックしてメッセージを転送
4. 成功時は「✅」、失敗時は「❌」が表示される

### 3. セキュリティ機能

- **他人のメッセージ転送時**: 確認ダイアログが表示されます
- **Webhook URL**: ローカルストレージに安全に保存されます
- **権限**: Discord サイトのみにアクセス

## ⚠️ 注意事項

- **他人のメッセージの転送**: 権利上の問題が生じる可能性があります
- **Webhook URL**: 絶対に第三者に共有しないでください
- **対応サイト**: `https://discord.com/channels/` のみ

## 🔧 Discord Webhook の取得方法

1. Discord サーバーの設定を開く
2. 「連携サービス」→「ウェブフック」
3. 「新しいウェブフック」を作成
4. Webhook URL をコピー

## 📋 転送フォーマット

```json
{
  "embeds": [
    {
      "title": "Forwarded Discord Message",
      "description": "メッセージの内容",
      "url": "元メッセージへのリンク",
      "author": {
        "name": "送信者名"
      },
      "footer": {
        "text": "Shared via Chrome Extension"
      },
      "timestamp": "2024-01-01T12:00:00.000Z"
    }
  ]
}
```

## 🐛 トラブルシューティング

### ボタンが表示されない場合
- ページをリロードしてみてください
- `chrome://extensions/` で拡張機能が有効化されているか確認
- コンソール（F12）でエラーがないか確認

### Webhook 送信が失敗する場合
- Webhook URL が正しいか確認
- ネットワーク接続を確認
- Discord サーバーの Webhook が削除されていないか確認

## 📄 ライセンス

このプロジェクトは要件定義書に基づいて作成されました。

---

**⚡ 作成者**: Claude Code Assistant  
**📅 作成日**: 2025-08-08