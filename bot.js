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
const lastLogTime = new Map();
const HEADERS = { 'Content-Type': 'application/json' };

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

log('💎 ELITE SCANNER v6.2 - FULL REWRITE');
log('📡 DEX: PumpSwap & Raydium | Focus: Any Social + 65 SOL Graduation\n');

// ==================== 1. WARM WALLET CHECK ====================
async function validateWarmWallet(creator) {
    try {
        log(`🧪 Step 1/4: WARM WALLET CHECK...`);
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [creator, { limit: 100 }]
        }, { headers: HEADERS, timeout: 10000 });
        
        const txs = res.data.result || [];
        if (txs.length === 0) return { warm: false };
        
        const age = ((txs[0].blockTime - txs[txs.length-1].blockTime) * 1000) / (1000 * 60 * 60 * 24);
        return { warm: age > 30, age: age.toFixed(1) };
    } catch (e) { return { warm: false }; }
}

// ==================== 2. METADATA & SOCIALS (ANY 1) ====================
async function checkMetadata(mint) {
    try {
        log(`📝 Step 2/4: SOCIALS & RED FLAGS...`);
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        }, { headers: HEADERS });

        const asset = res.data.result;
        const metadata = (asset?.content?.metadata_description || "").toLowerCase();
        const links = asset?.content?.links || {};

        const hasSocial = !!links.twitter || !!links.telegram || !!links.website || 
                          metadata.includes("t.me") || metadata.includes("x.com") || metadata.includes("http");
        
        return { safe: hasSocial };
    } catch (e) { return { safe: false }; }
}

// ==================== 3. AUTHORITY CHECK ====================
async function checkAuthorities(mint) {
    try {
        log(`🛡️ Step 3/4: AUTHORITY CHECK...`);
        const res = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } 
        }, { headers: HEADERS });
        
        const asset = res.data.result;
        return { safe: asset.mutable === false && asset.ownership?.frozen === true };
    } catch (e) { return { safe: false }; }
}

// ==================== 4. HOLDER CHECK ====================
async function checkHolderDistribution(mint) {
    try {
        log(`👥 Step 4/4: HOLDER CHECK...`);
        const res = await axios.post(HELIUS_RPC, { 
            jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint] 
        }, { headers: HEADERS });
        
        const holders = res.data.result?.value;
        if (holders && holders.length > 0) {
            const top1 = (holders[0].uiAmount / 1000000000) * 100;
            return { safe: top1 <= 50, top1 };
        }
        return { safe: false };
    } catch (e) { return { safe: false }; }
}

// ==================== MAIN ANALYSIS ====================
async function analyzeToken(mint, creator, name) {
    log(`🔍 Forensic Analysis: ${name}`);
    
    const meta = await checkMetadata(mint);
    if (!meta.safe) { log(`   ❌ REJECT: No Social Presence`); return null; }

    const warm = await validateWarmWallet(creator);
    if (!warm.warm) { log(`   ❌ REJECT: New Developer`); return null; }

    const auth = await checkAuthorities(mint);
    if (!auth.safe) { log(`   ❌ REJECT: Authorities Active`); return null; }

    const holders = await checkHolderDistribution(mint);
    if (!holders.safe) { log(`   ❌ REJECT: High Supply Concentration`); return null; }

    return { age: warm.age, top1: holders.top1 };
}

// ==================== RADAR ====================
function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    
    ws.on('open', () => {
        log('📡 WebSocket Connected! Monitoring Bonding Curves...');
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" })); 
    });

    setInterval(() => log('💓 Heartbeat: Bot is actively scanning trades...'), 60000);

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (!event.mint) return;

            const mcap = event.marketCapSol || 0;

            // --- 🟢 LIVE PROGRESS LOG (Ab screen silent nahi hogi) ---
            if (mcap >= 550 && mcap < 600) {
                const now = Date.now();
                if (now - (lastLogTime.get(event.mint) || 0) > 15000) {
                    log(`📈 PROGRESS: ${event.name} is climbing (${mcap.toFixed(1)} SOL)`);
                    lastLogTime.set(event.mint, now);
                }
            }

            // --- 🎯 FINAL TARGET: 600 SOL (PumpSwap Graduation Zone) ---
            if (mcap >= 600 && !alertedMints.has(event.mint)) {
                alertedMints.add(event.mint);
                log(`🔥 TARGET REACHED: ${event.name} hit 65 SOL! Analyzing...`);

                setTimeout(async () => {
                    const result = await analyzeToken(event.mint, event.traderPublicKey || event.user, event.name);
                    
                    if (result) {
                        const report = `🎓 **ELITE GRADUATE DETECTED** 🛡️\n\n` +
                                       `🏷️ **Name:** ${event.name}\n` +
                                       `👴 **Dev Age:** ${result.age} days\n` +
                                       `👥 **Top Whale:** ${result.top1.toFixed(1)}%\n\n` +
                                       `🛒 [Buy on PumpSwap](https://pumpswap.com/swap?outputCurrency=${event.mint})\n` +
                                       `📊 [DexScreener](https://dexscreener.com/solana/${event.mint})`;

                        await bot.sendMessage(TELEGRAM_CHAT_ID, report, { parse_mode: 'Markdown' });
                        log(`🚀 ALERT SENT: ${event.name}`);
                    }
                }, 15000); 
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        log('⚠️ WebSocket Closed. Reconnecting...');
        setTimeout(startRadar, 3000);
    });
}

startRadar();
