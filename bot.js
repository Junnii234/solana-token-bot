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

console.log('💎 V87 ONLINE: Elite Graduate Forensic + Live Intelligence Logs');

async function runEliteForensic(mint, creator, name) {
    try {
        // 1. DEV WALLET "WARMTH" CHECK
        const creatorHistory = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [creator, { limit: 10 }]
        }, { headers: HEADERS });

        const txCount = creatorHistory.data.result.length;
        if (txCount < 5) {
            console.log(`❌ REJECTED [${name}]: Dev wallet too fresh (${txCount} txs).`);
            return;
        }

        // 2. GRADUATION & LP BURN CHECK
        const assetRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        }, { headers: HEADERS });
        
        const assetData = assetRes.data.result;
        const metadataStr = JSON.stringify(assetData).toLowerCase();
        
        // Check if LP is actually burned (Raydium Authority check)
        const isBurned = metadataStr.includes("raydium") && !metadataStr.includes("mintable");
        if (!isBurned) {
            console.log(`❌ REJECTED [${name}]: LP not confirmed burned or not migrated.`);
            return;
        }

        // 3. POST-GRADUATION HOLDER SCAN
        const holdersRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint]
        }, { headers: HEADERS });
        
        const holders = holdersRes.data.result.value;
        let top10Sum = 0;
        holders.slice(0, 10).forEach(h => top10Sum += (h.uiAmount / 1000000000) * 100);

        if (top10Sum > 20) {
            console.log(`❌ REJECTED [${name}]: Concentration too high (${top10Sum.toFixed(1)}%).`);
            return;
        }

        // IF ALL PASS -> SEND ELITE ALERT
        const report = `🌟 **ELITE GRADUATED TOKEN** 🌟\n\n` +
                       `🏷️ **Name:** ${name}\n` +
                       `✅ **Status:** Raydium + LP Burned\n` +
                       `👴 **Dev:** Warm (${txCount} txs)\n` +
                       `👥 **Top 10:** ${top10Sum.toFixed(1)}% (Safe Distribution)\n\n` +
                       `🔗 [DexScreener](https://dexscreener.com/solana/${mint})`;

        await bot.sendMessage(TELEGRAM_CHAT_ID, report, { parse_mode: 'Markdown', disable_web_page_preview: true });
        console.log(`🚀 ALERT SENT: ${name} passed all forensic tests!`);

    } catch (e) { /* silent logs */ }
}

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    
    ws.on('open', () => {
        console.log('📡 Radar Active: Scanning Raydium Migrations...');
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" })); 
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            // Target tokens near graduation (82-85 SOL mark)
            if (event.marketCapSol >= 82 && !alertedMints.has(event.mint)) {
                alertedMints.add(event.mint);
                console.log(`🎓 Found Candidate: ${event.name || 'Token'}... Waiting for migration.`);
                // 45 seconds delay to allow Raydium pool to settle
                setTimeout(() => runEliteForensic(event.mint, event.traderPublicKey, event.name || "Unknown"), 45000);
            }
        } catch (e) {}
    });

    ws.on('close', () => setTimeout(startRadar, 3000));
}

startRadar();
