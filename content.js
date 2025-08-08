class DiscordMessageForwarder {
    constructor() {
        this.webhookSender = new DiscordWebhookSender();
        this.processedMessages = new Set();
        this.currentUser = null;
        this.serverName = null;
        this.observer = null;
        
        this.init();
    }

    async init() {
        await this.webhookSender.init();
        this.detectCurrentUser();
        this.detectServerName();
        this.processExistingMessages();
        this.setupMutationObserver();
    }

    detectCurrentUser() {
        const userMenuButton = document.querySelector('[data-list-item-id="account"]');
        if (userMenuButton) {
            const avatarElement = userMenuButton.querySelector('img[alt]');
            if (avatarElement) {
                this.currentUser = avatarElement.alt;
            }
        }
        
        if (!this.currentUser) {
            const userSection = document.querySelector('[class*="nameTag"]');
            if (userSection) {
                const usernameElement = userSection.querySelector('[class*="username"]');
                if (usernameElement) {
                    this.currentUser = usernameElement.textContent.trim();
                }
            }
        }
    }

    detectServerName() {
        // より具体的なサーバー名検出方法
        const serverNameSelectors = [
            // サイドバーの最上部にあるサーバー名
            '[class*="sidebar"] [class*="name"]',
            '[class*="guildSidebar"] [class*="name"]',
            // ヘッダー部分のサーバー名
            'h1[class*="name"]',
            '[class*="title"][class*="name"]',
            // サーバーアイコンの隣のテキスト
            '[class*="guildIcon"] + [class*="name"]',
            // サーバー選択ドロップダウン
            '[class*="guildName"]',
            '[class*="serverName"]',
        ];
        
        for (const selector of serverNameSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent && element.textContent.trim()) {
                const serverName = element.textContent.trim();
                // 明らかにサーバー名でないものを除外
                if (!serverName.includes('チャンネル') && !serverName.includes('channel') && serverName.length > 1) {
                    this.serverName = serverName;
                    console.log(`サーバー名を検出しました: ${this.serverName}`);
                    return;
                }
            }
        }
        
        // ページタイトルからサーバー名を推測（改良版）
        const pageTitle = document.title;
        if (pageTitle && pageTitle.includes(' - Discord')) {
            const serverName = pageTitle.split(' - Discord')[0].trim();
            if (serverName && !serverName.includes('#')) {
                // チャンネル名部分を除去
                const parts = serverName.split(' | ');
                this.serverName = parts[parts.length - 1].trim();
                console.log(`ページタイトルからサーバー名を推測: ${this.serverName}`);
                return;
            }
        }
        
        // URLからギルドIDを取得してサーバー名として使用
        const urlMatch = window.location.href.match(/https:\/\/discord\.com\/channels\/(\d+)/);
        if (urlMatch) {
            this.serverName = `Server-${urlMatch[1].slice(-4)}`; // 末尾4桁を使用
            console.log(`URLからサーバーIDを使用: ${this.serverName}`);
            return;
        }
        
        this.serverName = 'Unknown Server';
        console.log('サーバー名を検出できませんでした');
    }

    setupMutationObserver() {
        this.observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.processNewMessages(node);
                        }
                    });
                }
            });
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    processExistingMessages() {
        const messages = this.findAllMessages();
        messages.forEach(message => this.addButtonToMessage(message));
    }

    processNewMessages(node) {
        if (node.matches && node.matches('[class*="messageListItem"]')) {
            this.addButtonToMessage(node);
        } else {
            const messages = node.querySelectorAll('[class*="messageListItem"]');
            messages.forEach(message => this.addButtonToMessage(message));
        }
    }

    findAllMessages() {
        // より具体的で確実なメッセージ要素の検出
        const messageSelectors = [
            '[id^="chat-messages-"][data-list-item-id]', // 最も確実
            '[class*="messageListItem"][id]',
            '[class*="message"][id^="chat-messages"]',
            'li[id^="chat-messages"]'
        ];
        
        let allMessages = [];
        for (const selector of messageSelectors) {
            const messages = document.querySelectorAll(selector);
            if (messages.length > 0) {
                console.log(`メッセージを${messages.length}件検出しました (selector: ${selector})`);
                // 各メッセージ要素の詳細をログ出力
                messages.forEach((msg, index) => {
                    console.log(`メッセージ${index + 1}:`, {
                        element: msg,
                        id: msg.id,
                        dataListItemId: msg.getAttribute('data-list-item-id'),
                        textContent: msg.textContent?.substring(0, 50) + '...'
                    });
                });
                return messages;
            }
        }
        
        console.log('メッセージが見つかりませんでした');
        return [];
    }

    addButtonToMessage(messageElement) {
        const messageId = this.getMessageId(messageElement);
        if (!messageId || this.processedMessages.has(messageId)) {
            return;
        }

        this.processedMessages.add(messageId);

        const existingButton = messageElement.querySelector('.discord-webhook-button');
        if (existingButton) return;

        // メッセージ要素にユニークな識別子を追加
        const uniqueId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        messageElement.setAttribute('data-webhook-message-id', uniqueId);

        const button = this.createForwardButton(messageElement, messageId, uniqueId);
        
        // 絶対位置指定でメッセージの右上に配置（空白行を作らない）
        button.className = 'discord-webhook-button discord-webhook-button-overlay';
        
        // メッセージ要素に直接追加
        messageElement.style.position = 'relative';
        messageElement.appendChild(button);
    }

    getMessageId(messageElement) {
        // メッセージ要素の情報をログ出力
        console.log('メッセージID取得対象の要素:', messageElement);
        console.log('要素のid:', messageElement.id);
        console.log('要素のdata-list-item-id:', messageElement.getAttribute('data-list-item-id'));
        
        // 複数の方法でメッセージIDを取得
        const idSources = [
            () => messageElement.getAttribute('data-list-item-id'),
            () => messageElement.id,
            () => messageElement.getAttribute('data-message-id'),
            () => {
                const idMatch = messageElement.getAttribute('id');
                if (idMatch && idMatch.startsWith('chat-messages-')) {
                    return idMatch.replace('chat-messages-', '');
                }
                return null;
            }
        ];

        for (const getIdFunc of idSources) {
            try {
                const id = getIdFunc();
                if (id) {
                    console.log('取得したID:', id);
                    // data-list-item-idの場合は特別な処理
                    if (id.startsWith('chat-messages___')) {
                        const cleanId = id.replace('chat-messages___', '');
                        console.log('クリーンアップ後のID:', cleanId);
                        return cleanId;
                    }
                    return id;
                }
            } catch (e) {
                // エラーは無視して次の方法を試す
            }
        }
        
        // すべて失敗した場合は要素のハッシュを生成
        const elementText = messageElement.textContent || '';
        const elementHash = elementText.substring(0, 50).replace(/\W/g, '');
        const fallbackId = `generated-${elementHash}-${Date.now()}`;
        console.log('フォールバックID:', fallbackId);
        return fallbackId;
    }

    createForwardButton(messageElement, messageId, uniqueId) {
        const button = document.createElement('button');
        button.className = 'discord-webhook-button';
        button.innerHTML = '📤';
        button.title = 'Send via Webhook';
        button.type = 'button';
        
        // ボタンにユニークIDを保存
        button.dataset.messageId = messageId;
        button.dataset.uniqueId = uniqueId;

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const clickedButton = e.target;
            const targetUniqueId = clickedButton.dataset.uniqueId;
            
            // ユニークIDを使って対応するメッセージ要素を検索
            const actualMessageElement = document.querySelector(`[data-webhook-message-id="${targetUniqueId}"]`);
            
            if (actualMessageElement) {
                console.log('ユニークIDで特定したメッセージ要素:', actualMessageElement);
                console.log('メッセージ内容のプレビュー:', actualMessageElement.textContent?.substring(0, 100));
                this.handleButtonClick(actualMessageElement, messageId);
            } else {
                console.log('ユニークIDでメッセージが見つからない、フォールバック使用:', messageElement);
                this.handleButtonClick(messageElement, messageId);
            }
        });

        return button;
    }

    async handleButtonClick(messageElement, messageId) {
        try {
            const messageData = this.extractMessageData(messageElement, messageId);

            this.showLoadingIndicator(messageElement);
            
            await this.webhookSender.sendMessage(messageData);
            
            this.showSuccessNotification(messageElement);
        } catch (error) {
            console.error('メッセージ転送エラー:', error);
            this.showErrorNotification(messageElement, error.message);
        }
    }

    extractMessageData(messageElement, messageId) {
        // このボタンがクリックされたメッセージ要素から直接データを取得
        console.log('メッセージデータ抽出対象:', messageElement);
        
        // より詳細なメッセージ内容抽出
        let content = '';
        
        // まず、すべてのmessageContentクラス要素を取得してログ出力
        const allContentElements = messageElement.querySelectorAll('[class*="messageContent"]');
        console.log('見つかったmessageContent要素数:', allContentElements.length);
        allContentElements.forEach((elem, index) => {
            console.log(`messageContent要素${index + 1}:`, elem.textContent?.trim());
        });
        
        // 最後（最新）のmessageContent要素を使用
        if (allContentElements.length > 0) {
            const lastContentElement = allContentElements[allContentElements.length - 1];
            content = lastContentElement.textContent?.trim() || '';
            console.log('最新のメッセージ内容を使用:', content);
        }
        
        // まだ空の場合は従来の方法
        if (!content) {
            const contentSelectors = [
                '[class*="messageContent"]:last-child',
                '[class*="markup"]:last-child',
                '[data-slate-node="text"]:last-child'
            ];
            
            for (const selector of contentSelectors) {
                const contentElement = messageElement.querySelector(selector);
                if (contentElement && contentElement.textContent && contentElement.textContent.trim()) {
                    content = contentElement.textContent.trim();
                    console.log(`フォールバック - メッセージ内容を取得 (${selector}):`, content);
                    break;
                }
            }
        }
        
        // それでも見つからない場合は、全テキストから抽出（改良版）
        if (!content) {
            const allText = messageElement.textContent || '';
            const lines = allText.split('\n').filter(line => line.trim());
            
            // ユーザー名、時刻、ボタンなどを除外して実際のメッセージ内容を特定
            const messageLines = lines.filter(line => {
                const trimmed = line.trim();
                return trimmed && 
                       !trimmed.includes('📤') && 
                       !trimmed.match(/^\d{1,2}:\d{2}\s*(AM|PM)?$/i) && // 時刻
                       !trimmed.includes('@') && // ユーザー名らしきもの
                       trimmed.length > 1 &&
                       !trimmed.match(/^(今日|昨日|月曜日|火曜日|水曜日|木曜日|金曜日|土曜日|日曜日)$/); // 日付
            });
            
            if (messageLines.length > 0) {
                content = messageLines[messageLines.length - 1]; // 最後のメッセージらしき行を使用
                console.log('全テキストから抽出したメッセージ:', content);
            }
        }

        // 著者名の取得（複数の候補を試す）
        let author = 'Unknown User';
        const authorSelectors = [
            '[class*="username"]',
            '[class*="author"]',
            'h3[class*="header"] span',
            '.username'
        ];
        
        for (const selector of authorSelectors) {
            const authorElement = messageElement.querySelector(selector);
            if (authorElement && authorElement.textContent.trim()) {
                author = authorElement.textContent.trim();
                break;
            }
        }

        // タイムスタンプの取得
        let timestamp = new Date().toISOString();
        const timestampElement = messageElement.querySelector('time');
        if (timestampElement) {
            const datetime = timestampElement.getAttribute('datetime');
            if (datetime) {
                timestamp = datetime;
            }
        }

        // メッセージURLの構築
        const urlInfo = this.webhookSender.extractMessageId();
        let messageUrl = window.location.href;
        
        if (urlInfo && messageId && messageId !== 'undefined') {
            messageUrl = this.webhookSender.createMessageUrl(urlInfo.guildId, urlInfo.channelId, messageId);
        }

        console.log('抽出したメッセージデータ:', {
            content: content || '(空のコンテンツ)',
            author,
            timestamp,
            messageUrl,
            messageId
        });

        return {
            content: content || '_メッセージ本文を取得できませんでした_',
            author,
            timestamp,
            messageUrl,
            messageId,
            serverName: this.serverName || 'Unknown Server'
        };
    }

    isOwnMessage(author) {
        return this.currentUser && author === this.currentUser;
    }

    async showWarningDialog(author) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'discord-webhook-warning-modal';
            modal.innerHTML = `
                <div class="discord-webhook-warning-content">
                    <h3>⚠️ 注意</h3>
                    <p>他のユーザー（${author}）のメッセージを転送しようとしています。</p>
                    <p>権利上の問題が生じる可能性があります。続行しますか？</p>
                    <div class="discord-webhook-warning-buttons">
                        <button class="discord-webhook-cancel-btn">キャンセル</button>
                        <button class="discord-webhook-confirm-btn">続行</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const cancelBtn = modal.querySelector('.discord-webhook-cancel-btn');
            const confirmBtn = modal.querySelector('.discord-webhook-confirm-btn');

            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(false);
            });

            confirmBtn.addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(true);
            });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                    resolve(false);
                }
            });
        });
    }

    showLoadingIndicator(messageElement) {
        const button = messageElement.querySelector('.discord-webhook-button');
        if (button) {
            button.innerHTML = '⏳';
            button.disabled = true;
        }
    }

    showSuccessNotification(messageElement) {
        const button = messageElement.querySelector('.discord-webhook-button');
        if (button) {
            button.innerHTML = '✅';
            button.disabled = false;
            
            setTimeout(() => {
                button.innerHTML = '📤';
            }, 2000);
        }

        this.showToast('メッセージが正常に転送されました', 'success');
    }

    showErrorNotification(messageElement, errorMessage) {
        const button = messageElement.querySelector('.discord-webhook-button');
        if (button) {
            button.innerHTML = '❌';
            button.disabled = false;
            
            setTimeout(() => {
                button.innerHTML = '📤';
            }, 3000);
        }

        this.showToast(`転送に失敗しました: ${errorMessage}`, 'error');
    }

    showToast(message, type) {
        const toast = document.createElement('div');
        toast.className = `discord-webhook-toast discord-webhook-toast-${type}`;
        toast.textContent = message;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('discord-webhook-toast-show');
        }, 100);

        setTimeout(() => {
            toast.classList.remove('discord-webhook-toast-show');
            setTimeout(() => {
                if (document.body.contains(toast)) {
                    document.body.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    destroy() {
        if (this.observer) {
            this.observer.disconnect();
        }
        
        document.querySelectorAll('.discord-webhook-button').forEach(button => {
            button.remove();
        });
        
        this.processedMessages.clear();
    }
}

let discordMessageForwarder;

function initialize() {
    if (window.location.href.includes('discord.com/channels/')) {
        if (discordMessageForwarder) {
            discordMessageForwarder.destroy();
        }
        
        setTimeout(() => {
            discordMessageForwarder = new DiscordMessageForwarder();
        }, 1000);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

let lastUrl = window.location.href;
const checkUrlChange = () => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        setTimeout(initialize, 1000);
    }
};

setInterval(checkUrlChange, 1000);