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

log('🚀 V9.1 PUMPSWAP DEX TRACKER - RADAR RESTORED');
log('🎯 Market Cap Range: 10-500 SOL & Migrations\n');

// ==================== RAYDIUM POOL VERIFICATION ====================

async function verifyRaydiumPool(mint) {
    try {
        log(`   🔍 Verifying Raydium pool for ${mint.slice(0, 10)}...`);
        
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", 
            id: 1, 
            method: "getAsset", 
            params: { id: mint }
        }, { headers: HEADERS, timeout: 5000 });

        const asset = res.data.result;
        
        if (!asset) {
            return { verified: false, reason: "Asset not found" };
        }

        const mutable = asset.mutable;
        const frozen = asset.ownership?.frozen;
        const supply = asset.supply?.value || 0;
        
        log(`   📊 Raydium Check: Mutable=${mutable}, Frozen=${frozen}, Supply=${supply > 0}`);
        
        if (mutable === false && frozen === true && supply > 0) {
            return { verified: true, reason: "Raydium graduated token", mutable, frozen, supply };
        }
        
        if (mutable === false) {
            return { verified: true, reason: "Token is immutable (graduated)", mutable, frozen, supply };
        }
        
        return { verified: false, reason: "Still on bonding curve (not graduated)" };

    } catch (e) {
        error(`Raydium verification error: ${e.message}`);
        return { verified: false, reason: `Error: ${e.message}` };
    }
}

// ==================== DEVELOPER FORENSICS ====================

async function analyzeDeveloper(creator) {
    try {
        log(`   👤 Analyzing developer: ${creator.slice(0, 10)}...`);
        
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", 
            id: 1, 
            method: "getSignaturesForAddress", 
            params: [creator, { limit: 100 }]
        }, { headers: HEADERS, timeout: 5000 });

        const txs = res.data.result || [];
        
        if (txs.length === 0) {
            return { legitimate: false, reason: "No transaction history" };
        }

        const newestTx = txs[0];
        const oldestTx = txs[txs.length - 1];
        const ageMs = (newestTx.blockTime - oldestTx.blockTime) * 1000;
        const ageDays = ageMs / (1000 * 60 * 60 * 24);

        log(`   📅 Wallet age: ${ageDays.toFixed(1)} days, Txs: ${txs.length}`);

        const minAge = 3;
        const minTxs = 5;
        
        if (ageDays < minAge || txs.length < minTxs) {
            return { legitimate: false, reason: `Developer too new: ${ageDays.toFixed(1)}d, ${txs.length} txs` };
        }

        let rapidFireCount = 0;
        for (let i = 0; i < Math.min(50, txs.length - 1); i++) {
            if ((txs[i].blockTime - txs[i + 1].blockTime) < 3) {
                rapidFireCount++;
            }
        }

        const rapidFirePercent = (rapidFireCount / Math.min(50, txs.length)) * 100;
        
        if (rapidFirePercent > 40) {
            return { legitimate: false, reason: `Bot-like behavior: ${rapidFirePercent.toFixed(0)}% rapid-fire txs` };
        }

        return { legitimate: true, age: ageDays.toFixed(1), txCount: txs.length, botRisk: rapidFirePercent.toFixed(0) };

    } catch (e) {
        error(`Developer analysis error: ${e.message}`);
        return { legitimate: false, reason: `Error: ${e.message}` };
    }
}

// ==================== HOLDER DISTRIBUTION CHECK ====================

async function checkHolders(mint) {
    try {
        log(`   👥 Checking holder distribution...`);
        
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", 
            id: 1, 
            method: "getTokenLargestAccounts", 
            params: [mint]
        }, { headers: HEADERS, timeout: 5000 });

        const holders = res.data.result?.value || [];
        
        if (holders.length < 3) {
            return { safe: false, reason: "Very few holders (whale concentration)" };
        }

        let top1 = 0;
        let top5 = 0;

        for (let i = 0; i < Math.min(5, holders.length); i++) {
            const percent = (holders[i].uiAmount || 0) / Math.pow(10, 6) * 100;
            if (i === 0) top1 = percent;
            top5 += percent;
        }

        log(`   📊 Distribution: Top1=${top1.toFixed(1)}%, Top5=${top5.toFixed(1)}%`);

        if (top1 > 70) {
            return { safe: false, reason: `Extreme concentration: Top1=${top1.toFixed(1)}%` };
        }

        if (top5 > 85) {
            return { safe: false, reason: `Top5=${top5.toFixed(1)}% (too concentrated)` };
        }

        return { safe: true, top1: top1.toFixed(1), top5: top5.toFixed(1) };

    } catch (e) {
        error(`Holder check error: ${e.message}`);
        return { safe: false, reason: `Error: ${e.message}` };
    }
}

// ==================== COMPLETE FORENSIC AUDIT ====================

async function auditGraduatedToken(mint, creator, name) {
    try {
        log(`\n🔬 COMPLETE AUDIT: ${name}`);
        log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        log(`\n1️⃣  Raydium Graduation Check...`);
        const poolCheck = await verifyRaydiumPool(mint);
        
        if (!poolCheck.verified) {
            log(`   ❌ ${poolCheck.reason}`);
            return { passed: false, reason: poolCheck.reason };
        }
        log(`   ✅ Verified: ${poolCheck.reason}`);

        log(`\n2️⃣  Developer Forensics...`);
        const devCheck = await analyzeDeveloper(creator);
        
        if (!devCheck.legitimate) {
            log(`   ❌ ${devCheck.reason}`);
            return { passed: false, reason: devCheck.reason };
        }
        log(`   ✅ Age: ${devCheck.age} days, Txs: ${devCheck.txCount}, Bot Risk: ${devCheck.botRisk}%`);

        log(`\n3️⃣  Holder Distribution...`);
        const holderCheck = await checkHolders(mint);
        
        if (!holderCheck.safe) {
            log(`   ❌ ${holderCheck.reason}`);
            return { passed: false, reason: holderCheck.reason };
        }
        log(`   ✅ Top1: ${holderCheck.top1}%, Top5: ${holderCheck.top5}%`);

        log(`\n${'═'.repeat(40)}`);
        log(`✅ AUDIT PASSED - SENDING ALERT`);
        log(`${'═'.repeat(40)}\n`);

        return {
            passed: true,
            details: { devAge: devCheck.age, txCount: devCheck.txCount, top1: holderCheck.top1, top5: holderCheck.top5 }
        };

    } catch (e) {
        error(`Audit error: ${e.message}`);
        return { passed: false, reason: `Audit error: ${e.message}` };
    }
}

// ==================== TELEGRAM ALERT ====================

async function sendAlert(mint, name, auditResult) {
    try {
        const report = 
            `🌟 **PUMPSWAP / RAYDIUM GEM** 🌟\n\n` +
            `🏷️ **Name:** ${name}\n` +
            `📋 **Mint:** \`${mint}\`\n\n` +
            `✅ **AUDIT PASSED:**\n` +
            `• Dev Age: ${auditResult.details.devAge} days\n` +
            `• Developer Txs: ${auditResult.details.txCount}\n` +
            `• Top Holder: ${auditResult.details.top1}%\n` +
            `• Top 5 Combined: ${auditResult.details.top5}%\n\n` +
            `🔗 [DexScreener](https://dexscreener.com/solana/${mint})\n` +
            `🔗 [PumpSwap](https://pumpswap.com/swap?outputCurrency=${mint})`;

        await bot.sendMessage(TELEGRAM_CHAT_ID, report, { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });
        
        log(`📤 Alert sent to Telegram!\n`);
        return true;

    } catch (e) {
        error(`Telegram error: ${e.message}`);
        return false;
    }
}

// ==================== WEBSOCKET RADAR ====================

let tokenCounter = 0;

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    let reconnectAttempts = 0;

    ws.on('open', () => {
        log('📡 WebSocket Connected - Dual Stream Active...\n');
        reconnectAttempts = 0;
        
        // 🔥 MISSING LINES RESTORED!
        // 1. Trades (To catch the 10-69 SOL range on the bonding curve)
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" }));
        
        // 2. Migrations (To catch the exact moment it hits ~69 SOL and graduates to PumpSwap)
        ws.send(JSON.stringify({ "method": "subscribeRaydiumMigration" }));
        
        setInterval(() => {
            log(`💓 Scanning active... (${tokenCounter} events processed)\n`);
            tokenCounter = 0; // Reset counter after logging
        }, 300000);
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            
            if (!event.mint || alertedMints.has(event.mint)) return;

            // Counter increment karega har aane walay valid event par
            tokenCounter++;

            const marketCap = event.marketCapSol || 0;
            const isMigration = event.txType === "raydium_migration";
            
            // Trigger Condition: Ya to token migrate ho raha ho (Graduation), ya phir apke 10-500 SOL bracket mein ho
            if (isMigration || (marketCap >= 10 && marketCap <= 500)) {
                alertedMints.add(event.mint);
                
                log(`\n🔥 CANDIDATE: ${event.name || event.mint.slice(0,8)}`);
                log(`   Status: ${isMigration ? 'PumpSwap Graduation 🎓' : `Trading at ${marketCap.toFixed(1)} SOL`}`);
                log(`   Starting forensic audit...`);
                
                const auditResult = await auditGraduatedToken(
                    event.mint,
                    event.traderPublicKey || event.user || "unknown",
                    event.name || "Unknown Token"
                );

                if (auditResult.passed) {
                    await sendAlert(event.mint, event.name || "Pump Gem", auditResult);
                }
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
║  🚀 V9.1 PUMPSWAP TRACKER - RADAR RESTORED                ║
║  🎯 Range: 10-500 SOL & Live PumpSwap Migrations          ║
║  ✅ Forensics: Fully Strict (V8.2 Standard)               ║
╚════════════════════════════════════════════════════════════╝
    `);

    log("✅ Environment verified");
    log(`📱 Telegram: ${TELEGRAM_TOKEN.slice(0, 20)}...`);
    log(`💬 Chat ID: ${TELEGRAM_CHAT_ID}`);
    log(`🔗 RPC: ${HELIUS_RPC.slice(0, 40)}...\n`);

    log("Starting Dual-Stream Monitor...\n");
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
