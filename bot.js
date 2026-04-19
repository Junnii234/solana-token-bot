require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// ==================== CONFIG ====================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8006731872";
const HELIUS_RPC = process.env.HELIUS_RPC || `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alertedMints = new Set();
const HEADERS = { 'Content-Type': 'application/json' };

// Rate limiting
const DELAY_BETWEEN_CALLS = 2000; // 2 seconds between RPC calls
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds wait before retry

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
const error = (msg) => console.error(`[${new Date().toLocaleTimeString()}] ❌ ${msg}`);
const reject = (reason) => console.log(`[${new Date().toLocaleTimeString()}] ⚠️  REJECT: ${reason}`);

log('🚀 V12.0 - PUMP.FUN API WITH RATE LIMIT SAFETY');
log('🔥 Real Dev Detection (90+d, 2+mo, 2+SOL)');
log('⏱️ Rate limit protected\n');

// ==================== RATE LIMIT HELPER ====================

async function callRPCWithRetry(method, params, retries = 0) {
    try {
        // Add delay to avoid rate limit
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_CALLS));

        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", 
            id: 1, 
            method: method, 
            params: params
        }, { headers: HEADERS, timeout: 10000 });

        // Check for RPC errors
        if (res.data.error) {
            if (res.data.error.code === -32429 && retries < MAX_RETRIES) {
                // Rate limited - retry with delay
                error(`Rate limited (attempt ${retries + 1}/${MAX_RETRIES}), retrying...`);
                await new Promise(r => setTimeout(r, RETRY_DELAY));
                return callRPCWithRetry(method, params, retries + 1);
            }
            error(`RPC error: ${res.data.error.message}`);
            return null;
        }

        return res.data.result;

    } catch (e) {
        if (retries < MAX_RETRIES) {
            error(`${method} failed (attempt ${retries + 1}/${MAX_RETRIES}), retrying...`);
            await new Promise(r => setTimeout(r, RETRY_DELAY));
            return callRPCWithRetry(method, params, retries + 1);
        }
        error(`${method} failed: ${e.message}`);
        return null;
    }
}

// ==================== WARM WALLET DETECTION ====================

async function checkWarmWallet(creator) {
    try {
        log(`   🔍 Warm wallet: ${creator.slice(0, 10)}...`);
        
        // Call 1: Get signatures
        const txs = await callRPCWithRetry(
            "getSignaturesForAddress",
            [creator, { limit: 300 }]
        );

        if (!txs || txs.length === 0) {
            reject(`No transaction history`);
            return { warm: false };
        }

        // Check 1: Age >= 90 days
        const oldestTx = txs[txs.length - 1];
        const newestTx = txs[0];
        const walletAgeMs = (newestTx.blockTime - oldestTx.blockTime) * 1000;
        const walletAgeDays = walletAgeMs / (1000 * 60 * 60 * 24);

        if (walletAgeDays < 90) {
            reject(`Age: ${walletAgeDays.toFixed(1)}d (need 90+)`);
            return { warm: false };
        }

        // Check 2: Activity >= 2 months
        const txsByMonth = {};
        txs.forEach(tx => {
            const month = Math.floor((Date.now() / 1000 - tx.blockTime) / (60 * 60 * 24 * 30));
            txsByMonth[month] = (txsByMonth[month] || 0) + 1;
        });
        const activeMonths = Object.keys(txsByMonth).length;

        if (activeMonths < 2) {
            reject(`Activity: ${activeMonths}m (need 2+)`);
            return { warm: false };
        }

        // Check 3: Balance >= 2 SOL (Call 2)
        const balanceData = await callRPCWithRetry(
            "getBalance",
            [creator]
        );

        if (!balanceData) {
            reject(`Could not get balance`);
            return { warm: false };
        }

        const balanceSol = (balanceData.value || 0) / 1e9;
        if (balanceSol < 2) {
            reject(`Balance: ${balanceSol.toFixed(3)}SOL (need 2+)`);
            return { warm: false };
        }

        // Check 4: Failures < 10%
        const failedTxs = txs.filter(tx => tx.err !== null).length;
        const failureRate = (failedTxs / txs.length) * 100;

        if (failureRate > 10) {
            reject(`Failures: ${failureRate.toFixed(1)}% (need <10%)`);
            return { warm: false };
        }

        // Check 5: Rapid-fire < 25%
        let rapidFireCount = 0;
        for (let i = 0; i < Math.min(100, txs.length - 1); i++) {
            if ((txs[i].blockTime - txs[i + 1].blockTime) < 3) {
                rapidFireCount++;
            }
        }
        const rapidFirePercent = (rapidFireCount / Math.min(100, txs.length)) * 100;

        if (rapidFirePercent > 25) {
            reject(`Rapid-fire: ${rapidFirePercent.toFixed(0)}% (need <25%)`);
            return { warm: false };
        }

        // ✅ ALL CHECKS PASSED
        log(`   ✅ WARM WALLET OK`);
        return { 
            warm: true, 
            age: walletAgeDays.toFixed(1),
            txCount: txs.length,
            balance: balanceSol.toFixed(3)
        };

    } catch (e) {
        error(`Wallet check error: ${e.message}`);
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
            `✅ **VERIFIED:**\n` +
            `• Age: ${metrics.age}d (90+)\n` +
            `• Balance: ${metrics.balance}SOL (2+)\n` +
            `• Txs: ${metrics.txCount}\n` +
            `• Status: REAL DEVELOPER\n\n` +
            `💰 [Pump.Fun](https://pump.fun/${mint})\n` +
            `📊 [DexScreener](https://dexscreener.com/solana/${mint})`;

        await bot.sendMessage(TELEGRAM_CHAT_ID, report, { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });
        
        log(`📤 ALERT SENT!\n`);
        return true;

    } catch (e) {
        error(`Telegram error: ${e.message}`);
        return false;
    }
}

// ==================== PUMP.FUN API MONITORING ====================

async function monitorPumpFun() {
    let tokenCounter = 0;
    let passedCounter = 0;
    let rejectedCounter = 0;

    log('📡 Starting Pump.Fun API Monitor (Rate limit protected)\n');

    while (true) {
        try {
            // Fetch latest tokens
            log(`📊 Fetching latest Pump.Fun tokens...`);
            
            const response = await axios.get(
                'https://api.pump.fun/api/v1/tokens?limit=50&offset=0&sort=newest',
                { timeout: 10000 }
            );

            const tokens = response.data?.tokens || response.data || [];

            if (!Array.isArray(tokens)) {
                log(`⚠️ No tokens array`);
                await new Promise(r => setTimeout(r, 10000));
                continue;
            }

            log(`📊 Got ${tokens.length} tokens\n`);

            for (const token of tokens) {
                const mint = token.mint || token.address || token.id;
                if (!mint || alertedMints.has(mint)) continue;

                tokenCounter++;
                const name = token.name || token.symbol || 'Unknown';
                const creator = token.creator || token.dev || token.deployer;

                log(`\n🎯 NEW TOKEN #${tokenCounter}: ${name}`);
                log(`   Mint: ${mint}`);
                log(`   Dev: ${creator?.slice(0, 10) || 'unknown'}...`);

                alertedMints.add(mint);

                if (!creator) {
                    reject(`No creator address`);
                    rejectedCounter++;
                    continue;
                }

                // Check warm wallet (with rate limit protection)
                const walletCheck = await checkWarmWallet(creator);

                if (walletCheck.warm) {
                    log(`\n🚀 REAL DEV! SENDING ALERT!\n`);
                    passedCounter++;
                    await sendAlert(mint, name, walletCheck);
                } else {
                    rejectedCounter++;
                }

                // Small delay between tokens
                await new Promise(r => setTimeout(r, 500));
            }

            log(`\n📊 CHECK STATS:`);
            log(`   Total scanned: ${tokenCounter}`);
            log(`   Real devs: ${passedCounter} ✅`);
            log(`   Rejected: ${rejectedCounter} ❌`);
            log(`   Waiting 60s before next check...\n`);

            // Wait before next batch
            await new Promise(r => setTimeout(r, 60000));

        } catch (e) {
            error(`API error: ${e.message}`);
            log(`⏳ Retrying in 30 seconds...\n`);
            await new Promise(r => setTimeout(r, 30000));
        }
    }
}

// ==================== STARTUP ====================

async function startup() {
    console.clear();
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  🚀 V12.0 - PUMP.FUN API (RATE LIMIT SAFE)               ║
║  🔥 Real Dev Detection (90+d, 2+mo, 2+SOL)                ║
║  ⏱️ 2s delay between calls                                 ║
║  🔄 3 retries on 429 errors                                ║
╚════════════════════════════════════════════════════════════╝
    `);

    log("✅ Environment verified");
    log(`📱 Telegram: ${TELEGRAM_TOKEN.slice(0, 20)}...`);
    log(`💬 Chat ID: ${TELEGRAM_CHAT_ID}`);
    log(`🔗 RPC: ${HELIUS_RPC.slice(0, 40)}...\n`);

    log("Connecting to Pump.Fun API (Rate limit safe)...\n");
    await monitorPumpFun();
}

// Graceful shutdown
process.on('SIGINT', () => {
    log('\n\n🛑 Shutting down...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('\n\n🛑 Shutting down...');
    process.exit(0);
});

startup();
