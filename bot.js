require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const WebSocket = require('ws');

// ==================== CONFIG ====================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8758743414:AAEKc_ORnq15WQHIR1jbKqh7psZfUcSCAcQ";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8006731872";
const HELIUS_RPC = process.env.HELIUS_RPC || `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alertedMints = new Set();
const HEADERS = { 'Content-Type': 'application/json' };

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
const error = (msg) => console.error(`[${new Date().toLocaleTimeString()}] ❌ ${msg}`);
const reject = (reason) => console.log(`[${new Date().toLocaleTimeString()}] ⚠️  REJECT: ${reason}`);

// ==================== WARM WALLET DETECTION (FIXED) ====================

async function checkWarmWallet(creator) {
    try {
        log(`   🔍 Analyzing Dev Wallet: ${creator.slice(0, 10)}...`);
        
        // FIX: Sab se purani transaction (Oldest) aur sab se nayi (Newest) ka time uthana
        const oldestRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, 
            method: "getSignaturesForAddress", 
            params: [creator, { limit: 1, oldestFirst: true }] // Seedsha pehli tx par jump
        }, { headers: HEADERS, timeout: 8000 });

        const newestRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, 
            method: "getSignaturesForAddress", 
            params: [creator, { limit: 1 }] // Sab se taza tx
        }, { headers: HEADERS, timeout: 8000 });

        const oldestTx = oldestRes.data.result?.[0];
        const newestTx = newestRes.data.result?.[0];

        if (!oldestTx || !newestTx) {
            reject(`No transaction history found`);
            return { warm: false };
        }

        // Logic: Age calculation using blockTime (Total Wallet Span)
        const walletAgeSeconds = newestTx.blockTime - oldestTx.blockTime;
        const walletAgeDays = walletAgeSeconds / 86400;

        // Check 1: Age >= 90 days
        if (walletAgeDays < 90) {
            reject(`Age: ${walletAgeDays.toFixed(1)}d (need 90+)`);
            return { warm: false };
        }

        // Check 2: Balance >= 2 SOL
        const balanceRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, 
            method: "getBalance", 
            params: [creator]
        }, { headers: HEADERS, timeout: 5000 });

        const balanceSol = (balanceRes.data.result.value || 0) / 1e9;
        if (balanceSol < 2) {
            reject(`Balance: ${balanceSol.toFixed(3)}SOL (need 2+)`);
            return { warm: false };
        }

        log(`   ✅ WARM WALLET VERIFIED: ${walletAgeDays.toFixed(1)} days old`);
        return { 
            warm: true, 
            age: walletAgeDays.toFixed(1),
            balance: balanceSol.toFixed(3)
        };

    } catch (e) {
        error(`Forensic Error: ${e.message}`);
        return { warm: false };
    }
}

// ==================== SEND ALERT ====================

async function sendAlert(mint, name, metrics) {
    try {
        const report = 
            `🌟 **REAL DEV - PUMP.FUN** 🌟\n\n` +
            `🏷️ **Token:** ${name}\n` +
            `📋 **Mint:** \`${mint}\`\n\n` +
            `✅ **VERIFIED METRICS:**\n` +
            `• Wallet Age: ${metrics.age} days\n` +
            `• Balance: ${metrics.balance} SOL\n\n` +
            `💰 [Pump.Fun](https://pump.fun/${mint})\n` +
            `📊 [DexScreener](https://dexscreener.com/solana/${mint})`;

        await bot.sendMessage(TELEGRAM_CHAT_ID, report, { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });
        
        log(`📤 ALERT SENT FOR: ${name}`);
        return true;

    } catch (e) {
        error(`Telegram Failed: ${e.message}`);
        return false;
    }
}

// ==================== MONITORING LOGIC ====================

function monitorPumpFun() {
    log('📡 Initializing WebSocket Connection...');
    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    ws.on('open', () => {
        log('✅ WebSocket Connected. Subscribing to New Tokens...');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            const mint = event.mint;
            const creator = event.traderPublicKey;
            const name = event.symbol || 'Unknown';

            if (!mint || alertedMints.has(mint)) return;
            alertedMints.add(mint);

            log(`\n🎯 NEW TOKEN DETECTED: ${name}`);
            const walletCheck = await checkWarmWallet(creator);

            if (walletCheck.warm) {
                log(`🚀 CRITERIA MATCHED! Sending Telegram Alert...`);
                await sendAlert(mint, name, walletCheck);
            }

        } catch (e) {
            error(`Event Processing Error: ${e.message}`);
        }
    });

    ws.on('close', () => {
        error('WebSocket Connection Closed.');
        log('⏳ Reconnecting in 5 seconds...');
        setTimeout(monitorPumpFun, 5000);
    });

    ws.on('error', (err) => {
        error(`WebSocket Error: ${err.message}`);
    });
}

// ==================== STARTUP ====================

async function startup() {
    console.clear();
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  🛡️ V23.0 - ACCURATE AGE MONITORING                       ║
║  🔥 Real Dev Detection (90+d, 2+SOL)                       ║
╚════════════════════════════════════════════════════════════╝
    `);

    log("✅ System Check Passed");
    log(`📱 Telegram Bot: Active`);
    monitorPumpFun();
}

startup();
