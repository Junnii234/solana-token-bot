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

console.log('📢 V73 ONLINE: Logs Enabled. Monitoring Solana...');

async function performForensic(mint, providedDev, isManual = false, chatId = TELEGRAM_CHAT_ID) {
    try {
        // 1. Launch Signature & Budget
        const sigs = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint, { limit: 10 }] 
        }, { headers: HEADERS });
        
        if (!sigs.data.result || sigs.data.result.length === 0) {
            console.log(`❌ [${mint}] Skip: No signatures found (RPC delay).`);
            return;
        }
        
        const launchSig = sigs.data.result[sigs.data.result.length - 1].signature;
        const txRes = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getTransaction", 
            params: [launchSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }] 
        }, { headers: HEADERS });

        const launchBudget = txRes.data.result.meta.preBalances[0] / 1e9;

        // 2. Metadata Check
        const assetRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } }, { headers: HEADERS });
        const asset = assetRes.data.result;
        const meta = JSON.stringify(asset || "").toLowerCase();
        const hasSocials = meta.includes("t.me/") || meta.includes("x.com/") || meta.includes("twitter.com/");

        // 3. Holder Check
        const holdersRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint] }, { headers: HEADERS });
        let top10Pct = 0;
        holdersRes.data.result.value.slice(0, 10).forEach(h => top10Pct += (h.uiAmount / 1000000000) * 100);

        // --- 📊 LOGGING LOGIC (Railway Logs mein nazar ayega) ---
        const name = asset?.content?.metadata?.name || "Unknown";
        console.log(`--- Investigating: ${name} (${mint.substring(0,6)}...) ---`);
        console.log(`💰 Budget: ${launchBudget.toFixed(2)} SOL`);
        console.log(`👥 Top 10: ${top10Pct.toFixed(1)}%`);
        console.log(`🌐 Socials: ${hasSocials ? "Yes" : "No"}`);

        // Filtering Logic
        if (launchBudget < 0.2) {
            console.log(`⛔ REJECTED: Budget too low (${launchBudget.toFixed(2)} SOL)`);
        } else if (top10Pct > 35) {
            console.log(`⛔ REJECTED: Concentration too high (${top10Pct.toFixed(1)}%)`);
        } else if (!hasSocials) {
            console.log(`⛔ REJECTED: No Social Links found.`);
        } else {
            console.log(`✅ PASSED: Sending alert to Telegram!`);
            const report = `📊 *EXACT LAUNCH FORENSIC (✅ PASSED)*\n\n` +
                           `🏷️ **Name:** ${name}\n` +
                           `💰 **Launch Budget:** ${launchBudget.toFixed(2)} SOL ✅\n` +
                           `👥 **Top 10 Holders:** ${top10Pct.toFixed(1)}% ✅\n` +
                           `🌐 **Socials:** ✅\n\n` +
                           `🔗 [Jupiter](https://jup.ag/swap/SOL-${mint}) | [DexScreener](https://dexscreener.com/solana/${mint})`;
            await bot.sendMessage(chatId, report, { parse_mode: 'Markdown', disable_web_page_preview: true });
        }
        console.log(`-------------------------------------------`);

    } catch (e) {
        console.log(`⚠️ Error scanning ${mint}: ${e.message}`);
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
