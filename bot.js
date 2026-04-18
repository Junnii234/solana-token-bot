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
let globalCounter = 0;

// ==================== WARM WALLET DETECTION ENGINE ====================

async function getWalletWarmth(address) {
    try {
        // Fetch Balance and Signatures in parallel
        const [balRes, txRes] = await Promise.all([
            axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
            axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [address, { limit: 100 }] })
        ]);

        const balance = (balRes.data.result.value / 1e9); 
        const txs = txRes.data.result || [];
        
        if (txs.length === 0) return { score: 0, status: "Scammer (Empty)", age: 0, bal: 0, fail: 0, txCount: 0 };

        // Calculate Age
        const newestTx = txs[0].blockTime;
        const oldestTx = txs[txs.length - 1].blockTime;
        const ageDays = (newestTx - oldestTx) / 86400;
        
        // Calculate Failure Rate
        const failures = txs.filter(t => t.err !== null).length;
        const failRate = (failures / txs.length) * 100;

        // --- SCORING LOGIC ---
        let score = 0;
        if (ageDays >= 90) score += 40; 
        else if (ageDays >= 30) score += 20;
        else if (ageDays >= 7) score += 10;

        if (balance >= 2) score += 30; 
        else if (balance >= 0.5) score += 10;

        if (txs.length >= 50) score += 20;
        if (failRate < 10) score += 10;

        // Status Tagging
        let status = "Scammer";
        if (score >= 70) status = "Real Dev (Safe)";
        else if (score >= 40) status = "Warm (Fair)";
        else if (score >= 20) status = "High Risk";

        return {
            score, status, age: ageDays.toFixed(1),
            bal: balance.toFixed(2), fail: failRate.toFixed(0), txCount: txs.length
        };
    } catch (e) {
        return { score: 0, status: "Audit Failed", age: 0, bal: 0, fail: 0, txCount: 0 };
    }
}

// ==================== GRADUATION CHECK ====================

async function isGraduated(mint) {
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        }, { headers: HEADERS });
        // Pump.fun graduation means Mint Authority is revoked and Mutable is false
        return res.data.result?.mutable === false;
    } catch (e) { return false; }
}

// ==================== RADAR: MONITORING & AUDIT ====================

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    
    ws.on('open', () => {
        log('📡 V10.6 "Ultimate Sniper" Connected!');
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" }));
        ws.send(JSON.stringify({ "method": "subscribeAccountTrade" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            globalCounter++;
            if (!event.mint) return;

            const mc = event.marketCapSol || 0;

            // 👁️ V10.1 Style Monitoring Log (Console Only)
            if (mc >= 55 && mc < 60 && !alertedMints.has(event.mint)) {
                log(`👀 MONITORING: ${event.name || 'Token'} | Cap: ${mc.toFixed(1)} SOL (Closing in...)`);
            }

            // 🔥 AUDIT & ALERT ZONE (60 SOL+)
            if (mc >= 60 && !alertedMints.has(event.mint)) {
                alertedMints.add(event.mint);
                log(`🔥 TARGET: ${event.name} at ${mc.toFixed(1)} SOL. Verifying Pool...`);

                // 2s Delay for blockchain sync
                await new Promise(r => setTimeout(r, 2500));

                if (await isGraduated(event.mint)) {
                    // Start Warm Wallet Forensic
                    const dev = await getWalletWarmth(event.traderPublicKey || event.user);
                    
                    // Logic: Only alert if Dev Score is decent (>= 40)
                    if (dev.score >= 40) {
                        const message = `🌟 **GEM GRADUATED (Warm Wallet)** 🌟\n\n` +
                                        `🏷️ **Token:** ${event.name} (${event.symbol || 'N/A'})\n` +
                                        `💰 **Market Cap:** ${mc.toFixed(1)} SOL\n` +
                                        `🛡️ **Dev Rating:** ${dev.status} (${dev.score}/100)\n\n` +
                                        `--- 📊 **Developer Forensic** ---\n` +
                                        `📅 **Wallet Age:** ${dev.age} Days\n` +
                                        `💳 **Balance:** ${dev.bal} SOL\n` +
                                        `📈 **History:** ${dev.txCount} Txs\n` +
                                        `❌ **Fail Rate:** ${dev.fail}%\n\n` +
                                        `🔗 [DexScreener](https://dexscreener.com/solana/${event.mint})\n` +
                                        `🔗 [Photon](https://photon-sol.tinyastro.io/en/lp/${event.mint})`;

                        await bot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
                        log(`🚀 ALERT SENT: ${event.name} (Score: ${dev.score})`);
                    } else {
                        log(`⚠️ SKIP: ${event.name} - Scammer Wallet Detected (Score: ${dev.score})`);
                    }
                } else {
                    log(`⏳ PENDING: ${event.name} reached MC but not yet on DEX.`);
                }
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        log('⚠️ Connection lost. Reconnecting...');
        setTimeout(startRadar, 3000);
    });
}

// Startup Output
console.clear();
console.log('=======================================');
console.log('   V10.6 ULTIMATE SNIPER LOADED        ');
console.log('   MONITORING + WARM WALLET AUDIT      ');
console.log('=======================================');
startRadar();

// Heartbeat Stats every 1 min
setInterval(() => log(`💓 Live Stats: ${globalCounter} events scanned. Scanner healthy.`), 60000);
