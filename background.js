chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'sendWebhook') {
        sendWebhook(request.webhookUrl, request.payload)
            .then(result => sendResponse({ success: true, result }))
            .catch(error => sendResponse({ 
                success: false, 
                error: error.message,
                details: error.details 
            }));
        return true; // 非同期レスポンスを示す
    }
});

async function sendWebhook(webhookUrl, payload) {
    try {
        console.log('Background script - Webhook送信開始:', webhookUrl);
        console.log('Background script - ペイロード:', JSON.stringify(payload, null, 2));
        
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'DiscordWebhookExtension/1.0'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Background script - Webhook API Error:', errorText);
            
            let errorDetails;
            try {
                errorDetails = JSON.parse(errorText);
            } catch (e) {
                errorDetails = { message: errorText };
            }
            
            throw {
                message: `HTTP ${response.status}: ${errorDetails.message || response.statusText}`,
                details: errorDetails,
                status: response.status
            };
        }

        const result = await response.text();
        console.log('Background script - Webhook送信成功');
        return result;
    } catch (error) {
        console.error('Background script - Webhook送信エラー:', error);
        throw error;
    }
}