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

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
const error = (msg) => console.error(`[${new Date().toLocaleTimeString()}] ❌ ${msg}`);
const reject = (reason) => console.log(`[${new Date().toLocaleTimeString()}] ⚠️  REJECT: ${reason}`);

log('🚀 V11.0 - PUMP.FUN API DIRECT');
log('🔥 Real Dev Detection (90+d, 2+mo, 2+SOL)');
log('💰 Direct API Monitoring\n');

// ==================== WARM WALLET DETECTION ====================

async function checkWarmWallet(creator) {
    try {
        log(`   🔍 Warm wallet: ${creator.slice(0, 10)}...`);
        
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, 
            method: "getSignaturesForAddress", 
            params: [creator, { limit: 300 }]
        }, { headers: HEADERS, timeout: 5000 });

        const txs = res.data.result || [];

        // Check 1: Has transaction history
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

        // Check 3: Activity >= 2 months
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

        // Check 4: Balance >= 2 SOL
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

        // Check 5: Failures < 10%
        const failedTxs = txs.filter(tx => tx.err !== null).length;
        const failureRate = (failedTxs / txs.length) * 100;

        if (failureRate > 10) {
            reject(`Failures: ${failureRate.toFixed(1)}% (need <10%)`);
            return { warm: false };
        }

        // Check 6: Rapid-fire < 25%
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

// ==================== PUMP.FUN WEBSOCKET MONITORING ====================
const WebSocket = require('ws');

function monitorPumpFun() {
    log('🛡️ Connecting to PumpPortal WebSocket...');
    
    // bot (7).js se liya gaya method
    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    ws.on('open', () => {
        log('✅ Connected! Monitoring new tokens...');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            const mint = event.mint;
            const creator = event.traderPublicKey; // Dev wallet address
            const name = event.symbol || 'New Token';

            if (!mint || alertedMints.has(mint)) return;
            alertedMints.add(mint);

            log(`\n🎯 NEW TOKEN DETECTED: ${name}`);
            log(`   Mint: ${mint}`);
            log(`   Dev: ${creator?.slice(0, 10)}...`);

            // Aapka purana detection logic (Age, Balance, etc.)
            const walletCheck = await checkWarmWallet(creator);

            if (walletCheck.warm) {
                log(`🚀 REAL DEV FOUND! SENDING ALERT!`);
                await sendAlert(mint, name, walletCheck);
            }

        } catch (e) {
            error(`Processing error: ${e.message}`);
        }
    });

    ws.on('error', (err) => {
        error(`WebSocket Error: ${err.message}`);
    });

    ws.on('close', () => {
        log('⏳ Connection lost. Reconnecting in 5 seconds...');
        setTimeout(monitorPumpFun, 5000);
    });
}

                alertedMints.add(mint);

                log(`\n🎯 NEW TOKEN: ${name}`);
                log(`   Mint: ${mint}`);
                log(`   Dev: ${creator?.slice(0, 10) || 'unknown'}...`);

                if (!creator) {
                    reject(`No creator address`);
                    rejectedCounter++;
                    continue;
                }

                const walletCheck = await checkWarmWallet(creator);

                if (walletCheck.warm) {
                    log(`\n🚀 REAL DEV! SENDING ALERT!\n`);
                    passedCounter++;
                    await sendAlert(mint, name, walletCheck);
                } else {
                    rejectedCounter++;
                }

                await new Promise(r => setTimeout(r, 500));
            }

            // Statistics every check
            log(`\n📊 CHECK STATS:`);
            log(`   Scanned: ${tokenCounter}`);
            log(`   Real devs: ${passedCounter} ✅`);
            log(`   Rejected: ${rejectedCounter} ❌\n`);

            // Wait 30 seconds before next check
            await new Promise(r => setTimeout(r, 30000));

        } catch (e) {
            error(`Pump.Fun API error: ${e.message}`);
            log(`⏳ Retrying in 10 seconds...\n`);
            await new Promise(r => setTimeout(r, 10000));
        }
    }
}

// ==================== STARTUP ====================

async function startup() {
    console.clear();
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  🚀 V11.0 - PUMP.FUN API DIRECT                           ║
║  🔥 Real Dev Detection (90+d, 2+mo, 2+SOL)                ║
║  💰 Direct API Monitoring                                 ║
║  ✅ No PumpPortal WebSocket                                ║
╚════════════════════════════════════════════════════════════╝
    `);

    log("✅ Environment verified");
    log(`📱 Telegram: ${TELEGRAM_TOKEN.slice(0, 20)}...`);
    log(`💬 Chat ID: ${TELEGRAM_CHAT_ID}`);
    log(`🔗 RPC: ${HELIUS_RPC.slice(0, 40)}...\n`);

    log("Connecting to Pump.Fun API...\n");
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
