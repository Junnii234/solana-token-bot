require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: { autoStart: true } });
const alertedMints = new Set();
const HEADERS = { 'Content-Type': 'application/json' };

const BONDING_CURVE_ID = "5Q544fKrSJuDbupS2YvS3287Z9SNMo7sD6YBa9C8DVz";

console.log('💎 V78 ONLINE: PIBBUNI-Fix & Moon-Shot Logic Active.');

async function performForensic(mint, chatId = TELEGRAM_CHAT_ID) {
    try {
        // 1. Budget & Basic Data (Single Call for efficiency)
        const sigsRes = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint, { limit: 5 }] 
        }, { headers: HEADERS });
        
        if (!sigsRes.data.result || sigsRes.data.result.length === 0) return;
        const launchSig = sigsRes.data.result[sigsRes.data.result.length - 1].signature;
        
        const txRes = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getTransaction", 
            params: [launchSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }] 
        }, { headers: HEADERS });

        const launchBudget = txRes.data.result.meta.preBalances[0] / 1e9;

        // 2. Holders Check (Cleaned Logic)
        const holdersRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint] }, { headers: HEADERS });
        const holders = holdersRes.data.result.value;

        let curveSupply = 0;
        let realTop10Sum = 0;

        if (holders && holders.length > 0) {
            // First holder is ALWAYS the bonding curve on pump.fun
            curveSupply = (holders[0].uiAmount / 1000000000) * 100;
            
            // Calculate Top 10 excluding the curve
            let count = 0;
            for (let i = 1; i < holders.length && count < 10; i++) {
                realTop10Sum += (holders[i].uiAmount / 1000000000) * 100;
                count++;
            }
        }

        // 3. Metadata
        const assetRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } }, { headers: HEADERS });
        const name = assetRes.data.result?.content?.metadata?.name || "Unknown";
        const metaStr = JSON.stringify(assetRes.data.result || "").toLowerCase();
        const hasSocials = metaStr.includes("t.me/") || metaStr.includes("x.com/") || metaStr.includes("twitter.com/");

        console.log(`\n--- 🕵️‍♂️ Token: ${name} ---`);
        console.log(`💰 Budget: ${launchBudget.toFixed(2)} SOL`);
        console.log(`📉 Curve: ${curveSupply.toFixed(1)}%`);
        console.log(`👥 Top 10: ${realTop10Sum.toFixed(1)}%`);

        // --- 📊 REFINED FILTERS ---
        // Budget abnormal filter ko broad kiya (PIBBUNI often have higher budgets)
        const validBudget = launchBudget >= 0.1 && launchBudget < 100;
        const curveDraining = curveSupply < 88; // 85-90% is the sweet spot
        const healthyDistribution = realTop10Sum < 35;

        if (!validBudget) {
            console.log(`⛔ REJECTED: Abnormal Budget (${launchBudget.toFixed(2)} SOL)`);
        } else if (!curveDraining) {
            console.log(`⛔ REJECTED: Curve too full (${curveSupply.toFixed(1)}%)`);
        } else if (!healthyDistribution) {
            console.log(`⛔ REJECTED: Top 10 too heavy (${realTop10Sum.toFixed(1)}%)`);
        } else if (!hasSocials) {
            console.log(`⛔ REJECTED: No Socials Found.`);
        } else {
            console.log(`✅ MOON-SHOT ALERT!`);
            const report = `🌟 *MOON-SHOT DETECTED* 🚀\n\n` +
                           `🏷️ **Name:** ${name}\n` +
                           `📉 **Curve:** ${curveSupply.toFixed(1)}% (Draining) ✅\n` +
                           `💰 **Budget:** ${launchBudget.toFixed(2)} SOL ✅\n` +
                           `👥 **Real Top 10:** ${realTop10Sum.toFixed(1)}% ✅\n\n` +
                           `🔗 [Jupiter](https://jup.ag/swap/SOL-${mint}) | [DexScreener](https://dexscreener.com/solana/${mint})`;
            await bot.sendMessage(chatId, report, { parse_mode: 'Markdown', disable_web_page_preview: true });
        }

    } catch (e) { console.log(`Error: ${e.message}`); }
}

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    ws.on('open', () => {
        console.log('✅ Radar Connected to PumpPortal');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
    });
    ws.on('message', async (data) => {
        const event = JSON.parse(data.toString());
        if (event.mint && !alertedMints.has(event.mint)) {
            alertedMints.add(event.mint);
            console.log(`🔔 Monitoring: ${event.mint.substring(0,8)}...`);
            // PIBBUNI jaise fast tokens ke liye time 45 seconds kar diya
            setTimeout(() => performForensic(event.mint), 45000);
        }
    });
    ws.on('close', () => setTimeout(startRadar, 3000));
}
startRadar();
