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
const lastProgressLog = new Map();
const HEADERS = { 'Content-Type': 'application/json' };

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

log('🚀 PUMPSWAP ELITE SCANNER v6.5 - INITIALIZED');
log('📡 Monitoring PumpSwap Migration & High-Cap Bonding Curves\n');

// ==================== 1. FORENSIC ENGINE ====================

async function performForensic(mint, creator, name) {
    try {
        log(`🔍 Forensic Audit Started: ${name}`);
        
        // Fetch Asset Data from Helius
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        }, { headers: HEADERS });
        
        const asset = res.data.result;
        if (!asset) return { safe: false, reason: "Asset Not Found" };

        // A. Metadata & Socials Check (Any 1)
        const metadata = (asset?.content?.metadata_description || "").toLowerCase();
        const links = asset?.content?.links || {};
        const hasSocials = !!links.twitter || !!links.telegram || !!links.website || metadata.includes("http");
        
        if (!hasSocials) return { safe: false, reason: "No Social Presence" };
        log(`   ✅ Socials: Verified`);

        // B. Authority Check (Graduate Status)
        // PumpSwap graduation par mutable: false hona lazmi hai
        const isAuthSafe = asset.mutable === false;
        if (!isAuthSafe) return { safe: false, reason: "Mint Authority Not Revoked" };
        log(`   ✅ Authority: Revoked/Safe`);

        // C. Developer Wallet Age Check
        const sigRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [creator, { limit: 50 }]
        }, { headers: HEADERS });
        const txs = sigRes.data.result || [];
        const age = txs.length > 1 ? ((txs[0].blockTime - txs[txs.length-1].blockTime) * 1000) / (1000 * 60 * 60 * 24) : 0;
        
        if (age < 30 && txs.length < 15) return { safe: false, reason: "Developer Too New" };
        log(`   ✅ Dev Age: ${age.toFixed(1)} days`);

        return { safe: true, age: age.toFixed(1) };
    } catch (e) {
        log(`   ⚠️ Forensic Error: ${e.message}`);
        return { safe: false };
    }
}

// ==================== 2. RADAR & MIGRATION ENGINE ====================

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    
    ws.on('open', () => {
        log('📡 Connected to PumpPortal WebSocket');
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" })); 
    });

    // Activity Heartbeat
    setInterval(() => log('💓 Scanner Active: Listening for PumpSwap graduates...'), 45000);

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (!event.mint || alertedMints.has(event.mint)) return;

            const mcap = event.marketCapSol || 0;

            // 🟢 LIVE TRACKING LOG (45 SOL se upar walay coins)
            if (mcap >= 45 && mcap < 65) {
                const now = Date.now();
                if (now - (lastProgressLog.get(event.mint) || 0) > 20000) {
                    log(`📈 TRACKING: ${event.name} climbing... Current Cap: ${mcap.toFixed(1)} SOL`);
                    lastProgressLog.set(event.mint, now);
                }
            }

            // 🎯 TRIGGER: PUMPSWAP GRADUATION ZONE (65 SOL+)
            // Jaise hi Dumb Money wala scenario hit hoga (65+ SOL), analysis trigger hogi
            if (mcap >= 65) {
                alertedMints.add(event.mint);
                log(`🔥 TARGET DETECTED: ${event.name} hit ${mcap.toFixed(1)} SOL (PumpSwap Zone)`);

                // 15s Delay: Taake Pumpswap par liquidity migrate ho jaye aur blockchain update ho
                setTimeout(async () => {
                    const analysis = await performForensic(event.mint, event.traderPublicKey || event.user, event.name);
                    
                    if (analysis.safe) {
                        const report = `🎓 **ELITE PUMPSWAP GRADUATE** 🛡️\n\n` +
                                       `🏷️ **Name:** ${event.name}\n` +
                                       `👴 **Dev Age:** ${analysis.age} days\n` +
                                       `✅ **Status:** Graduate (PumpSwap)\n\n` +
                                       `🛒 [Buy on PumpSwap](https://pumpswap.com/swap?outputCurrency=${event.mint})\n` +
                                       `📊 [DexScreener](https://dexscreener.com/solana/${event.mint})`;

                        await bot.sendMessage(TELEGRAM_CHAT_ID, report, { parse_mode: 'Markdown' });
                        log(`🚀 ELITE ALERT SENT: ${event.name}`);
                    } else {
                        log(`   ❌ REJECTED: ${analysis.reason}`);
                    }
                }, 15000); 
            }
        } catch (e) {
            // Silently handle JSON errors
        }
    });

    ws.on('close', () => {
        log('⚠️ Connection lost. Reconnecting in 3s...');
        setTimeout(startRadar, 3000);
    });
}

// ==================== START ====================
startRadar();
