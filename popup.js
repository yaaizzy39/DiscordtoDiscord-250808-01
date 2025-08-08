document.addEventListener('DOMContentLoaded', async () => {
    const webhookUrlInput = document.getElementById('webhookUrl');
    const saveButton = document.getElementById('saveButton');
    const testButton = document.getElementById('testButton');
    const statusDiv = document.getElementById('status');

    async function loadSavedWebhookUrl() {
        try {
            const result = await chrome.storage.local.get(['webhookUrl']);
            if (result.webhookUrl) {
                webhookUrlInput.value = result.webhookUrl;
            }
        } catch (error) {
            console.error('Error loading webhook URL:', error);
        }
    }

    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
        
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }

    function isValidDiscordWebhookUrl(url) {
        const discordWebhookPattern = /^https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
        return discordWebhookPattern.test(url);
    }

    saveButton.addEventListener('click', async () => {
        const webhookUrl = webhookUrlInput.value.trim();
        
        if (!webhookUrl) {
            showStatus('Webhook URLを入力してください', 'error');
            return;
        }

        if (!isValidDiscordWebhookUrl(webhookUrl)) {
            showStatus('有効なDiscord Webhook URLを入力してください', 'error');
            return;
        }

        try {
            await chrome.storage.local.set({ webhookUrl: webhookUrl });
            showStatus('Webhook URLが保存されました', 'success');
        } catch (error) {
            console.error('Error saving webhook URL:', error);
            showStatus('保存に失敗しました', 'error');
        }
    });

    testButton.addEventListener('click', async () => {
        const webhookUrl = webhookUrlInput.value.trim();
        
        if (!webhookUrl) {
            showStatus('まずWebhook URLを入力してください', 'error');
            return;
        }

        if (!isValidDiscordWebhookUrl(webhookUrl)) {
            showStatus('有効なDiscord Webhook URLを入力してください', 'error');
            return;
        }

        try {
            const testPayload = {
                embeds: [{
                    title: "テスト送信",
                    description: "Discord Webhook拡張機能のテストメッセージです",
                    color: 0x7289da,
                    footer: {
                        text: "Test via Chrome Extension"
                    },
                    timestamp: new Date().toISOString()
                }]
            };

            // Background scriptを使用してWebhookをテスト送信
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'sendWebhook',
                    webhookUrl: webhookUrl,
                    payload: testPayload
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve(response);
                });
            });

            if (response.success) {
                showStatus('テスト送信が成功しました！', 'success');
            } else {
                throw new Error(response.error);
            }
        } catch (error) {
            console.error('Error testing webhook:', error);
            showStatus('テスト送信に失敗しました', 'error');
        }
    });

    await loadSavedWebhookUrl();
});