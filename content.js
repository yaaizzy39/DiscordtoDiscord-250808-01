class DiscordMessageForwarder {
    constructor() {
        this.webhookSender = new DiscordWebhookSender();
        this.processedMessages = new Set();
        this.currentUser = null;
        this.observer = null;
        
        this.init();
    }

    async init() {
        await this.webhookSender.init();
        this.detectCurrentUser();
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
        const messageSelectors = [
            '[class*="messageListItem"]',
            '[id^="chat-messages-"]',
            'li[class*="message"]',
            '[role="article"]'
        ];
        
        for (const selector of messageSelectors) {
            const messages = document.querySelectorAll(selector);
            if (messages.length > 0) {
                console.log(`メッセージを${messages.length}件検出しました (selector: ${selector})`);
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

        const messageContent = messageElement.querySelector('[class*="messageContent"]');
        if (!messageContent) return;

        const existingButton = messageElement.querySelector('.discord-webhook-button');
        if (existingButton) return;

        const button = this.createForwardButton(messageElement, messageId);
        
        const toolbar = messageElement.querySelector('[class*="buttonContainer"]');
        if (toolbar) {
            toolbar.appendChild(button);
        } else {
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'discord-webhook-button-container';
            buttonContainer.appendChild(button);
            messageContent.appendChild(buttonContainer);
        }
    }

    getMessageId(messageElement) {
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
                    // data-list-item-idの場合は特別な処理
                    if (id.startsWith('chat-messages___')) {
                        return id.replace('chat-messages___', '');
                    }
                    return id;
                }
            } catch (e) {
                // エラーは無視して次の方法を試す
            }
        }
        
        // すべて失敗した場合はタイムスタンプベースのIDを生成
        return `generated-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    createForwardButton(messageElement, messageId) {
        const button = document.createElement('button');
        button.className = 'discord-webhook-button';
        button.innerHTML = '📤';
        button.title = 'Send via Webhook';
        button.type = 'button';

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handleButtonClick(messageElement, messageId);
        });

        return button;
    }

    async handleButtonClick(messageElement, messageId) {
        try {
            const messageData = this.extractMessageData(messageElement, messageId);
            
            const isOwnMessage = this.isOwnMessage(messageData.author);
            if (!isOwnMessage) {
                const shouldProceed = await this.showWarningDialog(messageData.author);
                if (!shouldProceed) {
                    return;
                }
            }

            this.showLoadingIndicator(messageElement);
            
            await this.webhookSender.sendMessage(messageData);
            
            this.showSuccessNotification(messageElement);
        } catch (error) {
            console.error('メッセージ転送エラー:', error);
            this.showErrorNotification(messageElement, error.message);
        }
    }

    extractMessageData(messageElement, messageId) {
        // メッセージ内容の取得（複数の候補を試す）
        let content = '';
        const contentSelectors = [
            '[class*="messageContent"]',
            '[class*="markup"]',
            '[data-slate-node="text"]',
            '.markup'
        ];
        
        for (const selector of contentSelectors) {
            const contentElement = messageElement.querySelector(selector);
            if (contentElement && contentElement.textContent.trim()) {
                content = contentElement.textContent.trim();
                break;
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
            messageId
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