require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const WebSocket = require('ws');

// ==================== CONFIG ====================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8006731872";
const HELIUS_RPC = process.env.HELIUS_RPC || `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alertedMints = new Set();
let totalScanned = 0;

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
const warn = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ⚠️  ${msg}`);
const error = (msg) => console.error(`[${new Date().toLocaleTimeString()}] ❌ ${msg}`);

// ==================== FORENSIC LOGIC ====================

async function checkWarmWallet(creator) {
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, 
            method: "getSignaturesForAddress", 
            params: [creator, { limit: 500 }]
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 8000 });

        const txs = res.data.result || [];
        if (txs.length === 0) return { warm: false, reason: "No History" };

        const oldestTx = txs[txs.length - 1];
        const newestTx = txs[0];
        const ageDays = ((newestTx.blockTime - oldestTx.blockTime) * 1000) / (1000 * 60 * 60 * 24);

        if (ageDays < 90) return { warm: false, reason: `Too Young (${ageDays.toFixed(1)}d)` };

        const balRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getBalance", params: [creator]
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 5000 });

        const bal = (balRes.data.result.value || 0) / 1e9;
        if (bal < 2) return { warm: false, reason: `Low Balance (${bal.toFixed(2)} SOL)` };

        return { warm: true, age: ageDays.toFixed(1), bal: bal.toFixed(2) };
    } catch (e) { 
        return { warm: false, reason: "RPC Error" }; 
    }
}

// ==================== MONITORING WITH REJECTION LOGS ====================

function startGraduateRadar() {
    log('🚀 V15.0: GRADUATE RADAR WITH LIVE REJECTION LOGS');
    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    ws.on('open', () => {
        log('✅ Connected! Watching all trades for Raydium Migrations...');
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            totalScanned++;

            // Log every 50th trade to show bot is alive
            if (totalScanned % 50 === 0) log(`🔍 Scanning... Total trades checked: ${totalScanned}`);

            // Check if it's a graduation event
            if (event.txType === 'raydium_migration') {
                const mint = event.mint;
                if (!mint || alertedMints.has(mint)) return;
                
                log(`\n🎓 [MATCH FOUND]: Token Graduating!`);
                log(`   Mint: ${mint}`);

                const dev = event.traderPublicKey;
                const forensic = await checkWarmWallet(dev);

                if (forensic.warm) {
                    log(`🚀 [CRITERIA PASSED]: Sending Telegram Alert!`);
                    alertedMints.add(mint);
                    const msg = `🎓 **RAYDIUM GRADUATE FOUND**\n\n` +
                                `📋 Mint: \`${mint}\`\n` +
                                `✅ Age: ${forensic.age} days\n` +
                                `💰 Balance: ${forensic.bal} SOL\n\n` +
                                `📈 [DexScreener](https://dexscreener.com/solana/${mint})`;
                    await bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown' });
                } else {
                    // YEH HAI WO LOG JO AAPNE MANGA HAI (REJECTION LOG)
                    warn(`[REJECTED]: Dev failed forensic. Reason: ${forensic.reason}`);
                }
            } else {
                // Optional: Agar aap har trade ka rejection dekhna chahte hain (Bohat zyada logs ho jayenge)
                // warn(`[SKIP]: Normal trade detected, not a graduation.`);
            }
        } catch (e) { }
    });

    ws.on('close', () => {
        error('Connection lost. Reconnecting in 5s...');
        setTimeout(startGraduateRadar, 5000);
    });
}

startGraduateRadar();
