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

console.log('📢 V75 ONLINE: Bonding Curve Fixed! Real Holders Tracking...');

bot.onText(/\/test (.+)/, async (msg, match) => {
    const testMint = match[1].trim();
    bot.sendMessage(msg.chat.id, `🔍 *Analyzing Exact Launch Data...*`, {parse_mode: 'Markdown'});
    performForensic(testMint, null, true, msg.chat.id);
});

async function performForensic(mint, providedDev, isManual = false, chatId = TELEGRAM_CHAT_ID) {
    try {
        const sigs = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint, { limit: 10 }] 
        }, { headers: HEADERS });
        
        if (!sigs.data.result || sigs.data.result.length === 0) return;
        
        const launchSig = sigs.data.result[sigs.data.result.length - 1].signature;
        const txRes = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getTransaction", 
            params: [launchSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }] 
        }, { headers: HEADERS });

        const launchBudget = txRes.data.result.meta.preBalances[0] / 1e9;

        const assetRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } }, { headers: HEADERS });
        const asset = assetRes.data.result;
        const meta = JSON.stringify(asset || "").toLowerCase();
        const hasSocials = meta.includes("t.me/") || meta.includes("x.com/") || meta.includes("twitter.com/");

        const holdersRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint] }, { headers: HEADERS });
        
        let realTop10Pct = 0;
        const holders = holdersRes.data.result.value;
        
        // 🛠️ THE LOCHA FIX: Skip index 0 (Bonding Curve). Start from 1 to 11.
        if (holders && holders.length > 1) {
            holders.slice(1, 11).forEach(h => {
                realTop10Pct += (h.uiAmount / 1000000000) * 100;
            });
        }

        const name = asset?.content?.metadata?.name || "Unknown";
        console.log(`\n--- 🕵️‍♂️ Investigating: ${name} (${mint.substring(0,8)}...) ---`);
        console.log(`💰 Budget: ${launchBudget.toFixed(2)} SOL`);
        console.log(`👥 Real Top 10 (No Curve): ${realTop10Pct.toFixed(1)}%`);
        console.log(`🌐 Socials: ${hasSocials ? "Yes" : "No"}`);

        // 11000 SOL wale MEV bots ko bhi filter kar diya (Maximum 50 SOL limit)
        if (launchBudget < 0.2 || launchBudget > 50) {
            console.log(`⛔ REJECTED: Budget abnormal (${launchBudget.toFixed(2)} SOL)`);
        } else if (realTop10Pct > 35) {
            console.log(`⛔ REJECTED: Concentration too high (${realTop10Pct.toFixed(1)}%)`);
        } else if (!hasSocials) {
            console.log(`⛔ REJECTED: No Social Links.`);
        } else {
            console.log(`✅ PASSED: Elite Gem Found! Sending Alert...`);
            const report = `📊 *EXACT LAUNCH FORENSIC (✅ PASSED)*\n\n` +
                           `🏷️ **Name:** ${name}\n` +
                           `💰 **Launch Budget:** ${launchBudget.toFixed(2)} SOL ✅\n` +
                           `👥 **Real Top 10:** ${realTop10Pct.toFixed(1)}% ✅\n` +
                           `🌐 **Socials:** ✅\n\n` +
                           `🔗 [Jupiter](https://jup.ag/swap/SOL-${mint}) | [DexScreener](https://dexscreener.com/solana/${mint})`;
            await bot.sendMessage(chatId, report, { parse_mode: 'Markdown', disable_web_page_preview: true });
        }
        console.log(`-------------------------------------------`);

    } catch (e) {
        console.log(`⚠️ Error scanning ${mint.substring(0,6)}: ${e.message}`);
    }
}

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    ws.on('open', () => {
        console.log('✅ WebSocket Connected Successfully to PumpPortal!');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
    });
    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (event.mint && !alertedMints.has(event.mint)) {
                alertedMints.add(event.mint);
                console.log(`🔔 Naya Token Pakra: ${event.mint.substring(0,8)}... (Forensic 60 sec baad hogi)`);
                setTimeout(() => performForensic(event.mint, event.traderPublicKey), 60000);
            }
        } catch (e) {}
    });
    ws.on('close', () => setTimeout(startRadar, 3000));
}

startRadar();
