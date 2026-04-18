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

console.log('📡 V84 ONLINE: Heartbeat Active & Radar at 60 SOL...');

async function checkMigrationGem(mint, mcap, chatId = TELEGRAM_CHAT_ID) {
    try {
        console.log(`🔍 Forensic Check: ${mint.substring(0,6)}... (MCap: ${mcap.toFixed(1)} SOL)`);
        
        const holdersRes = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint] 
        }, { headers: HEADERS });
        
        const holders = holdersRes.data.result.value;
        if (!holders || holders.length < 5) return;

        let top10Sum = 0;
        holders.slice(0, 10).forEach(h => top10Sum += (h.uiAmount / 1000000000) * 100);

        if (top10Sum > 25) {
            console.log(`❌ REJECTED: Top 10 too heavy (${top10Sum.toFixed(1)}%)`);
            return;
        }

        const assetRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } }, { headers: HEADERS });
        const metaStr = JSON.stringify(assetRes.data.result || "").toLowerCase();
        const hasSocials = metaStr.includes("t.me/") || metaStr.includes("x.com/") || metaStr.includes("twitter.com/");

        if (hasSocials) {
            const name = assetRes.data.result?.content?.metadata?.name || "Unknown";
            const report = `🎓 **PUMPSWAP RADAR ALERT** 🎓\n\n` +
                           `🏷️ **Name:** ${name}\n` +
                           `💰 **Market Cap:** ${mcap.toFixed(1)} SOL 🔥\n` +
                           `👥 **Top 10 Holders:** ${top10Sum.toFixed(1)}% ✅\n\n` +
                           `🔗 [DexScreener](https://dexscreener.com/solana/${mint})`;
            
            await bot.sendMessage(chatId, report, { parse_mode: 'Markdown', disable_web_page_preview: true });
            console.log(`✅ ALERT SENT: ${name}`);
        } else {
            console.log(`❌ REJECTED: No Socials Found.`);
        }
    } catch (e) { console.log(`Forensic Error: ${e.message}`); }
}

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    let tradeCount = 0; // Trade counter for heartbeat
    
    ws.on('open', () => {
        console.log('✅ WebSocket Connected - Firehose Active!');
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            
            if (event.mint) {
                tradeCount++;
                
                // 💓 HAR 50 TRADES KE BAAD LOG AAYEGA TAASALLI KE LIYE
                if (tradeCount % 50 === 0) {
                    console.log(`💓 [Heartbeat] Bot is awake. Scanned ${tradeCount} trades so far...`);
                }

                // 🛑 LIMIT DROPPED TO 60 SOL
                if (event.marketCapSol >= 60 && !alertedMints.has(event.mint)) {
                    alertedMints.add(event.mint);
                    console.log(`🔥 HIGH POTENTIAL DETECTED: ${event.mint.substring(0,6)}... (${event.marketCapSol.toFixed(1)} SOL)`);
                    setTimeout(() => checkMigrationGem(event.mint, event.marketCapSol), 5000);
                }
            }
        } catch (e) {}
    });

    // Ping/Pong logic to prevent silent drops
    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    }, 30000);

    ws.on('close', () => {
        clearInterval(pingInterval);
        console.log('🔄 WebSocket Disconnected. Reconnecting in 3 seconds...');
        setTimeout(startRadar, 3000);
    });

    ws.on('error', (err) => {
        console.log(`⚠️ WebSocket Error: ${err.message}`);
    });
}

startRadar();
