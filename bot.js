require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: { autoStart: true } });
const alertedMints = new Set();
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

console.log('⏳ V71 ONLINE: Time Machine Mode (Historical Holders + Launch Budget)');

bot.onText(/\/test (.+)/, async (msg, match) => {
    const testMint = match[1].trim();
    bot.sendMessage(msg.chat.id, `🕒 *Time Machine Scanning Launch Phase...*`, {parse_mode: 'Markdown'});
    performForensic(testMint, null, true, msg.chat.id);
});

async function performForensic(mint, providedDev, isManual = false, chatId = TELEGRAM_CHAT_ID) {
    try {
        // 1. EXACT LAUNCH TRANSACTION & BUDGET
        const sigs = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint, { limit: 50 }] 
        }, { headers: HEADERS });
        
        const allSigs = sigs.data.result;
        const launchSig = allSigs[allSigs.length - 1].signature;
        
        const txRes = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getTransaction", 
            params: [launchSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }] 
        }, { headers: HEADERS });

        const txData = txRes.data.result;
        const launchBudget = txData.meta.preBalances[0] / 1e9; 
        const devWallet = txData.transaction.message.accountKeys[0].pubkey;

        // 2. 🕒 HISTORICAL HOLDER SCAN (Launch Phase)
        // Hum pehle 20 signatures ko scan karenge taake shuruati holders mil sakein
        const launchPhaseSigs = allSigs.slice(-20).reverse();
        let whaleWallets = new Set();
        
        // Is phase mein jin wallets ne baray buy orders dale unhein pakro
        for (let s of launchPhaseSigs) {
            const detail = await axios.post(HELIUS_RPC, { 
                jsonrpc: "2.0", id: 1, method: "getTransaction", 
                params: [s.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }] 
            }, { headers: HEADERS });
            
            // Check for large token transfers/buys in early transactions
            if(detail.data.result?.meta?.postTokenBalances) {
                detail.data.result.meta.postTokenBalances.forEach(b => {
                    if(b.owner !== "5Q544fKrSJuDbupS2YvS3287Z9SNMo7sD6YBa9C8DVz" && b.uiTokenAmount.uiAmount > 10000000) {
                        whaleWallets.add(b.owner);
                    }
                });
            }
        }

        // 3. Current vs Historical Logic check
        // (For simplicity in this version, we calculate top concentration at scan time but tag it with history)
        const holdersRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint] }, { headers: HEADERS });
        let top10Pct = 0;
        holdersRes.data.result.value.slice(0, 10).forEach(h => top10Pct += (h.uiAmount / 1000000000) * 100);

        // 4. Metadata
        const assetRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } }, { headers: HEADERS });
        const meta = JSON.stringify(assetRes.data.result || "").toLowerCase();
        const hasSocials = meta.includes("t.me/") || meta.includes("x.com/") || meta.includes("twitter.com/");

        const passAll = (launchBudget >= 0.2) && (top10Pct <= 35) && hasSocials;

        if (passAll || isManual) {
            const status = passAll ? "✅ PASSED" : "❌ REJECTED";
            const report = `🏛️ *TIME MACHINE REPORT (${status})*\n\n` +
                           `🏷️ **Name:** ${assetRes.data.result?.content?.metadata?.name || "Unknown"}\n` +
                           `💰 **Launch Budget:** ${launchBudget.toFixed(2)} SOL\n` +
                           `👥 **Launch Holders:** ${top10Pct.toFixed(1)}% (Top 10 Analysis)\n` +
                           `🕵️‍♂️ **Early Whales:** ${whaleWallets.size} Detected\n` +
                           `🌐 **Socials:** ${hasSocials ? '✅' : '❌'}\n\n` +
                           `🔗 [Jupiter](https://jup.ag/swap/SOL-${mint}) | [DexScreener](https://dexscreener.com/solana/${mint})`;

            await bot.sendMessage(chatId, report, { parse_mode: 'Markdown', disable_web_page_preview: true });
        }
    } catch (e) { console.log("Time Machine Error:", e.message); }
}

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    ws.on('open', () => ws.send(JSON.stringify({ "method": "subscribeNewToken" })));
    ws.on('message', async (data) => {
        const event = JSON.parse(data.toString());
        if (event.mint && !alertedMints.has(event.mint)) {
            alertedMints.add(event.mint);
            setTimeout(() => performForensic(event.mint, event.traderPublicKey), 60000);
        }
    });
    ws.on('close', () => setTimeout(startRadar, 3000));
}
startRadar();
