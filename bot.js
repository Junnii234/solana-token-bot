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

log('💎 ELITE SCANNER v4.5 - FULL REWRITE');
log('🔥 Your Original Logic + High-Performance Detection\n');

// ==================== WARM WALLET VALIDATION (ORIGINAL) ====================

async function validateWarmWallet(creator) {
    try {
        log(`🧪 Step 1/5: WARM WALLET VALIDATION [${creator.slice(0,8)}...]`);
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, 
            method: "getSignaturesForAddress", 
            params: [creator, { limit: 200 }]
        }, { headers: HEADERS, timeout: 10000 });

        const txs = res.data.result || [];
        if (txs.length === 0) return { warm: false, reason: "No transaction history", score: 100 };

        const oldestTx = txs[txs.length - 1];
        const newestTx = txs[0];
        const walletAgeDays = ((newestTx.blockTime - oldestTx.blockTime) * 1000) / (1000 * 60 * 60 * 24);

        if (walletAgeDays < 30) return { warm: false, reason: `Wallet too young: ${walletAgeDays.toFixed(0)} days`, score: 85 };

        const txsLast30Days = txs.filter(tx => (Date.now() / 1000 - tx.blockTime) / (60 * 60 * 24) < 30);
        const dormancyGap = txs.length - txsLast30Days.length;
        if (dormancyGap > 40 && txsLast30Days.length > 15) return { warm: false, reason: "Recycled Scammer detected", score: 90 };

        const balanceRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getBalance", params: [creator]
        }, { headers: HEADERS });
        const balanceSol = (balanceRes.data.result.value || 0) / 1e9;

        let warmthScore = Math.min(100, Math.max(0, (100 - walletAgeDays) / 2 + (1 - balanceSol) * 30));
        return {
            warm: warmthScore < 35,
            score: warmthScore,
            details: { ageDays: walletAgeDays.toFixed(1), totalTxs: txs.length, balanceSol: balanceSol.toFixed(4) }
        };
    } catch (e) { return { warm: false, reason: "Validation Timeout", score: 100 }; }
}

// ==================== AUTHORITY & SUPPLY CHECKS (ORIGINAL) ====================

async function checkAuthorities(mint) {
    try {
        const res = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } }, { headers: HEADERS });
        const asset = res.data.result;
        if (asset.mutable === true || asset.ownership?.frozen === false) return { safe: false, reason: "Mint authority active" };
        return { safe: true };
    } catch (e) { return { safe: false, reason: "Auth check failed" }; }
}

async function checkHolderDistribution(mint) {
    try {
        const res = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint] }, { headers: HEADERS });
        const holders = res.data.result.value || [];
        const top1 = (holders[0].uiAmount / 1000000000) * 100;
        if (top1 > 50) return { safe: false, reason: `Top whale: ${top1.toFixed(1)}%` };
        return { safe: true, top1 };
    } catch (e) { return { safe: false, reason: "Holder check failed" }; }
}

// ==================== MAIN ANALYSIS ENGINE ====================

async function analyzeToken(mint, creator, name) {
    try {
        log(`\n🔍 Analyzing Candidate: ${name}`);
        
        const warm = await validateWarmWallet(creator);
        if (!warm.warm) { log(`   ❌ REJECT: ${warm.reason}`); return { verdict: "REJECT" }; }
        log(`   ✅ PASS: Warm Wallet Score ${warm.score.toFixed(0)}`);

        const auth = await checkAuthorities(mint);
        if (!auth.safe) { log(`   ❌ REJECT: ${auth.reason}`); return { verdict: "REJECT" }; }
        log(`   ✅ PASS: Authorities Revoked`);

        const holders = await checkHolderDistribution(mint);
        if (!holders.safe) { log(`   ❌ REJECT: ${holders.reason}`); return { verdict: "REJECT" }; }
        log(`   ✅ PASS: Holders Safe (${holders.top1.toFixed(1)}%)`);

        return { verdict: "SEND_ALERT", details: { warmthScore: warm.score, walletAge: warm.details.ageDays, holderTop1: holders.top1 } };
    } catch (e) { return { verdict: "REJECT" }; }
}

// ==================== TELEGRAM ALERT ====================

async function sendTelegramAlert(mint, name, analysis) {
    try {
        const report = `🌟 **ELITE VERIFIED TOKEN** 🌟\n\n` +
                       `🏷️ **Name:** ${name}\n` +
                       `✅ Dev Warmth: ${analysis.details.warmthScore.toFixed(0)}/100\n` +
                       `👴 Wallet Age: ${analysis.details.walletAge} days\n` +
                       `👥 Top Whale: ${analysis.details.holderTop1.toFixed(1)}%\n\n` +
                       `🔗 [DexScreener](https://dexscreener.com/solana/${mint})`;

        await bot.sendMessage(TELEGRAM_CHAT_ID, report, { parse_mode: 'Markdown' });
        log(`📤 TELEGRAM ALERT SENT: ${name}`);
    } catch (e) { error(`Alert Error: ${e.message}`); }
}

// ==================== UPGRADED RADAR (DETECTION) ====================

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    
    ws.on('open', () => {
        log('📡 WebSocket Connected - Detection Engine Active');
        // V67 Hybrid Method: New Tokens + Trades
        ws.send(JSON.stringify({ "method": "subscribeNewToken" })); 
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" })); 
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (!event.mint || alertedMints.has(event.mint)) return;

            // Log activity to show bot is alive
            console.log(`🔹 [TRAFFIC]: ${event.name || 'Unknown'} | MCap: ${event.marketCapSol?.toFixed(2)} SOL`);

            // Target Graduation Window (10-100 SOL)
            if (event.marketCapSol >= 10 && event.marketCapSol <= 100) {
                alertedMints.add(event.mint);
                log(`🎯 CANDIDATE DETECTED: ${event.name} (${event.marketCapSol.toFixed(1)} SOL)`);
                
                // 10 second delay for metadata indexing (Modified from 60s for faster logs)
                setTimeout(async () => {
                    const result = await analyzeToken(event.mint, event.traderPublicKey, event.name || "Unknown");
                    if (result.verdict === "SEND_ALERT") {
                        await sendTelegramAlert(event.mint, event.name, result);
                    }
                }, 10000);
            }
        } catch (e) {}
    });

    ws.on('close', () => setTimeout(startRadar, 3000));
}

startRadar();
