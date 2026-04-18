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

console.log('📡 V83 ONLINE: Active Graduation Hunter & Trade Streamer...');

async function checkMigrationGem(mint, mcap, chatId = TELEGRAM_CHAT_ID) {
    try {
        console.log(`🔍 Forensic Check for: ${mint.substring(0,8)}... (MCap: ${mcap.toFixed(1)} SOL)`);
        
        // Holder Distribution Check
        const holdersRes = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint] 
        }, { headers: HEADERS });
        
        const holders = holdersRes.data.result.value;
        if (!holders || holders.length < 5) return;

        let top10Sum = 0;
        // Raydium par jane ke baad Top 10 (excluding Raydium Pool if possible)
        holders.slice(0, 10).forEach(h => top10Sum += (h.uiAmount / 1000000000) * 100);

        if (top10Sum > 25) {
            console.log(`❌ REJECTED: Distribution too heavy (${top10Sum.toFixed(1)}%)`);
            return;
        }

        const assetRes = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } }, { headers: HEADERS });
        const metaStr = JSON.stringify(assetRes.data.result || "").toLowerCase();
        const hasSocials = metaStr.includes("t.me/") || metaStr.includes("x.com/") || metaStr.includes("twitter.com/");

        if (hasSocials) {
            const name = assetRes.data.result?.content?.metadata?.name || "Unknown";
            const report = `🎓 **PUMPSWAP / RAYDIUM GEM** 🎓\n\n` +
                           `🏷️ **Name:** ${name}\n` +
                           `💰 **Market Cap:** ${mcap.toFixed(1)} SOL ✅\n` +
                           `👥 **Top 10 Holders:** ${top10Sum.toFixed(1)}% ✅\n\n` +
                           `🔗 [DexScreener](https://dexscreener.com/solana/${mint})`;
            
            await bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
            console.log(`✅ ALERT SENT: ${name}`);
        }
    } catch (e) { console.log(`Error: ${e.message}`); }
}

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    
    ws.on('open', () => {
        console.log('✅ WebSocket Connected - Streaming Trades...');
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            
            // Logs mein har trade dikhayega taake tasalli rahe ke bot chal raha hai
            if (event.mint) {
                // Graduation ki dehleez (78 SOL se upar)
                if (event.marketCapSol >= 78 && !alertedMints.has(event.mint)) {
                    alertedMints.add(event.mint);
                    console.log(`🔥 GRADUATION DETECTED: ${event.mint.substring(0,8)}...`);
                    setTimeout(() => checkMigrationGem(event.mint, event.marketCapSol), 10000);
                }
            }
        } catch (e) {}
    });

    ws.on('error', (err) => console.log('WebSocket Error:', err.message));
    ws.on('close', () => {
        console.log('🔄 Connection closed. Reconnecting...');
        setTimeout(startRadar, 3000);
    });
}

startRadar();
