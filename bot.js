require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// ==================== CONFIG ====================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8006731872";
const HELIUS_RPC = process.env.HELIUS_RPC || `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alertedMints = new Set();
const HEADERS = { 'Content-Type': 'application/json' };

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
const error = (msg) => console.error(`[${new Date().toLocaleTimeString()}] ❌ ${msg}`);
const reject = (reason) => console.log(`[${new Date().toLocaleTimeString()}] ⚠️  REJECTED: ${reason}`);

log('🚀 V10.0 PUMP.FUN NEW TOKEN DETECTOR');
log('🔥 Warm Wallet Detection Only');
log('💰 Direct Solana Blockchain Monitoring\n');

// ==================== WARM WALLET DETECTION ONLY ====================

async function checkWarmWallet(creator) {
    try {
        log(`   🔍 Checking warm wallet: ${creator.slice(0, 10)}...`);
        
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, 
            method: "getSignaturesForAddress", 
            params: [creator, { limit: 200 }]
        }, { headers: HEADERS, timeout: 5000 });

        const txs = res.data.result || [];

        // Check 1: Has transaction history
        if (txs.length === 0) {
            reject(`No transaction history`);
            return { warm: false, reason: "No tx history" };
        }

        // Check 2: Wallet age
        const oldestTx = txs[txs.length - 1];
        const newestTx = txs[0];
        const walletAgeMs = (newestTx.blockTime - oldestTx.blockTime) * 1000;
        const walletAgeDays = walletAgeMs / (1000 * 60 * 60 * 24);

        if (walletAgeDays < 5) {
            reject(`Wallet too young: ${walletAgeDays.toFixed(1)} days`);
            return { warm: false, reason: "Too young" };
        }

        // Check 3: Dormant then active (recycled scammer wallet)
        const txsLast7Days = txs.filter(tx => {
            const daysSinceTx = (Date.now() / 1000 - tx.blockTime) / (60 * 60 * 24);
            return daysSinceTx < 7;
        });

        const dormancyGap = txs.length - txsLast7Days.length;
        const recentActivityBurst = txsLast7Days.length > 5;

        if (dormancyGap > 30 && recentActivityBurst) {
            reject(`Dormant wallet suddenly active (recycled scammer)`);
            return { warm: false, reason: "Recycled wallet" };
        }

        // Check 4: Activity distribution
        const txsByDay = {};
        txs.forEach(tx => {
            const day = Math.floor((Date.now() / 1000 - tx.blockTime) / (60 * 60 * 24));
            txsByDay[day] = (txsByDay[day] || 0) + 1;
        });

        const activeDays = Object.keys(txsByDay).length;
        if (activeDays < 2 && txs.length > 20) {
            reject(`Clustered activity: ${txs.length} txs in ${activeDays} days only`);
            return { warm: false, reason: "Clustered activity" };
        }

        // Check 5: Rapid-fire txs (bot behavior)
        let rapidFireCount = 0;
        for (let i = 0; i < Math.min(100, txs.length - 1); i++) {
            if ((txs[i].blockTime - txs[i + 1].blockTime) < 3) {
                rapidFireCount++;
            }
        }

        const rapidFirePercent = (rapidFireCount / Math.min(100, txs.length)) * 100;
        if (rapidFirePercent > 50) {
            reject(`Bot-like behavior: ${rapidFirePercent.toFixed(0)}% rapid-fire txs`);
            return { warm: false, reason: "Bot behavior" };
        }

        // ✅ PASSED!
        log(`   ✅ WARM WALLET VERIFIED`);
        log(`   📅 Age: ${walletAgeDays.toFixed(1)} days`);
        log(`   💼 Txs: ${txs.length}`);
        log(`   📊 Active days: ${activeDays}`);
        log(`   ⚡ Bot risk: ${rapidFirePercent.toFixed(0)}%\n`);

        return { 
            warm: true, 
            age: walletAgeDays.toFixed(1),
            txCount: txs.length
        };

    } catch (e) {
        error(`Warm wallet check failed: ${e.message}`);
        return { warm: false, reason: "API error" };
    }
}

// ==================== SEND ALERT ====================

async function sendAlert(mint, name, walletAge, txCount) {
    try {
        const report = 
            `🌟 **PUMP.FUN NEW TOKEN - REAL DEV** 🌟\n\n` +
            `🏷️ **Name:** ${name}\n` +
            `📋 **Mint:** \`${mint}\`\n\n` +
            `✅ **WARM WALLET VERIFIED:**\n` +
            `• Dev Age: ${walletAge} days\n` +
            `• Transactions: ${txCount}\n` +
            `• Status: Real developer (not fresh wallet)\n\n` +
            `💰 [Pump.Fun](https://pump.fun/${mint})\n` +
            `📊 [DexScreener](https://dexscreener.com/solana/${mint})\n` +
            `🔗 [Solscan](https://solscan.io/token/${mint})`;

        await bot.sendMessage(TELEGRAM_CHAT_ID, report, { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });
        
        log(`📤 ALERT SENT TO TELEGRAM!\n`);
        return true;

    } catch (e) {
        error(`Telegram error: ${e.message}`);
        return false;
    }
}

// ==================== WEBSOCKET MONITORING ====================

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    let reconnectAttempts = 0;
    let tokenCounter = 0;
    let passedCounter = 0;
    let rejectedCounter = 0;

    ws.on('open', () => {
        log('📡 WebSocket Connected - Monitoring Pump.Fun New Tokens\n');
        reconnectAttempts = 0;
        
        // Subscribe to token trades
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" }));
        
        // Statistics every 5 minutes
        setInterval(() => {
            log(`\n📊 STATISTICS (Last 5 min):`);
            log(`   Tokens processed: ${tokenCounter}`);
            log(`   Warm wallet found: ${passedCounter}`);
            log(`   Rejected: ${rejectedCounter}\n`);
            tokenCounter = 0;
            passedCounter = 0;
            rejectedCounter = 0;
        }, 300000);
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            
            if (!event.mint || alertedMints.has(event.mint)) return;

            tokenCounter++;

            // Target: NEW tokens on Pump.Fun
            // These are FRESH tokens, just launched
            // Market cap doesn't matter (they're all low on Pump.Fun initially)
            const marketCap = event.marketCapSol || 0;

            // Log every 50 tokens to show activity
            if (tokenCounter % 50 === 0) {
                log(`📊 Processing tokens... (Latest: ${event.name}, Cap: ${marketCap.toFixed(2)} SOL)`);
            }

            // KEY: Check ALL tokens on Pump.Fun (no market cap filter)
            // Just verify if developer is real (warm wallet)
            alertedMints.add(event.mint);

            log(`\n🎯 NEW TOKEN DETECTED: ${event.name}`);
            log(`   Mint: ${event.mint}`);
            log(`   Cap: ${marketCap.toFixed(2)} SOL`);
            log(`   Dev: ${event.traderPublicKey?.slice(0, 10) || "unknown"}...`);
            log(`   Checking warm wallet...`);

            const walletCheck = await checkWarmWallet(
                event.traderPublicKey || event.user || "unknown"
            );

            if (walletCheck.warm) {
                log(`\n🚀 TOKEN PASSED - SENDING ALERT!\n`);
                passedCounter++;
                await sendAlert(
                    event.mint, 
                    event.name,
                    walletCheck.age,
                    walletCheck.txCount
                );
            } else {
                rejectedCounter++;
            }

        } catch (e) {
            // Silently ignore parse errors
        }
    });

    ws.on('error', (err) => {
        error(`WebSocket error: ${err.message}`);
    });

    ws.on('close', () => {
        log('⚠️ WebSocket disconnected');
        
        if (reconnectAttempts < 10) {
            reconnectAttempts++;
            const delay = Math.min(5000 * reconnectAttempts, 30000);
            log(`🔄 Reconnecting in ${delay / 1000}s (Attempt ${reconnectAttempts}/10)...`);
            setTimeout(startRadar, delay);
        } else {
            error('Max reconnection attempts reached. Exiting.');
            process.exit(1);
        }
    });
}

// ==================== STARTUP ====================

async function startup() {
    console.clear();
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  🚀 V10.0 PUMP.FUN NEW TOKEN DETECTOR                     ║
║  🔥 Warm Wallet Detection Only                            ║
║  💰 Direct Solana Blockchain Monitoring                   ║
║  ✅ No Authority/Distribution Checks (Bonding Curve)      ║
║  📊 Detailed Logging on All Rejections                    ║
╚════════════════════════════════════════════════════════════╝
    `);

    log("✅ Environment verified");
    log(`📱 Telegram: ${TELEGRAM_TOKEN.slice(0, 20)}...`);
    log(`💬 Chat ID: ${TELEGRAM_CHAT_ID}`);
    log(`🔗 RPC: ${HELIUS_RPC.slice(0, 40)}...\n`);

    log("Starting Pump.Fun Monitor...\n");
    startRadar();
}

// Graceful shutdown
process.on('SIGINT', () => {
    log('\n\n🛑 Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('\n\n🛑 Shutting down gracefully...');
    process.exit(0);
});

startup();
