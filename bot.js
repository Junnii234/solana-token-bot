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
const HEADERS = { 'Content-Type': 'application/json' };

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
const error = (msg) => console.error(`[${new Date().toLocaleTimeString()}] ❌ ${msg}`);
const reject = (reason) => console.log(`[${new Date().toLocaleTimeString()}] ⚠️  REJECT: ${reason}`);

// ==================== WARM WALLET DETECTION ====================

async function checkWarmWallet(creator) {
    try {
        log(`   🔍 Analyzing Dev Wallet: ${creator.slice(0, 10)}...`);
        
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, 
            method: "getSignaturesForAddress", 
            params: [creator, { limit: 300 }]
        }, { headers: HEADERS, timeout: 5000 });

        const txs = res.data.result || [];

        // Check 1: Transaction History
        if (txs.length === 0) {
            reject(`No transaction history`);
            return { warm: false };
        }

        // Check 2: Age >= 90 days
        const oldestTx = txs[txs.length - 1];
        const newestTx = txs[0];
        const walletAgeMs = (newestTx.blockTime - oldestTx.blockTime) * 1000;
        const walletAgeDays = walletAgeMs / (1000 * 60 * 60 * 24);

        if (walletAgeDays < 90) {
            reject(`Age: ${walletAgeDays.toFixed(1)}d (need 90+)`);
            return { warm: false };
        }

        // Check 3: Balance >= 2 SOL
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

        log(`   ✅ WARM WALLET VERIFIED`);
        return { 
            warm: true, 
            age: walletAgeDays.toFixed(1),
            txCount: txs.length,
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
            `• Balance: ${metrics.balance} SOL\n` +
            `• History: ${metrics.txCount} txs\n\n` +
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
            log(`   Mint: ${mint}`);

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
║  🚀 V12.0 - HYBRID WEBSOCKET MONITOR                      ║
║  🔥 Real Dev Detection (90+d, 2+SOL)                       ║
║  ⚡ Powered by PumpPortal & Helius                        ║
╚════════════════════════════════════════════════════════════╝
    `);

    log("✅ System Check Passed");
    log(`📱 Telegram Bot: Active`);
    log(`🔗 Helius RPC: Connected\n`);

    monitorPumpFun();
}

startup();
