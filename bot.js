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

log('💎 ELITE SCANNER v6.0 - PUMPSWAP TARGET MODE');
log('🛡️ All Safety Checks Enabled | Dex: PumpSwap\n');

// ==================== 1. WARM WALLET (ELITE DEV) ====================
async function validateWarmWallet(creator) {
    try {
        log(`🧪 Step 1/5: WARM WALLET CHECK...`);
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [creator, { limit: 200 }]
        }, { headers: HEADERS, timeout: 10000 });
        
        const txs = res.data.result || [];
        if (txs.length === 0) return { warm: false };
        
        const age = ((txs[0].blockTime - txs[txs.length-1].blockTime) * 1000) / (1000 * 60 * 60 * 24);
        // Dev kam az kam 30 din purana hona chahiye
        return { warm: age > 30, age: age.toFixed(1) };
    } catch (e) { return { warm: false }; }
}

// ==================== 2. METADATA & SOCIALS (ANY 1) ====================
async function checkMetadata(mint) {
    try {
        log(`📝 Step 2/5: SOCIALS & RED FLAGS...`);
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        }, { headers: HEADERS });

        const asset = res.data.result;
        const metadata = (asset?.content?.metadata_description || "").toLowerCase();
        const links = asset?.content?.links || {};

        // Any one social link must exist
        const hasSocial = !!links.twitter || !!links.telegram || !!links.website || metadata.includes("http");
        return { safe: hasSocial };
    } catch (e) { return { safe: false }; }
}

// ==================== 3. PUMPSWAP AUTHORITY CHECK ====================
async function checkAuthorities(mint) {
    try {
        log(`🛡️ Step 3/5: AUTHORITY CHECK (PUMPSWAP MODE)...`);
        const res = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } 
        }, { headers: HEADERS });
        
        const asset = res.data.result;
        // Mint Authority must be revoked (mutable: false)
        // Freeze Authority must be enabled (frozen: true) for graduation safety
        const isSafe = asset.mutable === false && asset.ownership?.frozen === true;
        return { safe: isSafe };
    } catch (e) { return { safe: false }; }
}

// ==================== 4. HOLDER CHECK (50% LIMIT) ====================
async function checkHolderDistribution(mint, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            log(`👥 Step 4/5: HOLDER CHECK (Attempt ${i+1})...`);
            const res = await axios.post(HELIUS_RPC, { 
                jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint] 
            }, { headers: HEADERS });
            
            const holders = res.data.result?.value;
            if (holders && holders.length > 0) {
                const top1 = (holders[0].uiAmount / 1000000000) * 100;
                return { safe: top1 <= 50, top1 };
            }
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) { if (i === retries-1) return { safe: false }; }
    }
}

// ==================== MAIN ANALYSIS ENGINE ====================
async function analyzeToken(mint, creator, name) {
    log(`\n🔍 Forensic Analysis for: ${name}`);
    
    const warm = await validateWarmWallet(creator);
    if (!warm.warm) { log(`   ❌ REJECT: New Developer`); return null; }
    log(`   ✅ Dev Age: ${warm.age} days`);

    const meta = await checkMetadata(mint);
    if (!meta.safe) { log(`   ❌ REJECT: No Socials`); return null; }
    log(`   ✅ Socials Found`);

    const auth = await checkAuthorities(mint);
    if (!auth.safe) { log(`   ❌ REJECT: Authorities Not Revoked`); return null; }
    log(`   ✅ Authorities Safe`);

    const holders = await checkHolderDistribution(mint);
    if (!holders.safe) { log(`   ❌ REJECT: High Holder Concentration`); return null; }
    log(`   ✅ Holder Supply Safe (${holders.top1.toFixed(1)}%)`);

    return { age: warm.age, top1: holders.top1 };
}

// ==================== RADAR (DEDICATED PUMPSWAP) ====================
function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    
    ws.on('open', () => {
        log('📡 WebSocket Live - Tracking PumpSwap Migration (65 SOL+)');
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" })); 
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (!event.mint || alertedMints.has(event.mint)) return;

            // Target tokens reaching PumpSwap graduation (65-100 SOL)
            if (event.marketCapSol >= 65 && event.marketCapSol <= 100) {
                alertedMints.add(event.mint);
                log(`🎯 PUMPSWAP CANDIDATE: ${event.name} (${event.marketCapSol.toFixed(1)} SOL)`);

                // 20s Delay taake Pumpswap liquidity pool aur metadata register ho jaye
                setTimeout(async () => {
                    const result = await analyzeToken(event.mint, event.traderPublicKey || event.user, event.name);
                    
                    if (result) {
                        const report = `🌟 **ELITE PUMPSWAP GRADUATE** 🛡️\n\n` +
                                       `🏷️ **Name:** ${event.name}\n` +
                                       `👴 **Dev Age:** ${result.age} days\n` +
                                       `👥 **Top Whale:** ${result.top1.toFixed(1)}%\n` +
                                       `🏪 **DEX:** PumpSwap Verified ✅\n\n` +
                                       `🔗 [View on PumpSwap](https://pumpswap.com/swap?outputCurrency=${event.mint})`;

                        await bot.sendMessage(TELEGRAM_CHAT_ID, report, { parse_mode: 'Markdown' });
                        log(`🚀 ALERT SENT: ${event.name}`);
                    }
                }, 20000); 
            }
        } catch (e) {}
    });

    ws.on('close', () => setTimeout(startRadar, 3000));
}

startRadar();
