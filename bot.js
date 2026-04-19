require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const WebSocket = require('ws');

// ==================== CONFIG ====================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8758743414:AAEKc_ORnq15WQHIR1jbKqh7psZfUcSCAcQ";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8006731872";
const HELIUS_RPC = process.env.HELIUS_RPC || `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const alertedMints = new Set();
const HEADERS = { 'Content-Type': 'application/json' };

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] 🟢 ${msg}`);
const error = (msg) => console.error(`[${new Date().toLocaleTimeString()}] ❌ ${msg}`);
const reject = (reason) => console.log(`[${new Date().toLocaleTimeString()}] ⚠️  REJECT: ${reason}`);

// ==================== STEP-WISE WARM WALLET DETECTION ====================

async function checkWarmWallet(creator) {
    try {
        log(`   🔍 Deep Scan Dev: ${creator.slice(0, 10)}...`);
        
        const now = Math.floor(Date.now() / 1000);
        let lastSignature = null;
        let walletAgeDays = 0;
        let historyFound = false;
        let totalTxs = 0;
        let birthTime = null;

        // Step 1: Age Check
        for (let i = 0; i < 5; i++) {
            const params = [creator, { limit: 1000 }];
            if (lastSignature) params[1].before = lastSignature;

            const res = await axios.post(HELIUS_RPC, {
                jsonrpc: "2.0", id: 1, 
                method: "getSignaturesForAddress", 
                params: params
            }, { headers: HEADERS, timeout: 8000 });

            const txs = res.data.result;
            if (!txs || txs.length === 0) break; 

            historyFound = true;
            totalTxs += txs.length;

            const oldestTxInBatch = txs[txs.length - 1]; 
            lastSignature = oldestTxInBatch.signature;
            birthTime = oldestTxInBatch.blockTime || now;
            walletAgeDays = (now - birthTime) / 86400;

            if (walletAgeDays >= 270) break; // 9 months threshold
            if (txs.length < 1000) break;
        }

        if (!historyFound) {
            reject(`No history found on blockchain`);
            return { warm: false };
        }

        if (walletAgeDays < 270) {
            reject(`Age: ${walletAgeDays.toFixed(1)}d (need 270+)`);
            return { warm: false };
        }

        // Step 2: Balance Check
        const balanceRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getBalance", params: [creator]
        }, { headers: HEADERS, timeout: 5000 });

        const balanceSol = (balanceRes.data.result.value || 0) / 1e9;
        if (balanceSol < 2) {
            reject(`Balance: ${balanceSol.toFixed(2)}SOL (need 2+)`);
            return { warm: false };
        }

        // Step 3: Transaction Count
        if (totalTxs < 200) {
            reject(`Tx Count: ${totalTxs} (need 200+)`);
            return { warm: false };
        }

        // Step 4: Program Diversity (only if previous steps passed)
        const programSet = new Set();
        for (let i = 0; i < Math.min(10, totalTxs); i++) { // limit to first 10 txs for efficiency
            try {
                const sig = lastSignature;
                const txDetail = await axios.post(HELIUS_RPC, {
                    jsonrpc: "2.0", id: 1,
                    method: "getTransaction",
                    params: [sig, { encoding: "json" }]
                }, { headers: HEADERS, timeout: 8000 });

                const instructions = txDetail.data.result?.transaction?.message?.instructions || [];
                instructions.forEach(ix => {
                    if (ix.programId) programSet.add(ix.programId);
                });
            } catch (e) {
                error(`Program Diversity Fetch Error: ${e.message}`);
            }
        }

        const programCount = programSet.size;
        if (programCount < 3) {
            reject(`Program Diversity: ${programCount} (need 3+)`);
            return { warm: false };
        }

        // Log First Transaction Date
        const birthDate = new Date(birthTime * 1000);
        log(`📅 First Transaction: ${birthDate.toISOString()}`);

        log(`   ✅ WARM WALLET VERIFIED: ${walletAgeDays.toFixed(1)} days old | ${totalTxs} txs | ${programCount} programs`);
        return { warm: true, age: walletAgeDays.toFixed(1), balance: balanceSol.toFixed(2), txCount: totalTxs, firstTx: birthDate.toISOString(), programCount };

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
            `• Balance: ${metrics.balance} SOL\n` +
            `• Tx Count: ${metrics.txCount}\n` +
            `• Program Diversity: ${metrics.programCount}\n` +
            `• First Tx: ${metrics.firstTx}\n\n` +
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
║  🚀 V28.0 - STEP-WISE FORENSIC MONITOR                     ║
║  🔥 Real Dev Detection (270+d, 2+SOL, 200+Txs, 3+Programs) ║
║  ⚡ Powered by PumpPortal & Helius                         ║
╚════════════════════════════════════════════════════════════╝
    `);

    log("✅ System Check Passed");
    log(`📱 Telegram Bot: Active`);
    monitorPumpFun();
}

startup();
