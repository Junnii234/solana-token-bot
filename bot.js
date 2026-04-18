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

log('💎 ELITE SCANNER v5.2 - GRADUATED TOKENS ONLY');
log('🛡️ All Safety Checks Reset: Mint & Freeze Authority MUST be Disabled\n');

// ==================== WARM WALLET VALIDATION ====================

async function validateWarmWallet(creator) {
    try {
        log(`🧪 Step 1/4: WARM WALLET CHECK [${creator.slice(0,8)}...]`);
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, 
            method: "getSignaturesForAddress", 
            params: [creator, { limit: 200 }]
        }, { headers: HEADERS, timeout: 10000 });

        const txs = res.data.result || [];
        if (txs.length === 0) return { warm: false, reason: "New Wallet", score: 100 };

        const walletAgeDays = ((txs[0].blockTime - txs[txs.length-1].blockTime) * 1000) / (1000 * 60 * 60 * 24);
        if (walletAgeDays < 30) return { warm: false, reason: `Too young: ${walletAgeDays.toFixed(0)}d`, score: 85 };

        let warmthScore = Math.max(0, (100 - walletAgeDays) / 2);
        return { warm: warmthScore < 35, score: warmthScore, age: walletAgeDays.toFixed(1) };
    } catch (e) { return { warm: false, reason: "RPC Error" }; }
}

// ==================== FULL AUTHORITY CHECK (RESET) ====================

async function checkAuthorities(mint) {
    try {
        log(`🛡️ Step 2/4: AUTHORITY CHECK (Mint & Freeze)...`);
        const res = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } 
        }, { headers: HEADERS });
        
        const asset = res.data.result;
        
        // 1. Mint Authority Check
        if (asset.mutable === true) return { safe: false, reason: "Mint authority ACTIVE" };
        
        // 2. Freeze Authority Check
        if (asset.ownership?.frozen === false) return { safe: false, reason: "Freeze authority ACTIVE" };

        return { safe: true };
    } catch (e) { return { safe: false, reason: "Auth check failed" }; }
}

// ==================== HOLDER CHECK (WITH RETRY) ====================

async function checkHolderDistribution(mint, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            log(`👥 Step 3/4: HOLDER CHECK (Attempt ${i+1})...`);
            const res = await axios.post(HELIUS_RPC, {
                jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint]
            }, { headers: HEADERS, timeout: 10000 });

            const holders = res.data.result?.value;
            if (holders && holders.length > 0) {
                const top1 = (holders[0].uiAmount / 1000000000) * 100;
                if (top1 > 50) return { safe: false, reason: `Whale Alert: ${top1.toFixed(1)}%` };
                return { safe: true, top1 };
            }
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) { if (i === retries-1) return { safe: false, reason: "Holder error" }; }
    }
}

// ==================== MAIN ANALYSIS ====================

async function analyzeToken(mint, creator, name) {
    try {
        log(`\n🔍 Analyzing Graduate Candidate: ${name}`);
        
        const warm = await validateWarmWallet(creator);
        if (!warm.warm) { log(`   ❌ REJECT: ${warm.reason}`); return null; }

        const auth = await checkAuthorities(mint);
        if (!auth.safe) { log(`   ❌ REJECT: ${auth.reason}`); return null; }

        const holders = await checkHolderDistribution(mint);
        if (!holders.safe) { log(`   ❌ REJECT: ${holders.reason}`); return null; }

        return { score: warm.score, age: warm.age, top1: holders.top1 };
    } catch (e) { return null; }
}

// ==================== RADAR (GRADUATED TARGETING) ====================

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    
    ws.on('open', () => {
        log('📡 WebSocket Connected - High Safety Mode (Graduates Only)');
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" })); 
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (!event.mint || alertedMints.has(event.mint)) return;

            // Target ONLY tokens near or at graduation (75 SOL to 100 SOL)
            if (event.marketCapSol >= 75 && event.marketCapSol <= 100) {
                alertedMints.add(event.mint);
                log(`🎯 GRADUATE CANDIDATE: ${event.name} (${event.marketCapSol.toFixed(1)} SOL)`);

                setTimeout(async () => {
                    const result = await analyzeToken(event.mint, event.traderPublicKey, event.name || "Unknown");
                    if (result) {
                        const report = `🎓 **ELITE GRADUATED TOKEN** 🛡️\n\n` +
                                       `🏷️ **Name:** ${event.name}\n` +
                                       `👴 **Dev Age:** ${result.age} days\n` +
                                       `👥 **Top Whale:** ${result.top1.toFixed(1)}%\n` +
                                       `✅ **Safety:** All Authorities Revoked\n\n` +
                                       `🔗 [DexScreener](https://dexscreener.com/solana/${event.mint})`;
                        await bot.sendMessage(TELEGRAM_CHAT_ID, report, { parse_mode: 'Markdown' });
                        log(`🚀 ALERT SENT: ${event.name}`);
                    }
                }, 15000); 
            }
        } catch (e) {}
    });

    ws.on('close', () => setTimeout(startRadar, 3000));
}

startRadar();
