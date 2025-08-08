class DiscordWebhookSender {
    constructor() {
        this.webhookUrl = null;
    }

    async init() {
        try {
            const result = await chrome.storage.local.get(['webhookUrl']);
            this.webhookUrl = result.webhookUrl;
        } catch (error) {
            console.error('Error loading webhook URL:', error);
        }
    }

    async sendMessage(messageData) {
        if (!this.webhookUrl) {
            await this.init();
            if (!this.webhookUrl) {
                throw new Error('Webhook URLが設定されていません。拡張機能の設定で設定してください。');
            }
        }

        const payload = this.createWebhookPayload(messageData);
        
        try {
            console.log('Content script - Background scriptにWebhook送信を依頼');
            
            // Background scriptを使用してWebhookを送信
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'sendWebhook',
                    webhookUrl: this.webhookUrl,
                    payload: payload
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve(response);
                });
            });

            if (!response.success) {
                console.error('Background scriptからのエラー:', response.error);
                console.error('エラー詳細:', response.details);
                throw new Error(response.error);
            }

            console.log('Content script - Webhook送信成功');
            return { success: true };
        } catch (error) {
            console.error('Webhook送信エラー:', error);
            console.error('送信したペイロード:', JSON.stringify(payload, null, 2));
            throw error;
        }
    }

    createWebhookPayload(messageData) {
        const { content, messageUrl, author, timestamp, serverName } = messageData;
        
        // メッセージ内容を検証・クリーンアップ
        const cleanContent = content && content.trim() ? content.trim() : "_メッセージ本文を取得できませんでした_";
        const cleanAuthor = author && author.trim() ? author.trim() : "Unknown User";
        const cleanServerName = serverName && serverName.trim() ? serverName.trim() : "Unknown Server";
        
        const embed = {
            title: "📨 Forwarded Discord Message",
            description: cleanContent.length > 4096 ? cleanContent.substring(0, 4093) + "..." : cleanContent,
            color: 0x7289da,
            fields: [
                {
                    name: "🏷️ サーバー",
                    value: `\`\`\`ansi\n\u001b[36m${cleanServerName}\u001b[0m\n\`\`\``,
                    inline: true
                },
                {
                    name: "👤 投稿者",
                    value: `\`\`\`ansi\n\u001b[33m${cleanAuthor}\u001b[0m\n\`\`\``,
                    inline: true
                }
            ],
            footer: {
                text: "Shared via Chrome Extension"
            }
        };
        
        // contentフィールド用（検索用）
        const contentWithPrefix = `【${cleanServerName}】\n**${cleanAuthor}**\n${cleanContent}`;

        // URLの検証
        if (messageUrl && messageUrl.startsWith('https://discord.com/channels/')) {
            embed.url = messageUrl;
        }

        // 作者情報の追加（文字数制限に注意）
        if (cleanAuthor && cleanAuthor.length <= 256) {
            embed.author = {
                name: cleanAuthor
            };
        }

        // タイムスタンプの検証と追加
        if (timestamp) {
            try {
                // ISO 8601形式かチェック
                const date = new Date(timestamp);
                if (!isNaN(date.getTime())) {
                    embed.timestamp = date.toISOString();
                }
            } catch (e) {
                // タイムスタンプが無効な場合は現在時刻を使用
                embed.timestamp = new Date().toISOString();
            }
        } else {
            embed.timestamp = new Date().toISOString();
        }

        return {
            content: contentWithPrefix.length > 2000 ? contentWithPrefix.substring(0, 1997) + "..." : contentWithPrefix,
            embeds: [embed]
        };
    }

    extractMessageId() {
        const currentUrl = window.location.href;
        const urlMatch = currentUrl.match(/https:\/\/discord\.com\/channels\/(\d+)\/(\d+)(?:\/(\d+))?/);
        
        if (urlMatch) {
            const [, guildId, channelId, messageId] = urlMatch;
            return { guildId, channelId, messageId };
        }
        
        return null;
    }

    createMessageUrl(guildId, channelId, messageId) {
        if (guildId && channelId && messageId) {
            return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
        }
        return window.location.href;
    }
}

window.DiscordWebhookSender = DiscordWebhookSender;