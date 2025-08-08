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
        
        // 初回検出後、少し待ってから再度試行（DOMが完全に読み込まれていない場合がある）
        setTimeout(() => {
            if (this.serverName === 'Unknown Server') {
                console.log('初回検出に失敗、再度サーバー名検出を実行...');
                this.detectServerName();
            }
        }, 2000);
        
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
        console.log('サーバー名検出を開始...');
        
        // より詳細で確実なサーバー名検出方法
        const serverNameSelectors = [
            // Discordの新UIでのサーバー名検出
            '[class*="sidebar"] [class*="headerContent"] [class*="name"]',
            '[class*="sidebar"] h1',
            // サーバー設定などでのサーバー名
            '[class*="guild"] [class*="name"]',
            '[class*="guildName"]',
            '[class*="serverName"]',
            // より広範囲な検索
            'h1[class*="name"][class*="title"]',
            '[class*="headerBar"] [class*="name"]',
            '[class*="guildHeader"] [class*="name"]'
        ];
        
        // 各セレクタを試して詳細をログ出力
        for (const selector of serverNameSelectors) {
            const elements = document.querySelectorAll(selector);
            console.log(`セレクタ "${selector}" で見つかった要素数: ${elements.length}`);
            
            elements.forEach((element, index) => {
                const text = element.textContent?.trim();
                console.log(`  要素${index + 1}: "${text}"`);
                
                if (text && text.length > 1) {
                    // 明らかにサーバー名でないものを除外
                    if (!text.includes('チャンネル') && 
                        !text.includes('channel') && 
                        !text.includes('#') &&
                        !text.includes('@') &&
                        !text.match(/^\d+$/) && // 数字のみではない
                        !text.match(/^\d{1,2}:\d{2}/) && // 時刻形式ではない
                        text !== 'Discord' &&
                        text.length < 100 // 長すぎない
                    ) {
                        this.serverName = text;
                        console.log(`サーバー名を検出しました: "${this.serverName}" (セレクタ: ${selector})`);
                        return;
                    }
                }
            });
            
            // 見つかった場合はここで終了
            if (this.serverName && this.serverName !== 'Unknown Server') {
                return;
            }
        }
        
        // ページタイトルから詳細に解析
        const pageTitle = document.title;
        console.log('ページタイトル:', pageTitle);
        
        if (pageTitle && pageTitle !== 'Discord') {
            // パターン1: "チャンネル名 | サーバー名 - Discord"
            if (pageTitle.includes(' | ') && pageTitle.includes(' - Discord')) {
                const parts = pageTitle.split(' - Discord')[0].split(' | ');
                if (parts.length >= 2) {
                    this.serverName = parts[parts.length - 1].trim();
                    console.log(`ページタイトルからサーバー名を抽出 (パターン1): "${this.serverName}"`);
                    return;
                }
            }
            
            // パターン2: "サーバー名 - Discord"
            if (pageTitle.includes(' - Discord')) {
                const serverName = pageTitle.split(' - Discord')[0].trim();
                if (serverName && !serverName.includes('#')) {
                    this.serverName = serverName;
                    console.log(`ページタイトルからサーバー名を抽出 (パターン2): "${this.serverName}"`);
                    return;
                }
            }
        }
        
        // より確実なサーバー名検出：ブラウザのタブタイトルから直接取得
        let attempts = 0;
        const maxAttempts = 5;
        
        const tryExtractFromTitle = () => {
            const title = document.title;
            console.log(`試行${attempts + 1}: ページタイトル = "${title}"`);
            
            // パターン: "#チャンネル名 | サーバー名 - Discord"
            if (title.includes(' | ') && title.includes(' - Discord')) {
                const beforeDiscord = title.split(' - Discord')[0];
                const parts = beforeDiscord.split(' | ');
                if (parts.length >= 2) {
                    // 最後の部分がサーバー名
                    const serverName = parts[parts.length - 1].trim();
                    if (serverName.length > 0 && !serverName.startsWith('#')) {
                        this.serverName = serverName;
                        console.log(`タイトルから確実なサーバー名を検出: "${this.serverName}"`);
                        return true;
                    }
                }
            }
            
            // パターン: "サーバー名 - Discord" (チャンネル名がない場合)
            if (title.includes(' - Discord') && !title.includes(' | ')) {
                const serverName = title.split(' - Discord')[0].trim();
                if (serverName.length > 0 && serverName !== 'Discord') {
                    this.serverName = serverName;
                    console.log(`タイトルから簡易サーバー名を検出: "${this.serverName}"`);
                    return true;
                }
            }
            
            return false;
        };
        
        // タイトルから検出を試行（ページが完全に読み込まれるまで少し待つ）
        if (!tryExtractFromTitle()) {
            setTimeout(() => {
                if (this.serverName === 'Unknown Server') {
                    tryExtractFromTitle();
                }
            }, 1000);
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
            // サーバー名が不明の場合は再検出を試行
            if (!this.serverName || this.serverName === 'Unknown Server') {
                console.log('サーバー名が不明のため再検出を実行...');
                this.detectServerName();
            }

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

        // 著者名の取得（リプライメッセージを考慮した改良版）
        let author = 'Unknown User';
        
        // リプライメッセージかどうかを判定
        const isReply = messageElement.querySelector('[class*="repliedMessage"]') || 
                       messageElement.querySelector('[class*="replyBar"]') ||
                       messageElement.querySelector('[class*="reply"]');
        
        if (isReply) {
            console.log('リプライメッセージを検出しました');
            
            // リプライメッセージの場合、リプライ部分を除外した実際の投稿者を探す
            const authorSelectors = [
                // リプライ部分を除外した投稿者名を取得
                '[class*="messageContent"] ~ [class*="header"] [class*="username"]',
                '[class*="contents"] > [class*="header"] [class*="username"]',
                // より具体的な検索
                '[class*="header"]:not([class*="reply"]) [class*="username"]',
                // フォールバック
                '[class*="username"]:not([class*="reply"])'
            ];
            
            for (const selector of authorSelectors) {
                const authorElements = messageElement.querySelectorAll(selector);
                console.log(`リプライ用セレクタ "${selector}" で見つかった要素数:`, authorElements.length);
                
                // 最後の要素（実際の投稿者）を使用
                if (authorElements.length > 0) {
                    const lastAuthorElement = authorElements[authorElements.length - 1];
                    const authorText = lastAuthorElement.textContent?.trim();
                    console.log(`候補著者名: "${authorText}"`);
                    
                    if (authorText && authorText.length > 0) {
                        author = authorText;
                        console.log(`リプライメッセージの実際の投稿者: "${author}"`);
                        break;
                    }
                }
            }
        } else {
            // 通常のメッセージの場合
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
                    console.log(`通常メッセージの投稿者: "${author}"`);
                    break;
                }
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