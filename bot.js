require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// --- 1. CONFIGURATION ---
const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_API_KEY = "cad2ea55-0ae1-4005-8b8a-3b04167a57fb";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alerted = new Set();
const CEX_LIST = ["Binance", "OKX", "Bybit", "FixedFloat", "ChangeNOW", "Gate.io", "Kucoin"];

// --- 2. THE RADAR (WebSocket from bot (4).js) ---
function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    ws.on('open', () => {
        console.log('🛡️ V48: RADAR ONLINE - HUNTING PUMP.FUN...');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (!event.mint || alerted.has(event.mint)) return;
            
            // Minimal filter to catch everything first
            alerted.add(event.mint);
            console.log(`\n🎯 DETECTED: ${event.symbol} | Analyzing...`);
            
            // Deep Forensic start karein
            performForensic(event.mint, event.traderPublicKey);
        } catch (e) { }
    });

    ws.on('close', () => {
        console.log("⚠️ Radar Connection Lost. Reconnecting...");
        setTimeout(startRadar, 3000);
    });
}

// --- 3. THE FORENSIC ENGINE (Upgraded from bot (5).js) ---
async function performForensic(mint, devWallet) {
    try {
        // Step 1: Check Socials (Helius Asset API)
        const asset = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        });
        const data = JSON.stringify(asset.data.result || "").toLowerCase();
        const hasSocials = data.includes("t.me/") || data.includes("x.com/") || data.includes("twitter.com/");

        // Step 2: Dev Wallet Analysis (History + Age)
        const sigsRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [devWallet, { limit: 100 }]
        });
        const sigs = sigsRes.data.result || [];
        const txCount = sigs.length;
        
        // Age calculation
        const genesis = sigs[sigs.length - 1];
        const ageMins = (Date.now() / 1000 - genesis.blockTime) / 60;

        // Step 3: CEX Funding Check
        const fundTx = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [genesis.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        const fundLogs = JSON.stringify(fundTx.data.result?.meta?.logMessages || "").toLowerCase();
        const isCEX = CEX_LIST.some(cex => fundLogs.includes(cex.toLowerCase()));

        console.log(`   📊 Stats: Age: ${ageMins.toFixed(0)}m | Txs: ${txCount} | CEX: ${isCEX ? '✅' : '❌'}`);

        // --- CRITERIA (The Elite Filter) ---
        // Alert bhejien agar: CEX funding ho OR Wallet 3h+ purana ho OR History 20+ txs ho (AND Socials lazmi hon)
        if ((isCEX || ageMins > 180 || txCount > 20) && hasSocials) {
            const msg = `🌟 *ELITE SIGNAL SPOTTED (V48)*\n\n` +
                        `📍 Mint: \`${mint}\`\n` +
                        `💰 Fund: ${isCEX ? 'CEX Verified ✅' : 'Personal Wallet'}\n` +
                        `🕒 Dev Age: ${ageMins.toFixed(0)} mins\n` +
                        `📊 Dev History: ${txCount} txs\n\n` +
                        `🔗 [DexScreener](https://dexscreener.com/solana/${mint})`;

            await bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown' });
            console.log(`✅ ALERT SENT!`);
        } else {
            console.log(`   ❌ Rejected: Did not meet Elite criteria.`);
        }
    } catch (e) { console.log(`   ⚠️ Forensic blip for ${mint.substring(0,5)}`); }
}

// --- STARTUP ---
bot.sendMessage(TELEGRAM_CHAT_ID, "✅ *V48 Online:* Webhook-Free Radar Active!");
startRadar();

// Cache management
setInterval(() => { if(alerted.size > 2000) alerted.clear(); }, 3600000);
