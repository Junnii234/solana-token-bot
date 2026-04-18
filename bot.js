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

const BONDING_CURVE_ID = "5Q544fKrSJuDbupS2YvS3287Z9SNMo7sD6YBa9C8DVz";

console.log('🚀 V77 ONLINE: Moon-Shot Detection (Drain Filter Active)');

async function performForensic(mint, providedDev, isManual = false, chatId = TELEGRAM_CHAT_ID) {
    try {
        // 1. Launch Budget Check
        const sigs = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint, { limit: 5 }] 
        }, { headers: HEADERS });
        
        if (!sigs.data.result || sigs.data.result.length === 0) return;
        const launchSig = sigs.data.result[sigs.data.result.length - 1].signature;
        
        const txRes = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getTransaction", 
            params: [launchSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }] 
        }, { headers: HEADERS });

        const launchBudget = txRes.data.result.meta.preBalances[0] / 1e9;

        // 2. Metadata Check (Socials Required)
        const assetRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } }, { headers: HEADERS });
        const meta = JSON.stringify(assetRes.data.result || "").toLowerCase();
        const hasSocials = meta.includes("t.me/") || meta.includes("x.com/") || meta.includes("twitter.com/");

        // 3. Holder Scan (The New Logic)
        const holdersRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint] }, { headers: HEADERS });
        const holders = holdersRes.data.result.value;

        let curveSupply = 0;
        let realTop10Pct = 0;
        let foundCurve = false;

        if (holders && holders.length > 0) {
            // Rule A: Check Bonding Curve (Usually #1 holder)
            const firstHolder = holders[0];
            // Yahan hum address check kar rahe hain ya supply check kar rahe hain
            curveSupply = (firstHolder.uiAmount / 1000000000) * 100;

            // Rule B: Calculate Real Top 10 (Excluding Curve)
            let count = 0;
            for (let h of holders) {
                // Agar ye holder bonding curve hai to isay total top 10 mein nahi ginn-na
                if (h.address === BONDING_CURVE_ID || curveSupply > 90) { 
                    // curve found, skip it for top 10 calculation
                    continue; 
                }
                if (count < 10) {
                    realTop10Pct += (h.uiAmount / 1000000000) * 100;
                    count++;
                }
            }
        }

        const name = assetRes.data.result?.content?.metadata?.name || "Unknown";
        console.log(`\n--- 🕵️‍♂️ Investigating: ${name} ---`);
        console.log(`💰 Budget: ${launchBudget.toFixed(2)} SOL`);
        console.log(`📉 Curve Supply: ${curveSupply.toFixed(1)}%`);
        console.log(`👥 Real Top 10: ${realTop10Pct.toFixed(1)}%`);

        // --- 📊 THE MOON-SHOT FILTERS ---
        const isCurveDraining = curveSupply < 85; // MUST be less than 85%
        const isDistributed = realTop10Pct < 35; // Community holds < 35%
        const isSolidBudget = launchBudget >= 0.2 && launchBudget < 50;

        if (!isSolidBudget) {
            console.log(`⛔ REJECTED: Budget abnormal.`);
        } else if (!isCurveDraining) {
            console.log(`⛔ REJECTED: Curve too full (${curveSupply.toFixed(1)}%). Rug Risk.`);
        } else if (!isDistributed) {
            console.log(`⛔ REJECTED: Real Top 10 too heavy (${realTop10Pct.toFixed(1)}%).`);
        } else if (!hasSocials) {
            console.log(`⛔ REJECTED: No Socials.`);
        } else {
            console.log(`✅ MOON-SHOT DETECTED! Sending Alert...`);
            const report = `🌟 *MOON-SHOT DETECTED (✅ PASSED)*\n\n` +
                           `🏷️ **Name:** ${name}\n` +
                           `📉 **Curve Remaining:** ${curveSupply.toFixed(1)}% (Draining) ✅\n` +
                           `💰 **Launch Budget:** ${launchBudget.toFixed(2)} SOL ✅\n` +
                           `👥 **Real Top 10:** ${realTop10Pct.toFixed(1)}% ✅\n\n` +
                           `🔗 [Jupiter](https://jup.ag/swap/SOL-${mint}) | [DexScreener](https://dexscreener.com/solana/${mint})`;
            await bot.sendMessage(chatId, report, { parse_mode: 'Markdown', disable_web_page_preview: true });
        }

    } catch (e) { console.log(`Error: ${e.message}`); }
}

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    ws.on('open', () => ws.send(JSON.stringify({ "method": "subscribeNewToken" })));
    ws.on('message', async (data) => {
        const event = JSON.parse(data.toString());
        if (event.mint && !alertedMints.has(event.mint)) {
            alertedMints.add(event.mint);
            // Time badha kar 90 seconds kar diya taake curve drain hone ka waqt milay
            setTimeout(() => performForensic(event.mint), 90000);
        }
    });
    ws.on('close', () => setTimeout(startRadar, 3000));
}
startRadar();
