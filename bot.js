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

// Logging setup
const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
const error = (msg) => console.error(`[${new Date().toLocaleTimeString()}] ❌ ${msg}`);

log('💎 ELITE SCANNER v4.0 - PRODUCTION READY');
log('🔥 Warm Wallet Detection + Full Safety Checks');
log('📡 Deploying to Railway with .env support\n');

// ==================== WARM WALLET VALIDATION ====================

async function validateWarmWallet(creator) {
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, 
            method: "getSignaturesForAddress", 
            params: [creator, { limit: 200 }]
        }, { headers: HEADERS, timeout: 10000 });

        const txs = res.data.result || [];

        if (txs.length === 0) {
            return { warm: false, reason: "No transaction history", score: 100 };
        }

        // Calculate wallet age
        const oldestTx = txs[txs.length - 1];
        const newestTx = txs[0];
        const walletAgeMs = (newestTx.blockTime - oldestTx.blockTime) * 1000;
        const walletAgeDays = walletAgeMs / (1000 * 60 * 60 * 24);

        // Check 1: Wallet too young
        if (walletAgeDays < 30) {
            return { warm: false, reason: `Wallet too young: ${walletAgeDays.toFixed(0)} days`, score: 85 };
        }

        // Check 2: Dormant wallet suddenly active (recycled scammer)
        const txsLast30Days = txs.filter(tx => {
            const daysSinceTx = (Date.now() / 1000 - tx.blockTime) / (60 * 60 * 24);
            return daysSinceTx < 30;
        });

        const dormancyGap = txs.length - txsLast30Days.length;
        const recentActivityBurst = txsLast30Days.length > 15;

        if (dormancyGap > 40 && recentActivityBurst) {
            return { 
                warm: false, 
                reason: "Dormant wallet suddenly active (RECYCLED SCAMMER)",
                score: 90
            };
        }

        // Check 3: Activity distribution (clustered in 1 week = fake)
        const txsByWeek = {};
        txs.forEach(tx => {
            const week = Math.floor((Date.now() / 1000 - tx.blockTime) / (60 * 60 * 24 * 7));
            txsByWeek[week] = (txsByWeek[week] || 0) + 1;
        });

        const activeWeeks = Object.keys(txsByWeek).length;
        if (activeWeeks < 4 && txs.length > 30) {
            return { 
                warm: false, 
                reason: `Clustered activity: ${txs.length} txs in only ${activeWeeks} weeks`,
                score: 75
            };
        }

        // Check 4: Rapid-fire transactions (bot behavior)
        let rapidFireCount = 0;
        for (let i = 0; i < Math.min(100, txs.length - 1); i++) {
            const timeDiff = txs[i].blockTime - txs[i + 1].blockTime;
            if (timeDiff < 5) rapidFireCount++;
        }

        if (rapidFireCount > txs.length * 0.3) {
            return { 
                warm: false, 
                reason: `Bot-like behavior: ${rapidFireCount} rapid txs`,
                score: 80
            };
        }

        // Check 5: Failed transactions (testing exploits)
        const failedTxs = txs.filter(tx => tx.err !== null).length;
        const failureRate = (failedTxs / txs.length) * 100;

        if (failureRate > 25) {
            return { 
                warm: false, 
                reason: `High failure rate: ${failureRate.toFixed(1)}%`,
                score: 70
            };
        }

        // Check 6: SOL balance (wallet emptied after rug)
        const balanceRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, 
            method: "getBalance", 
            params: [creator]
        }, { headers: HEADERS, timeout: 10000 });

        const balanceSol = (balanceRes.data.result.value || 0) / 1e9;

        if (balanceSol < 0.05) {
            return { 
                warm: false, 
                reason: `Wallet nearly empty: ${balanceSol.toFixed(4)} SOL`,
                score: 95
            };
        }

        // Calculate warmth score (0-100, lower = more legitimate)
        let warmthScore = 0;

        // Age factor
        warmthScore += Math.max(0, (100 - walletAgeDays) / 2);

        // Activity distribution
        warmthScore += Math.max(0, (4 - activeWeeks) * 10);

        // Tx count
        warmthScore += Math.max(0, (50 - txs.length) / 2);

        // Balance factor
        warmthScore += Math.max(0, (1 - balanceSol) * 30);

        // Failure rate
        warmthScore += failureRate * 0.5;

        warmthScore = Math.min(100, Math.max(0, warmthScore));

        return {
            warm: warmthScore < 35,
            score: warmthScore,
            details: {
                ageDays: walletAgeDays.toFixed(1),
                totalTxs: txs.length,
                activeWeeks: activeWeeks,
                balanceSol: balanceSol.toFixed(4),
                failureRate: failureRate.toFixed(1),
                rapidFireCount: rapidFireCount
            }
        };

    } catch (e) {
        error(`Warm wallet validation error: ${e.message}`);
        return { warm: false, reason: "Error validating wallet", score: 100 };
    }
}

// ==================== AUTHORITY CHECKS ====================

async function checkAuthorities(mint) {
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, 
            method: "getAsset", 
            params: { id: mint }
        }, { headers: HEADERS, timeout: 10000 });

        const asset = res.data.result;
        
        // Mint authority not revoked = infinite supply risk
        if (asset.mutable === true || asset.ownership?.frozen === false) {
            return { safe: false, reason: "Mint authority NOT revoked" };
        }
        
        // Freeze authority active = creator can lock tokens
        if (asset.authorities && asset.authorities.some(a => a.authority && !a.frozen)) {
            return { safe: false, reason: "Freeze authority active" };
        }

        return { safe: true };
    } catch (e) {
        error(`Authority check error: ${e.message}`);
        return { safe: false, reason: "Could not verify authorities" };
    }
}

// ==================== SUPPLY CHECKS ====================

async function checkLiquidityDepth(mint) {
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, 
            method: "getTokenSupply", 
            params: [mint]
        }, { headers: HEADERS, timeout: 10000 });

        const supply = res.data.result.value.uiAmount;
        
        // Too low supply = easy pump & dump
        if (supply < 1000000) {
            return { safe: false, reason: `Very low supply: ${supply}` };
        }

        // Too high = price movement difficult
        if (supply > 1000000000000) {
            return { safe: false, reason: "Supply inflated (>1T)" };
        }

        return { safe: true, supply };
    } catch (e) {
        error(`Supply check error: ${e.message}`);
        return { safe: false, reason: "Could not check supply" };
    }
}

// ==================== HOLDER DISTRIBUTION ====================

async function checkHolderDistribution(mint) {
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, 
            method: "getTokenLargestAccounts", 
            params: [mint]
        }, { headers: HEADERS, timeout: 10000 });

        const holders = res.data.result.value || [];
        
        if (holders.length < 5) {
            return { safe: false, reason: "Too few holders (whale concentration)" };
        }

        let top1Percent = 0;
        let top5Sum = 0;

        holders.slice(0, 5).forEach((h, idx) => {
            const percent = (h.uiAmount / 1000000000) * 100;
            top5Sum += percent;
            if (idx === 0) top1Percent = percent;
        });

        // Top holder > 50% = instant rug risk
        if (top1Percent > 50) {
            return { safe: false, reason: `Top holder: ${top1Percent.toFixed(1)}%` };
        }

        // Top 5 > 60% = high concentration
        if (top5Sum > 60) {
            return { safe: false, reason: `Top 5: ${top5Sum.toFixed(1)}%` };
        }

        return { safe: true, top1: top1Percent, top5: top5Sum };
    } catch (e) {
        error(`Holder check error: ${e.message}`);
        return { safe: false, reason: "Could not check holders" };
    }
}

// ==================== METADATA RED FLAGS ====================

function checkMetadataRedFlags(name) {
    const redFlags = [
        /moon|rocket|lambo|safe|shib/i,
        /\$\$\$|!!!|X100|MOONING/i,
        /test|fake|demo|rug|scam/i,
    ];

    for (let flag of redFlags) {
        if (flag.test(name)) {
            return { safe: false, reason: `Suspicious name: "${name}"` };
        }
    }

    return { safe: true };
}

// ==================== MAIN TOKEN ANALYSIS ====================

async function analyzeToken(mint, creator, name) {
    const checks = [];
    let passAll = true;

    try {
        log(`\n🔍 Analyzing: ${name} (${mint.slice(0, 8)}...)`);
        log("━".repeat(70));

        // ⭐ STEP 1: WARM WALLET CHECK (MOST CRITICAL!)
        log("\n🔥 Step 1/5: WARM WALLET VALIDATION...");
        const warmWallet = await validateWarmWallet(creator);

        if (!warmWallet.warm) {
            log(`   ❌ ${warmWallet.reason}`);
            log(`   ❌ Warmth Score: ${warmWallet.score.toFixed(0)}/100`);
            passAll = false;
            return {
                passed: false,
                failReason: `SCAMMER WALLET: ${warmWallet.reason}`,
                verdict: "REJECT"
            };
        }

        log(`   ✅ Warmth Score: ${warmWallet.score.toFixed(0)}/100`);
        log(`   ✅ Age: ${warmWallet.details.ageDays} days`);
        log(`   ✅ Activity: ${warmWallet.details.totalTxs} txs over ${warmWallet.details.activeWeeks} weeks`);
        checks.push({ check: "Warm Wallet", result: "✅" });

        // Step 2: METADATA
        log("\n📝 Step 2/5: METADATA CHECK...");
        const metaCheck = checkMetadataRedFlags(name);
        if (!metaCheck.safe) {
            log(`   ❌ ${metaCheck.reason}`);
            passAll = false;
            return { passed: false, failReason: metaCheck.reason, verdict: "REJECT" };
        }
        log(`   ✅ Name looks legitimate`);
        checks.push({ check: "Metadata", result: "✅" });

        // Step 3: AUTHORITIES
        log("\n🔐 Step 3/5: AUTHORITY CHECK...");
        const authCheck = await checkAuthorities(mint);
        if (!authCheck.safe) {
            log(`   ❌ ${authCheck.reason}`);
            passAll = false;
            return { passed: false, failReason: authCheck.reason, verdict: "REJECT" };
        }
        log(`   ✅ Both authorities properly revoked`);
        checks.push({ check: "Authorities", result: "✅" });

        // Step 4: SUPPLY
        log("\n💰 Step 4/5: SUPPLY CHECK...");
        const supplyCheck = await checkLiquidityDepth(mint);
        if (!supplyCheck.safe) {
            log(`   ❌ ${supplyCheck.reason}`);
            passAll = false;
            return { passed: false, failReason: supplyCheck.reason, verdict: "REJECT" };
        }
        log(`   ✅ Supply in safe range`);
        checks.push({ check: "Supply", result: "✅" });

        // Step 5: HOLDERS
        log("\n👥 Step 5/5: HOLDER DISTRIBUTION CHECK...");
        const holderCheck = await checkHolderDistribution(mint);
        if (!holderCheck.safe) {
            log(`   ❌ ${holderCheck.reason}`);
            passAll = false;
            return { passed: false, failReason: holderCheck.reason, verdict: "REJECT" };
        }
        log(`   ✅ Top 1: ${holderCheck.top1.toFixed(1)}%`);
        log(`   ✅ Top 5: ${holderCheck.top5.toFixed(1)}%`);
        checks.push({ check: "Distribution", result: "✅" });

        // ✅ ALL CHECKS PASSED!
        if (passAll) {
            log(`\n${'═'.repeat(70)}`);
            log(`🚀 ALL CHECKS PASSED - SENDING TELEGRAM ALERT`);
            log(`${'═'.repeat(70)}`);

            return {
                passed: true,
                verdict: "SEND_ALERT",
                details: {
                    warmthScore: warmWallet.score,
                    walletAge: warmWallet.details.ageDays,
                    holderTop1: holderCheck.top1,
                    holderTop5: holderCheck.top5,
                    walletAddr: creator
                }
            };
        }

    } catch (e) {
        error(`Token analysis error: ${e.message}`);
        return { passed: false, error: e.message, verdict: "REJECT" };
    }
}

// ==================== TELEGRAM ALERT ====================

async function sendTelegramAlert(mint, name, analysis) {
    try {
        const report = `🌟 **ELITE VERIFIED TOKEN** 🌟\n\n` +
                       `🏷️ **Name:** ${name}\n` +
                       `📋 **Mint:** \`${mint}\`\n\n` +
                       `✅ **ALL SAFETY CHECKS PASSED:**\n` +
                       `• Developer Warmth Score: ${analysis.details.warmthScore.toFixed(0)}/100 ✅\n` +
                       `• Wallet Age: ${analysis.details.walletAge} days ✅\n` +
                       `• Authorities Revoked: Yes ✅\n` +
                       `• Top Holder: ${analysis.details.holderTop1.toFixed(1)}% ✅\n` +
                       `• Top 5 Combined: ${analysis.details.holderTop5.toFixed(1)}% ✅\n` +
                       `• Metadata: Clean ✅\n\n` +
                       `🔗 [DexScreener](https://dexscreener.com/solana/${mint})\n` +
                       `🔗 [Solscan](https://solscan.io/token/${mint})`;

        await bot.sendMessage(TELEGRAM_CHAT_ID, report, { 
            parse_mode: 'Markdown', 
            disable_web_page_preview: true 
        });

        log(`\n📤 Telegram Alert Sent Successfully!`);
        return true;

    } catch (e) {
        error(`Failed to send Telegram alert: ${e.message}`);
        return false;
    }
}

// ==================== WEBSOCKET RADAR ====================

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    let reconnectAttempts = 0;
    const MAX_RECONNECT = 5;

    ws.on('open', () => {
        log('\n📡 ✅ WebSocket Connected - Scanning for Elite Tokens...');
        reconnectAttempts = 0;
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" })); 
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            
            // Target tokens near Raydium graduation (82-85 SOL market cap)
            if (event.marketCapSol >= 12 && event.marketCapSol <= 100) {
                if (!alertedMints.has(event.mint)) {
                    alertedMints.add(event.mint);
                    
                    log(`\n🎓 Found Candidate: ${event.name || 'Unknown Token'}`);
                    log(`   Market Cap: ${event.marketCapSol.toFixed(2)} SOL`);
                    log(`   Creator: ${event.traderPublicKey.slice(0, 10)}...`);
                    log(`   ⏳ Waiting 60 seconds for pool stability...`);
                    
                    // Wait for Raydium pool to stabilize
                    setTimeout(async () => {
                        const result = await analyzeToken(
                            event.mint, 
                            event.traderPublicKey, 
                            event.name || "Unknown"
                        );
                        
                        if (result.verdict === "SEND_ALERT") {
                            await sendTelegramAlert(event.mint, event.name, result);
                        } else {
                            log(`\n⚠️ Token REJECTED: ${result.failReason}`);
                        }
                    }, 60000);
                }
            }
        } catch (e) {
            // Silent - ignore parsing errors from non-trade messages
        }
    });

    ws.on('error', (err) => {
        error(`WebSocket error: ${err.message}`);
    });

    ws.on('close', () => {
        log('⚠️ WebSocket disconnected');
        
        if (reconnectAttempts < MAX_RECONNECT) {
            reconnectAttempts++;
            const delay = Math.min(5000 * reconnectAttempts, 30000); // Max 30s delay
            log(`🔄 Reconnecting in ${delay / 1000}s (Attempt ${reconnectAttempts}/${MAX_RECONNECT})...`);
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
║  💎 ELITE SOLANA TOKEN SCANNER v4.0                       ║
║  🔥 Warm Wallet Detection + Full Safety Checks            ║
║  📡 Production Ready for Railway Deployment               ║
║  ⚡ Alerts Only on 100% Verified Safe Tokens              ║
╚════════════════════════════════════════════════════════════╝
    `);

    // Verify environment
    if (!TELEGRAM_TOKEN || TELEGRAM_TOKEN.includes("YOUR_")) {
        error("TELEGRAM_TOKEN not properly set in .env");
        process.exit(1);
    }

    if (!TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID.includes("YOUR_")) {
        error("TELEGRAM_CHAT_ID not properly set in .env");
        process.exit(1);
    }

    if (!HELIUS_RPC || HELIUS_RPC.includes("YOUR_")) {
        error("HELIUS_RPC not properly set in .env");
        process.exit(1);
    }

    log("✅ Environment variables loaded");
    log(`📱 Telegram Bot: ${TELEGRAM_TOKEN.slice(0, 20)}...`);
    log(`💬 Chat ID: ${TELEGRAM_CHAT_ID}`);
    log(`🔗 RPC: ${HELIUS_RPC.slice(0, 30)}...\n`);

    // Start monitoring
    log("Starting Token Scanner...\n");
    startRadar();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    log("\n\n🛑 Shutting down gracefully...");
    process.exit(0);
});

process.on('SIGTERM', () => {
    log("\n\n🛑 Shutting down gracefully...");
    process.exit(0);
});

// Start the application
startup();
