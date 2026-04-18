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

// ==================== WARM WALLET VALIDATION ====================

async function validateWarmWallet(creator) {
    try {
        log(`🧪 Testing Wallet Warmth: ${creator.slice(0,8)}...`);
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
        if (dormancyGap > 40 && txsLast30Days.length > 15) return { warm: false, reason: "Dormant/Recycled Scammer", score: 90 };

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
    } catch (e) { return { warm: false, reason: "RPC Error", score: 100 }; }
}

// ... [Authority, Supply, Holder checks same as original] ...

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
        if (top1 > 50) return { safe: false, reason: `Top holder too heavy: ${top1.toFixed(1)}%` };
        return { safe: true, top1 };
    } catch (e) { return { safe: false, reason: "Holder check failed" }; }
}

// ==================== MAIN ANALYSIS ====================

async function analyzeToken(mint, creator, name) {
    try {
        log(`\n🔍 Forensic Started: ${name} (${mint.slice(0, 8)}...)`);
        
        const warmWallet = await validateWarmWallet(creator);
        if (!warmWallet.warm) {
            log(`   ❌ REJECT: ${warmWallet.reason} | Score: ${warmWallet.score.toFixed(0)}`);
            return { verdict: "REJECT" };
        }
        log(`   ✅ WARM WALLET PASSED (Score: ${warmWallet.score.toFixed(0)})`);

        const auth = await checkAuthorities(mint);
        if (!auth.safe) { log(`   ❌ REJECT: ${auth.reason}`); return { verdict: "REJECT" }; }
        log(`   ✅ AUTHORITIES REVOKED`);

        const holders = await checkHolderDistribution(mint);
        if (!holders.safe) { log(`   ❌ REJECT: ${holders.reason}`); return { verdict: "REJECT" }; }
        log(`   ✅ DISTRIBUTION SAFE (${holders.top1.toFixed(1)}%)`);

        return { verdict: "SEND_ALERT", details: { warmthScore: warmWallet.score, walletAge: warmWallet.details.ageDays, holderTop1: holders.top1 } };
    } catch (e) { log(`   ⚠️ Analysis Error: ${e.message}`); return { verdict: "REJECT" }; }
}

// ==================== WEBSOCKET RADAR ====================

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    
    ws.on('open', () => {
        log('📡 WebSocket Connected - Monitoring Global Stream');
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" })); 
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            
            if (event.mint) {
                // LIVE TRAFFIC LOG: Her trade par halka sa log taake aapko pata chale bot zinda hai
                console.log(`🔹 [STREAM]: ${event.name || 'Token'} | ${event.marketCapSol?.toFixed(2)} SOL`);

                if (event.marketCapSol >= 10 && !alertedMints.has(event.mint)) {
                    alertedMints.add(event.mint);
                    log(`🎓 CANDIDATE DETECTED: ${event.name} hits 10 SOL+`);
                    log(`   ⏳ Analyzing in 5 seconds...`);
                    
                    setTimeout(async () => {
                        const result = await analyzeToken(event.mint, event.traderPublicKey, event.name || "Unknown");
                        if (result.verdict === "SEND_ALERT") {
                            // Telegram Alert Function Call
                            const report = `🌟 **ELITE VERIFIED**\nName: ${event.name}\nWarmth: ${result.details.warmthScore.toFixed(0)}\nTop 1: ${result.details.holderTop1.toFixed(1)}%`;
                            await bot.sendMessage(TELEGRAM_CHAT_ID, report);
                            log(`🚀 SUCCESS: Alert sent for ${event.name}`);
                        }
                    }, 5000);
                }
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        log('🔄 WebSocket Disconnected. Reconnecting...');
        setTimeout(startRadar, 3000);
    });
}

// Startup
console.clear();
log('💎 ELITE SCANNER v4.1 - LOGS ACTIVE');
startRadar();
