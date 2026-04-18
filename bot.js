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

log('💎 ELITE SCANNER v5.5 - GRADUATES ONLY');
log('🌐 Socials Logic: Website OR X OR TG = PASS\n');

// ==================== 1. WARM WALLET CHECK ====================

async function validateWarmWallet(creator) {
    try {
        log(`🧪 Step 1/5: WARM WALLET CHECK...`);
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [creator, { limit: 200 }]
        }, { headers: HEADERS, timeout: 10000 });
        
        const txs = res.data.result || [];
        if (txs.length === 0) return { warm: false };
        
        const age = ((txs[0].blockTime - txs[txs.length-1].blockTime) * 1000) / (1000 * 60 * 60 * 24);
        return { warm: age > 30, age: age.toFixed(1), score: Math.max(0, (100 - age) / 2) };
    } catch (e) { return { warm: false }; }
}

// ==================== 2. ADVANCED METADATA (ANY 1 SOCIAL) ====================

async function checkMetadataSocials(mint, name, symbol) {
    try {
        log(`📝 Step 2/5: SOCIALS & RED FLAGS CHECK...`);
        
        // Red Flag Words Check
        const redFlags = ["scam", "test", "fake", "rug", "moon", "dev", "pump"];
        const text = `${name} ${symbol}`.toLowerCase();
        if (redFlags.some(flag => text.includes(flag))) return { safe: false, reason: "Red flag name" };

        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        }, { headers: HEADERS });

        const asset = res.data.result;
        const metadata = (asset?.content?.metadata_description || "").toLowerCase();
        const links = asset?.content?.links || {};

        // Socials Check Logic (Any one of the three)
        const hasX = !!links.twitter || metadata.includes("x.com") || metadata.includes("t.co");
        const hasTG = !!links.telegram || metadata.includes("t.me");
        const hasWeb = !!links.website || metadata.includes("http") || metadata.includes(".io") || metadata.includes(".com");

        if (hasX || hasTG || hasWeb) {
            log(`   ✅ Socials Found: [Web: ${hasWeb}, X: ${hasX}, TG: ${hasTG}]`);
            return { safe: true, socials: { x: hasX, tg: hasTG, web: hasWeb } };
        }

        return { safe: false, reason: "No Social Links found" };
    } catch (e) { return { safe: false, reason: "Metadata error" }; }
}

// ==================== 3. AUTHORITY CHECK ====================

async function checkAuthorities(mint) {
    try {
        log(`🛡️ Step 3/5: AUTHORITY CHECK...`);
        const res = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } }, { headers: HEADERS });
        const asset = res.data.result;
        
        if (asset.mutable === true) return { safe: false, reason: "Mint Active" };
        if (asset.ownership?.frozen === false) return { safe: false, reason: "Freeze Active" };
        
        return { safe: true };
    } catch (e) { return { safe: false }; }
}

// ==================== 4. HOLDER CHECK (RETRY LOGIC) ====================

async function checkHolderDistribution(mint, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            log(`👥 Step 4/5: HOLDER CHECK (Attempt ${i+1})...`);
            const res = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint] }, { headers: HEADERS });
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

async function analyzeToken(mint, creator, name, symbol) {
    try {
        log(`\n🔍 Analyzing Candidate: ${name}`);
        
        const meta = await checkMetadataSocials(mint, name, symbol);
        if (!meta.safe) { log(`   ❌ REJECT: ${meta.reason}`); return null; }

        const warm = await validateWarmWallet(creator);
        if (!warm.warm) { log(`   ❌ REJECT: Dev too young`); return null; }

        const auth = await checkAuthorities(mint);
        if (!auth.safe) { log(`   ❌ REJECT: Authorities not revoked`); return null; }

        const holders = await checkHolderDistribution(mint);
        if (!holders.safe) { log(`   ❌ REJECT: Whale alert`); return null; }

        return { age: warm.age, top1: holders.top1, socials: meta.socials };
    } catch (e) { return null; }
}

// ==================== RADAR ====================

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    
    ws.on('open', () => {
        log('📡 WebSocket Connected - High Safety Graduate Mode');
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" })); 
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (!event.mint || alertedMints.has(event.mint)) return;

            // Target ONLY Graduates (80-100 SOL)
            if (event.marketCapSol >= 80 && event.marketCapSol <= 100) {
                alertedMints.add(event.mint);
                log(`🎯 GRADUATE DETECTED: ${event.name}`);

                setTimeout(async () => {
                    const result = await analyzeToken(event.mint, event.traderPublicKey, event.name, event.symbol);
                    if (result) {
                        const report = `🎓 **ELITE GRADUATED TOKEN** 🛡️\n\n` +
                                       `🏷️ **Name:** ${event.name}\n` +
                                       `👴 **Dev Age:** ${result.age} days\n` +
                                       `👥 **Top Whale:** ${result.top1.toFixed(1)}%\n\n` +
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
