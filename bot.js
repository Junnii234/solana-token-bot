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

log('💎 ELITE SCANNER v4.8 - SMART BYPASS ENABLED');

// ==================== WARM WALLET VALIDATION ====================
async function validateWarmWallet(creator) {
    try {
        log(`🧪 Step 1/5: WARM WALLET CHECK [${creator.slice(0,8)}...]`);
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, 
            method: "getSignaturesForAddress", 
            params: [creator, { limit: 200 }]
        }, { headers: HEADERS, timeout: 10000 });

        const txs = res.data.result || [];
        if (txs.length === 0) return { warm: false, reason: "New Wallet (0 txs)", score: 100 };

        const oldestTx = txs[txs.length - 1];
        const newestTx = txs[0];
        const walletAgeDays = ((newestTx.blockTime - oldestTx.blockTime) * 1000) / (1000 * 60 * 60 * 24);

        if (walletAgeDays < 30) return { warm: false, reason: `Too young: ${walletAgeDays.toFixed(0)} days`, score: 85 };

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

// ==================== AUTHORITY CHECK (SMART BYPASS) ====================
async function checkAuthorities(mint, marketCap) {
    try {
        const res = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } }, { headers: HEADERS });
        const asset = res.data.result;

        // Freeze Authority check (Hamesha safe honi chahiye)
        if (asset.ownership?.frozen === false) return { safe: false, reason: "Freeze authority active" };

        // Mint Authority Check (Only near Raydium graduation)
        if (marketCap >= 80) {
            if (asset.mutable === true) return { safe: false, reason: "Mint authority not revoked near graduation" };
        }

        return { safe: true };
    } catch (e) { return { safe: false, reason: "Auth check failed" }; }
}

// ==================== HOLDER CHECK ====================
async function checkHolderDistribution(mint) {
    try {
        const res = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint] }, { headers: HEADERS });
        const holders = res.data.result.value || [];
        const top1 = (holders[0].uiAmount / 1000000000) * 100;
        if (top1 > 50) return { safe: false, reason: `Whale Alert: ${top1.toFixed(1)}%` };
        return { safe: true, top1 };
    } catch (e) { return { safe: false, reason: "Holder check failed" }; }
}

// ==================== MAIN ANALYSIS ====================
async function analyzeToken(mint, creator, name, marketCap) {
    try {
        log(`\n🔍 Forensic Analysis: ${name}`);
        
        const warm = await validateWarmWallet(creator);
        if (!warm.warm) { log(`   ❌ REJECT: ${warm.reason}`); return null; }
        log(`   ✅ PASS: Warm Wallet Score ${warm.score.toFixed(0)}`);

        const auth = await checkAuthorities(mint, marketCap);
        if (!auth.safe) { log(`   ❌ REJECT: ${auth.reason}`); return null; }
        log(`   ✅ PASS: Authorities Check (${marketCap < 80 ? 'Bonding Bypass' : 'Revoked'})`);

        const holders = await checkHolderDistribution(mint);
        if (!holders.safe) { log(`   ❌ REJECT: ${holders.reason}`); return null; }
        log(`   ✅ PASS: Holders Safe (${holders.top1.toFixed(1)}%)`);

        return { score: warm.score, age: warm.details.ageDays, top1: holders.top1 };
    } catch (e) { return null; }
}

// ==================== RADAR ====================
function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    
    ws.on('open', () => {
        log('📡 WebSocket Connected - Monitoring New Tokens & Trades');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" })); 
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" })); 
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (!event.mint || alertedMints.has(event.mint)) return;

            // Live Traffic Log
            if (event.marketCapSol) {
                console.log(`🔹 [TRAFFIC]: ${event.name || '???'} | MCap: ${event.marketCapSol.toFixed(2)} SOL`);
            }

            // Analysis Trigger: Between 10 and 100 SOL
            if (event.marketCapSol >= 10 && event.marketCapSol <= 100) {
                alertedMints.add(event.mint);
                log(`🎯 CANDIDATE DETECTED: ${event.name} (${event.marketCapSol.toFixed(1)} SOL)`);

                setTimeout(async () => {
                    const result = await analyzeToken(event.mint, event.traderPublicKey, event.name || "Unknown", event.marketCapSol);
                    if (result) {
                        const report = `🌟 **ELITE VERIFIED TOKEN** 🌟\n\n` +
                                       `🏷️ **Name:** ${event.name}\n` +
                                       `👴 **Dev Age:** ${result.age} days\n` +
                                       `👥 **Top Whale:** ${result.top1.toFixed(1)}%\n\n` +
                                       `🔗 [DexScreener](https://dexscreener.com/solana/${event.mint})`;
                        await bot.sendMessage(TELEGRAM_CHAT_ID, report, { parse_mode: 'Markdown' });
                        log(`🚀 ALERT SENT: ${event.name}`);
                    }
                }, 10000); // 10s wait
            }
        } catch (e) {}
    });

    ws.on('close', () => setTimeout(startRadar, 3000));
}

startRadar();
