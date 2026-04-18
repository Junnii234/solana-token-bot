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
const progressTracker = new Map(); // Naya feature: Token ki progress track karne ke liye
const HEADERS = { 'Content-Type': 'application/json' };

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

log('💎 ELITE SCANNER v5.7 - RADAR & RAYDIUM EDITION');
log('🚀 Tracking Progress & Catching Graduated Tokens\n');

// ==================== 1. WARM WALLET CHECK ====================
async function validateWarmWallet(creator) {
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [creator, { limit: 200 }]
        }, { headers: HEADERS, timeout: 10000 });
        const txs = res.data.result || [];
        if (txs.length === 0) return { warm: false };
        const age = ((txs[0].blockTime - txs[txs.length-1].blockTime) * 1000) / (1000 * 60 * 60 * 24);
        return { warm: age > 30, age: age.toFixed(1) };
    } catch (e) { return { warm: false }; }
}

// ==================== 2. METADATA & SOCIALS (ANY 1) ====================
async function checkMetadataSocials(mint, name, symbol) {
    try {
        const redFlags = ["scam", "test", "fake", "rug", "moon", "dev", "pump"];
        const text = `${name} ${symbol}`.toLowerCase();
        if (redFlags.some(flag => text.includes(flag))) return { safe: false, reason: "Red flag name" };

        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        }, { headers: HEADERS });

        const asset = res.data.result;
        const metadata = (asset?.content?.metadata_description || "").toLowerCase();
        const links = asset?.content?.links || {};

        const hasX = !!links.twitter || metadata.includes("x.com") || metadata.includes("t.co");
        const hasTG = !!links.telegram || metadata.includes("t.me");
        const hasWeb = !!links.website || metadata.includes("http") || metadata.includes(".io") || metadata.includes(".com");

        if (hasX || hasTG || hasWeb) return { safe: true };
        return { safe: false, reason: "No Social Links" };
    } catch (e) { return { safe: false, reason: "Metadata error" }; }
}

// ==================== 3. AUTHORITY CHECK ====================
async function checkAuthorities(mint) {
    try {
        const res = await axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } }, { headers: HEADERS });
        const asset = res.data.result;
        if (asset.mutable === true || asset.ownership?.frozen === false) return { safe: false, reason: "Authorities Active" };
        return { safe: true };
    } catch (e) { return { safe: false }; }
}

// ==================== 4. HOLDER CHECK ====================
async function checkHolderDistribution(mint, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
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

// ==================== MAIN ANALYSIS ====================
async function analyzeToken(mint, creator, name, symbol, source) {
    try {
        log(`\n🔍 Forensic Analysis Triggered by [${source}]: ${name}`);
        
        const meta = await checkMetadataSocials(mint, name, symbol);
        if (!meta.safe) { log(`   ❌ REJECT: ${meta.reason}`); return null; }
        
        const warm = await validateWarmWallet(creator);
        if (!warm.warm) { log(`   ❌ REJECT: Dev too young`); return null; }
        
        const auth = await checkAuthorities(mint);
        if (!auth.safe) { log(`   ❌ REJECT: Authorities Active`); return null; }
        
        const holders = await checkHolderDistribution(mint);
        if (!holders.safe) { log(`   ❌ REJECT: Whale alert`); return null; }

        log(`   ✅ ALL CHECKS PASSED: ${name} is ELITE!`);
        return { age: warm.age, top1: holders.top1 };
    } catch (e) { return null; }
}

// ==================== RADAR & RAYDIUM CATCHER ====================
function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    
    ws.on('open', () => {
        log('📡 WebSocket Connected!');
        // 1. Trades sunne ke liye
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" })); 
        // 2. GRADUATED (Raydium) tokens pakarne ke liye (NAYA FEATURE)
        ws.send(JSON.stringify({ "method": "subscribeRaydiumMigration" })); 
    });

    // Heartbeat: Har 1 minute baad batayega ke bot zinda hai
    setInterval(() => log(`💓 BOT ALIVE: Scanning for progress & graduates...`), 60000);

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (!event.mint) return;

            // --- FEATURE 1: RAYDIUM MIGRATION CATCHER ---
            // Agar token graduate ho kar Raydium par ja raha hai
            if (event.txType === "raydium_migration" && !alertedMints.has(event.mint)) {
                alertedMints.add(event.mint);
                log(`🔥 GRADUATION ALERT: ${event.name} just left bonding curve!`);
                
                setTimeout(async () => {
                    const result = await analyzeToken(event.mint, event.traderPublicKey || event.user, event.name, event.symbol, "RAYDIUM MIGRATION");
                    if (result) {
                        const report = `🎓 **ELITE RAYDIUM GRADUATE** 🛡️\n\n` +
                                       `🏷️ **Name:** ${event.name}\n` +
                                       `👴 **Dev Age:** ${result.age} days\n` +
                                       `👥 **Top Whale:** ${result.top1.toFixed(1)}%\n` +
                                       `✅ **Status:** Officially on Raydium\n\n` +
                                       `🔗 [DexScreener](https://dexscreener.com/solana/${event.mint})`;
                        await bot.sendMessage(TELEGRAM_CHAT_ID, report, { parse_mode: 'Markdown' });
                    }
                }, 15000); // Wait for Raydium pools to settle
                return;
            }

            // --- FEATURE 2: PROGRESS TRACKER ---
            // Agar token trade ho raha hai aur 40 SOL se upar hai
            if (event.marketCapSol) {
                const mcap = event.marketCapSol;

                // Logs mein progress show karna (40 SOL se 60 SOL ke beech)
                if (mcap >= 40 && mcap < 60) {
                    const lastLogTime = progressTracker.get(event.mint) || 0;
                    // Har 10 second mein ek baar log karega taake spam na ho
                    if (Date.now() - lastLogTime > 10000) {
                        log(`📈 CLIMBING: ${event.name || 'Unknown'} is at ${mcap.toFixed(1)} SOL (Targeting 60)`);
                        progressTracker.set(event.mint, Date.now());
                    }
                }

                // Agar 60 SOL hit kar le (Pre-Graduation Alert)
                if (mcap >= 60 && !alertedMints.has(event.mint)) {
                    alertedMints.add(event.mint);
                    log(`🎯 60+ SOL REACHED: ${event.name} is ready for analysis!`);

                    setTimeout(async () => {
                        const result = await analyzeToken(event.mint, event.traderPublicKey, event.name, event.symbol, "60+ SOL TARGET");
                        if (result) {
                            const report = `🚀 **ELITE PRE-GRADUATE (60+ SOL)** 🛡️\n\n` +
                                           `🏷️ **Name:** ${event.name}\n` +
                                           `👴 **Dev Age:** ${result.age} days\n` +
                                           `👥 **Top Whale:** ${result.top1.toFixed(1)}%\n\n` +
                                           `🔗 [DexScreener](https://dexscreener.com/solana/${event.mint})`;
                            await bot.sendMessage(TELEGRAM_CHAT_ID, report, { parse_mode: 'Markdown' });
                        }
                    }, 10000); 
                }
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        log('⚠️ WebSocket Disconnected. Reconnecting in 3s...');
        setTimeout(startRadar, 3000);
    });
}

startRadar();
