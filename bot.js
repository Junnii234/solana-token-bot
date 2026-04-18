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

log('🚀 PUMPSWAP FINAL v6.7 - SYSTEM ONLINE');

// ==================== FORENSIC WITH AGGRESSIVE RETRY ====================

async function forensicAudit(mint, creator, name, attempt = 1) {
    try {
        log(`🔬 Audit Attempt ${attempt}/5: ${name}`);
        
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        }, { headers: HEADERS });
        
        const asset = res.data.result;
        if (!asset) {
            if (attempt < 5) {
                await new Promise(r => setTimeout(r, 10000));
                return await forensicAudit(mint, creator, name, attempt + 1);
            }
            return { success: false, reason: "Asset Not Found" };
        }

        // 1. Social Link Check (Crucial for Graduates)
        const metadata = (asset?.content?.metadata_description || "").toLowerCase();
        const links = asset?.content?.links || {};
        const hasSocials = !!links.twitter || !!links.telegram || !!links.website || metadata.includes("http");

        // 2. Graduation Confirmation (Mutable: false means it is on DEX)
        const isGraduated = asset.mutable === false;

        if (isGraduated) {
            // 3. Dev Wallet Age
            const sigRes = await axios.post(HELIUS_RPC, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [creator, { limit: 50 }]
            }, { headers: HEADERS });
            const txs = sigRes.data.result || [];
            const age = txs.length > 1 ? ((txs[0].blockTime - txs[txs.length-1].blockTime) * 1000) / (1000 * 60 * 60 * 24) : 0;
            
            // Age criteria: 30 days or highly active dev
            if (age > 30 || txs.length > 20) {
                return { success: true, age: age.toFixed(1), socials: hasSocials };
            }
            return { success: false, reason: "New Developer" };
        }

        // Agar graduate nahi hua ya data missing hai to retry
        if (attempt < 5) {
            log(`   ⏳ Data settling for ${name}... Waiting 10s`);
            await new Promise(r => setTimeout(r, 10000));
            return await forensicAudit(mint, creator, name, attempt + 1);
        }

        return { success: false, reason: "Not Graduated/No Socials" };
    } catch (e) {
        log(`   ⚠️ Audit Error: ${e.message}`);
        return { success: false };
    }
}

// ==================== MONITORING ENGINE ====================

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    
    ws.on('open', () => {
        log('📡 WebSocket Connected! Hunting for Graduates...');
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" })); 
    });

    // Heartbeat to keep Railway active
    setInterval(() => log('💓 Heartbeat: Scanner is alive and tracking...'), 60000);

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (!event.mint || alertedMints.has(event.mint)) return;

            const mcap = event.marketCapSol || 0;

            // TRACKING: Har barri trade par log dikhayega
            if (mcap >= 50 && mcap < 65) {
                if (Math.random() > 0.98) log(`📈 ON RADAR: ${event.name} is climbing (${mcap.toFixed(1)} SOL)`);
            }

            // TRIGGER: Jaise hi 65 SOL cross ho (Graduation Zone)
            if (mcap >= 65) {
                alertedMints.add(event.mint);
                log(`🔥 GRADUATION TRIGGER: ${event.name} reached ${mcap.toFixed(1)} SOL!`);

                const result = await forensicAudit(event.mint, event.traderPublicKey || event.user, event.name);
                
                if (result.success) {
                    const report = `🌟 **ELITE PUMPSWAP GRADUATE** 🛡️\n\n` +
                                   `🏷️ **Name:** ${event.name}\n` +
                                   `👴 **Dev Age:** ${result.age} days\n` +
                                   `✅ **Socials:** ${result.socials ? 'Verified' : 'None'}\n\n` +
                                   `🛒 [Buy on PumpSwap](https://pumpswap.com/swap?outputCurrency=${event.mint})\n` +
                                   `📊 [DexScreener](https://dexscreener.com/solana/${event.mint})`;

                    await bot.sendMessage(TELEGRAM_CHAT_ID, report, { parse_mode: 'Markdown' });
                    log(`🚀 ALERT DISPATCHED: ${event.name}`);
                } else {
                    log(`   ❌ REJECT: ${result.reason}`);
                }
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        log('⚠️ Connection lost. Reconnecting in 3s...');
        setTimeout(startRadar, 3000);
    });
}

// Start
startRadar();
