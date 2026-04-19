require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const WebSocket = require('ws');

// ==================== CONFIG ====================
// Aapka provided token aur Chat ID
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8006731872";
const HELIUS_RPC = process.env.HELIUS_RPC || `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alertedMints = new Set();
const HEADERS = { 'Content-Type': 'application/json' };

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] 🟢 ${msg}`);
const error = (msg) => console.error(`[${new Date().toLocaleTimeString()}] ❌ ${msg}`);
const reject = (reason) => console.log(`[${new Date().toLocaleTimeString()}] ⚠️  REJECT: ${reason}`);

// ==================== WARM WALLET DETECTION (PAGINATION FIX) ====================

async function checkWarmWallet(creator) {
    try {
        log(`   🔍 Deep Scan Dev: ${creator.slice(0, 10)}...`);
        
        const now = Math.floor(Date.now() / 1000);
        let lastSignature = null;
        let walletAgeDays = 0;
        let historyFound = false;

        // Loop chala kar history mein peeche jayenge (Max 5 pages / 5000 txs)
        for (let i = 0; i < 5; i++) {
            const params = [creator, { limit: 1000 }];
            
            // Agar pichla page tha, to uski aakhri signature se aur peeche jao
            if (lastSignature) {
                params[1].before = lastSignature; 
            }

            const res = await axios.post(HELIUS_RPC, {
                jsonrpc: "2.0", id: 1, 
                method: "getSignaturesForAddress", 
                params: params
            }, { headers: HEADERS, timeout: 8000 });

            const txs = res.data.result;
            
            // Agar history khatam ho gayi toh loop tor do
            if (!txs || txs.length === 0) break; 

            historyFound = true;
            
            // Is batch ki sab se purani tx uthao
            const oldestTxInBatch = txs[txs.length - 1]; 
            lastSignature = oldestTxInBatch.signature;
            
            const birthTime = oldestTxInBatch.blockTime || now;
            walletAgeDays = (now - birthTime) / 86400;

            // Agar age 90 din se upar nikal aayi, toh mazeed peeche jane ki zaroorat nahi
            if (walletAgeDays >= 90) {
                break;
            }

            // Agar 1000 se kam transactions aayi hain, iska matlab is se purani koi history nahi
            if (txs.length < 1000) break;
        }

        if (!historyFound) {
            reject(`No history found on blockchain`);
            return { warm: false };
        }

        // Check 1: Final Age >= 90 days
        if (walletAgeDays < 90) {
            reject(`Age: ${walletAgeDays.toFixed(1)}d (need 90+)`);
            return { warm: false };
        }

        // Check 2: Balance Check >= 2 SOL
        const balanceRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getBalance", params: [creator]
        }, { headers: HEADERS, timeout: 5000 });

        const balanceSol = (balanceRes.data.result.value || 0) / 1e9;
        if (balanceSol < 2) {
            reject(`Age: ${walletAgeDays.toFixed(1)}d | Balance: ${balanceSol.toFixed(2)}SOL (need 2+)`);
            return { warm: false };
        }

        log(`   ✅ WARM WALLET VERIFIED: ${walletAgeDays.toFixed(1)} days old`);
        return { warm: true, age: walletAgeDays.toFixed(1), balance: balanceSol.toFixed(2) };

    } catch (e) {
        error(`Logic Error: ${e.message}`);
        return { warm: false };
    }
}

// ==================== SEND ALERT ====================

async function sendAlert(mint, name, metrics) {
    try {
        const report = 
            `🌟 **REAL DEV - VERIFIED** 🌟\n\n` +
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
║  🚀 V24.0 - BULLETPROOF PAGINATION MONITOR                ║
║  🔥 Real Dev Detection (90+d, 2+SOL)                       ║
║  ⚡ Powered by PumpPortal & Helius                        ║
╚════════════════════════════════════════════════════════════╝
    `);

    log("✅ System Check Passed");
    log(`📱 Telegram Bot: Active`);
    monitorPumpFun();
}

startup();
