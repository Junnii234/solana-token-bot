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

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] 🟢 ${msg}`);
const error = (msg) => console.error(`[${new Date().toLocaleTimeString()}] ❌ ${msg}`);
const reject = (reason) => console.log(`[${new Date().toLocaleTimeString()}] ⚠️ REJECT: ${reason}`);

// ==================== AGE & BALANCE LOGIC (V23.2) ====================

async function checkWarmWallet(creator) {
    try {
        log(`   🔍 Analyzing Dev Wallet: ${creator.slice(0, 10)}...`);
        
        // Aaj ka waqt (Seconds mein)
        const nowInSeconds = Math.floor(Date.now() / 1000);

        // 1. Sab se PURANI transaction (OldestFirst) uthana
        const oldestRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, 
            method: "getSignaturesForAddress", 
            params: [creator, { limit: 1, oldestFirst: true }] 
        }, { headers: HEADERS, timeout: 10000 });

        const oldestTx = oldestRes.data.result?.[0];

        if (!oldestTx) {
            reject(`No transaction history found on-chain`);
            return { warm: false };
        }

        // Calculation Logic: Agar blockTime null ho to current time use karein
        const birthTime = oldestTx.blockTime || nowInSeconds;
        const walletAgeSeconds = nowInSeconds - birthTime;
        const walletAgeDays = walletAgeSeconds / 86400;

        // Check 1: Age Filter (90 Days)
        if (walletAgeDays < 90) {
            reject(`Age: ${walletAgeDays.toFixed(1)}d (Criteria: 90+ Required)`);
            return { warm: false };
        }

        // Check 2: Balance Filter (2 SOL)
        const balanceRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, 
            method: "getBalance", 
            params: [creator]
        }, { headers: HEADERS, timeout: 5000 });

        const balanceSol = (balanceRes.data.result.value || 0) / 1e9;
        if (balanceSol < 2) {
            reject(`Age: ${walletAgeDays.toFixed(1)}d | Balance: ${balanceSol.toFixed(2)} SOL (Criteria: 2+ Required)`);
            return { warm: false };
        }

        log(`   ✅ CRITERIA PASSED: ${walletAgeDays.toFixed(1)} days | ${balanceSol.toFixed(2)} SOL`);
        return { 
            warm: true, 
            age: walletAgeDays.toFixed(1),
            balance: balanceSol.toFixed(2)
        };

    } catch (e) {
        error(`Forensic Logic Error: ${e.message}`);
        return { warm: false };
    }
}

// ==================== TELEGRAM NOTIFICATION ====================

async function sendAlert(mint, name, metrics) {
    try {
        const report = 
            `🚀 **VERIFIED DEV DETECTED** 🚀\n\n` +
            `**Token:** ${name}\n` +
            `**Mint:** \`${mint}\`\n\n` +
            `📊 **Dev Statistics:**\n` +
            `• Wallet Age: ${metrics.age} days\n` +
            `• Current Balance: ${metrics.balance} SOL\n\n` +
            `🔗 [Pump.Fun](https://pump.fun/${mint})\n` +
            `📈 [DexScreener](https://dexscreener.com/solana/${mint})`;

        await bot.sendMessage(TELEGRAM_CHAT_ID, report, { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });
        
        log(`📤 Telegram Alert Sent for: ${name}`);
        return true;

    } catch (e) {
        error(`Telegram Alert Failed: ${e.message}`);
        return false;
    }
}

// ==================== MONITORING LOGIC ====================

function monitorPumpFun() {
    log('📡 Connecting to PumpPortal WebSocket...');
    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    ws.on('open', () => {
        log('✅ Connected! Watching for New Tokens...');
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

            log(`\n🎯 NEW TOKEN: ${name} (${mint.slice(0, 6)}...)`);
            const walletCheck = await checkWarmWallet(creator);

            if (walletCheck.warm) {
                log(`🚀 BINGO! Sending alert to Telegram...`);
                await sendAlert(mint, name, walletCheck);
            }

        } catch (e) {
            error(`Message processing error: ${e.message}`);
        }
    });

    ws.on('close', () => {
        error('WebSocket Closed. Reconnecting in 5s...');
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
║  🛡️  BOT V23.2 - BULLETPROOF AGE LOGIC                    ║
║  🔥  Filtering: 90+ Days & 2+ SOL Balance                 ║
╚════════════════════════════════════════════════════════════╝
    `);

    log("✅ Starting Monitoring...");
    monitorPumpFun();
}

startup();
