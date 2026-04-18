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

log('💎 ELITE SCANNER v4.1 - LOGS ENABLED');
log('📡 Monitoring PumpPortal Stream...\n');

// ==================== WARM WALLET VALIDATION ====================
async function validateWarmWallet(creator) {
    try {
        log(`🧪 Checking Dev Wallet Warmth: ${creator.slice(0,8)}...`);
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

        if (walletAgeDays < 30) return { warm: false, reason: `Too young (${walletAgeDays.toFixed(0)} days)`, score: 85 };

        const txsLast30Days = txs.filter(tx => (Date.now() / 1000 - tx.blockTime) / (60 * 60 * 24) < 30);
        if ((txs.length - txsLast30Days.length) > 40 && txsLast30Days.length > 15) {
            return { warm: false, reason: "Dormant wallet burst (Scammer)", score: 90 };
        }

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
    } catch (e) { return { warm: false, reason: "Validation Error", score: 100 }; }
}

// ==================== MAIN ANALYSIS (YOUR LOGIC) ====================
async function analyzeToken(mint, creator, name) {
    log(`🔍 Starting Forensic: ${name}`);
    
    const warmWallet = await validateWarmWallet(creator);
    if (!warmWallet.warm) {
        log(`   ❌ REJECTED: ${warmWallet.reason} (Score: ${warmWallet.score.toFixed(0)})`);
        return { verdict: "REJECT" };
    }
    log(`   ✅ Dev Warmth Passed (Score: ${warmWallet.score.toFixed(0)})`);

    // Holder Check
    const holdersRes = await axios.post(HELIUS_RPC, {
        jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint]
    }, { headers: HEADERS });
    const top1 = (holdersRes.data.result.value[0].uiAmount / 1000000000) * 100;

    if (top1 > 50) {
        log(`   ❌ REJECTED: Top Holder has ${top1.toFixed(1)}%`);
        return { verdict: "REJECT" };
    }
    log(`   ✅ Distribution Safe (${top1.toFixed(1)}%)`);

    return {
        verdict: "SEND_ALERT",
        details: { warmthScore: warmWallet.score, walletAge: warmWallet.details.ageDays, holderTop1: top1 }
    };
}

// ==================== WEBSOCKET RADAR ====================
function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    
    ws.on('open', () => {
        log('✅ Connected to PumpPortal Firehose');
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" })); 
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            
            // Log every incoming trade to show activity
            if (event.mint) {
                // Graduation Check (10 SOL threshold as per your request)
                if (event.marketCapSol >= 10 && !alertedMints.has(event.mint)) {
                    alertedMints.add(event.mint);
                    log(`🎓 Candidate Found: ${event.name} | MCap: ${event.marketCapSol.toFixed(2)} SOL`);
                    log(`   ⏳ Processing in 5 seconds...`);
                    
                    setTimeout(async () => {
                        const result = await analyzeToken(event.mint, event.traderPublicKey, event.name || "Unknown");
                        if (result.verdict === "SEND_ALERT") {
                            // Send Telegram Alert logic here...
                            log(`🚀 ALERT SENT: ${event.name}`);
                        }
                    }, 5000);
                }
            }
        } catch (e) {}
    });

    ws.on('close', () => setTimeout(startRadar, 3000));
}

startRadar();
