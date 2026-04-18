require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: { autoStart: true, params: { timeout: 10 } } });
const alertedMints = new Set();

// --- 🛠️ ANTI-BLOCK HEADERS ---
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Content-Type': 'application/json'
};

console.log('🛡️ V67 ONLINE: Balanced Rug Shield + Anti-Block Active');

async function performForensic(mint, devWallet, isManual = false, chatId = TELEGRAM_CHAT_ID) {
    try {
        // 1. Fetch Metadata with Anti-Block Headers
        const assetRes = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } 
        }, { headers: HEADERS });
        
        const asset = assetRes.data.result;
        const meta = JSON.stringify(asset || "").toLowerCase();
        const hasSocials = meta.includes("t.me/") || meta.includes("x.com/") || meta.includes("twitter.com/");
        
        // 2. Budget Check (1.5 SOL)
        const balanceRes = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getBalance", params: [devWallet] 
        }, { headers: HEADERS });
        const solBalance = balanceRes.data.result.value / 1e9;

        // 3. Holders & Dev Activity
        const holdersRes = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint] 
        }, { headers: HEADERS });
        let top10Pct = 0;
        holdersRes.data.result.value.slice(0, 10).forEach(h => top10Pct += (h.uiAmount / 1000000000) * 100);

        const devSigsRes = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [devWallet, { limit: 15 }] 
        }, { headers: HEADERS });
        const devDidSell = JSON.stringify(devSigsRes.data.result).toLowerCase().includes("sell");

        // Logic Criteria
        const passAll = (solBalance >= 1.5) && (top10Pct <= 35) && hasSocials && !devDidSell;

        if (passAll || isManual) {
            const tokenName = asset?.content?.metadata?.name || "Unknown";
            const report = `💎 *BALANCED SIGNAL (V67)*\n\n` +
                           `🏷️ **Name:** ${tokenName}\n` +
                           `💰 **Budget:** ${solBalance.toFixed(2)} SOL ${solBalance >= 1.5 ? '✅' : '❌'}\n` +
                           `👥 **Top 10:** ${top10Pct.toFixed(1)}% ${top10Pct <= 35 ? '✅' : '❌'}\n` +
                           `🛡️ **Anti-Rug:** ${devDidSell ? '❌' : '✅'}\n\n` +
                           `🔗 [Jupiter](https://jup.ag/swap/SOL-${mint}) | [DexScreener](https://dexscreener.com/solana/${mint})`;

            await bot.sendMessage(chatId, report, { parse_mode: 'Markdown', disable_web_page_preview: true });
        }
    } catch (e) {
        // Silently log only if it's not a Cloudflare HTML error
        if (!e.response?.data?.includes?.("<html>")) console.log("Scan Error:", e.message);
    }
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
