require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// ==================== CONFIG ====================
// Note: Inko Railway ke Environment Variables mein lazmi daalein
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8006731872";
const HELIUS_RPC = process.env.HELIUS_RPC || `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alertedMints = new Set();
const HEADERS = { 'Content-Type': 'application/json' };

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

log('🚀 V8.1 PUMPSWAP SNIPER - FULL REWRITE');

// ==================== ADVANCED FORENSIC ENGINE ====================

async function forensicAudit(mint, creator, name, attempt = 1) {
    try {
        log(`🔬 Audit [Attempt ${attempt}/5]: ${name}`);
        
        // Helius Asset API Call
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        }, { headers: HEADERS });
        
        const asset = res.data.result;
        if (!asset) {
            if (attempt < 5) {
                await new Promise(r => setTimeout(r, 7000)); // 7s Wait
                return await forensicAudit(mint, creator, name, attempt + 1);
            }
            return { success: false };
        }

        // 1. Socials & Metadata Check
        const metadata = (asset?.content?.metadata_description || "").toLowerCase();
        const links = asset?.content?.links || {};
        const hasSocials = !!links.twitter || !!links.telegram || !!links.website || metadata.includes("http");

        // 2. Migration Check (PumpSwap/Raydium Graduation)
        // Note: Graduation par 'mutable' hamesha false ho jata hai
        const isGraduated = asset.mutable === false;

        if (isGraduated) {
            // 3. Developer Analysis
            const sigRes = await axios.post(HELIUS_RPC, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [creator, { limit: 100 }]
            }, { headers: HEADERS });
            
            const txs = sigRes.data.result || [];
            const age = txs.length > 1 ? ((txs[0].blockTime - txs[txs.length-1].blockTime) * 1000) / (1000 * 60 * 60 * 24) : 0;
            
            // Age criteria for Dumb Money style coins: Minimal but existing history
            if (age > 10 || txs.length > 15) { 
                return { success: true, age: age.toFixed(1), hasSocials };
            }
            return { success: false, reason: "New/Risky Developer" };
        }

        // Agar graduate nahi hua to 7 seconds baad phir check karo (Retry Logic)
        if (attempt < 5) {
            log(`   ⏳ Waiting for migration data: ${name}...`);
            await new Promise(r => setTimeout(r, 7000));
            return await forensicAudit(mint, creator, name, attempt + 1);
        }

        return { success: false, reason: "Graduation Timeout" };
    } catch (e) {
        log(`   ⚠️ Forensic Error: ${e.message}`);
        return { success: false };
    }
}

// ==================== MONITORING ENGINE ====================

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    
    ws.on('open', () => {
        log('📡 WebSocket Live - Tracking PumpSwap Graduates...');
        // Trade stream for marketcap and direct migration events
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" })); 
        ws.send(JSON.stringify({ "method": "subscribeRaydiumMigration" })); 
    });

    // Keeping Railway Alive with logs
    setInterval(() => log('💓 Heartbeat: v8.1 Scanning and Ready...'), 60000);

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (!event.mint || alertedMints.has(event.mint)) return;

            // Trigger points for PumpSwap/Raydium gems
            const isMigrationEvent = event.txType === "raydium_migration";
            const isHighCap = (event.marketCapSol || 0) >= 65;

            if (isMigrationEvent || isHighCap) {
                alertedMints.add(event.mint);
                log(`🔥 TARGET DETECTED: ${event.name} [Cap: ${event.marketCapSol?.toFixed(1) || 'Swapped'} SOL]`);

                const result = await forensicAudit(event.mint, event.traderPublicKey || event.user, event.name);
                
                if (result.success) {
                    const report = `🌟 **ELITE PUMPSWAP GRADUATE** 🛡️\n\n` +
                                   `🏷️ **Name:** ${event.name}\n` +
                                   `👴 **Dev Age:** ${result.age} days\n` +
                                   `✅ **Socials:** ${result.hasSocials ? 'Verified' : 'N/A'}\n\n` +
                                   `🛒 [Buy on PumpSwap](https://pumpswap.com/swap?outputCurrency=${event.mint})\n` +
                                   `📊 [DexScreener](https://dexscreener.com/solana/${event.mint})`;

                    await bot.sendMessage(TELEGRAM_CHAT_ID, report, { parse_mode: 'Markdown' });
                    log(`🚀 ALERT DISPATCHED: ${event.name}`);
                } else {
                    log(`   ❌ REJECT: ${result.reason || 'Safety criteria not met'}`);
                }
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        log('⚠️ Connection Lost. Reconnecting...');
        setTimeout(startRadar, 3000);
    });
}

// Ignition
startRadar();
