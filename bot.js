require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: { autoStart: true, params: { timeout: 10 } } });
const alertedMints = new Set();

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

console.log('🛡️ V69 ONLINE: Historical Budget (Launch Time) Mode Active');

// --- 🧪 MANUAL TEST (ACtfUWtg... check karega) ---
bot.onText(/\/test (.+)/, async (msg, match) => {
    const testMint = match[1].trim();
    bot.sendMessage(msg.chat.id, `🔍 *Extracting Launch Data...*`, {parse_mode: 'Markdown'});
    performForensic(testMint, null, true, msg.chat.id);
});

async function performForensic(mint, providedDev, isManual = false, chatId = TELEGRAM_CHAT_ID) {
    try {
        // 1. Launch Transaction Fetch (To get Launch Time Budget)
        const sigs = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint] 
        }, { headers: HEADERS });
        
        const launchSig = sigs.data.result[sigs.data.result.length - 1].signature;
        const txRes = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getTransaction", 
            params: [launchSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }] 
        }, { headers: HEADERS });

        const txData = txRes.data.result;
        const devWallet = txData.transaction.message.accountKeys[0].pubkey;
        
        // --- 📊 HISTORICAL BUDGET CALCULATION ---
        // Launch transaction hone se theek pehle dev ke paas kitna SOL tha
        const launchBudget = txData.meta.preBalances[0] / 1e9; 

        // 2. Metadata & Socials
        const assetRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } }, { headers: HEADERS });
        const meta = JSON.stringify(assetRes.data.result || "").toLowerCase();
        const hasSocials = meta.includes("t.me/") || meta.includes("x.com/") || meta.includes("twitter.com/");

        // 3. Holder Check
        const holdersRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint] }, { headers: HEADERS });
        let top10Pct = 0;
        holdersRes.data.result.value.slice(0, 10).forEach(h => top10Pct += (h.uiAmount / 1000000000) * 100);

        // Logic Criteria (Using launchBudget)
        const passAll = (launchBudget >= 0.2) && (top10Pct <= 35) && hasSocials;

        if (passAll || isManual) {
            const status = passAll ? "✅ PASSED" : "❌ REJECTED";
            const report = `📊 *HISTORICAL FORENSIC (${status})*\n\n` +
                           `🏷️ **Name:** ${assetRes.data.result?.content?.metadata?.name || "Unknown"}\n` +
                           `💰 **Launch Budget:** ${launchBudget.toFixed(2)} SOL ${launchBudget >= 0.2 ? '✅' : '❌'}\n` +
                           `👥 **Top 10:** ${top10Pct.toFixed(1)}% ${top10Pct <= 35 ? '✅' : '❌'}\n` +
                           `🌐 **Socials:** ${hasSocials ? '✅' : '❌'}\n\n` +
                           `🔗 [Jupiter](https://jup.ag/swap/SOL-${mint}) | [DexScreener](https://dexscreener.com/solana/${mint})`;

            await bot.sendMessage(chatId, report, { parse_mode: 'Markdown', disable_web_page_preview: true });
        }
    } catch (e) { console.log(e); }
}

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    ws.on('open', () => ws.send(JSON.stringify({ "method": "subscribeNewToken" })));
    ws.on('message', async (data) => {
        const event = JSON.parse(data.toString());
        if (event.mint && !alertedMints.has(event.mint)) {
            alertedMints.add(event.mint);
            setTimeout(() => performForensic(event.mint, event.traderPublicKey), 45000);
        }
    });
    ws.on('close', () => setTimeout(startRadar, 3000));
}
startRadar();
