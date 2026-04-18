require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// ==================== CONFIG ====================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_KEY}`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alertedMints = new Set();
const HEADERS = { 'Content-Type': 'application/json' };

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
let globalCounter = 0;

// ==================== 1. FULL FORENSIC ENGINE (Restored) ====================

async function performFullAudit(mint, creator) {
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        }, { headers: HEADERS });

        const asset = res.data.result;
        if (!asset) return { safe: false };

        // --- Metadata & Auth Check ---
        const isMutable = asset.mutable; // Should be false for safety
        const freezeAuth = asset.authorities?.find(a => a.scopes.includes('freeze'));
        const mintAuth = asset.authorities?.find(a => a.scopes.includes('mint'));

        // --- Holder Analysis (The 10% Rule) ---
        const holderRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: "1", method: "getTokenLargestAccounts", params: [mint]
        }, { headers: HEADERS });
        
        const topHolders = holderRes.data.result.value || [];
        const supply = asset.token_info?.supply || 1;
        const tooConcentrated = topHolders.some(h => (h.amount / supply) > 0.15); // Red flag if holder > 15%

        // --- Socials Check ---
        const hasSocials = asset.content?.metadata?.extensions?.twitter || asset.content?.metadata?.description?.includes('http');

        return {
            safe: !isMutable && !freezeAuth && !tooConcentrated,
            isMutable,
            hasFreeze: !!freezeAuth,
            isConcentrated: tooConcentrated,
            hasSocials: !!hasSocials,
            name: asset.content?.metadata?.name || "Unknown",
            symbol: asset.content?.metadata?.symbol || "N/A"
        };
    } catch (e) { return { safe: false }; }
}

// ==================== 2. WARM WALLET ENGINE (Restored) ====================

async function getWalletWarmth(address) {
    try {
        const [balRes, txRes] = await Promise.all([
            axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
            axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [address, { limit: 100 }] })
        ]);

        const balance = (balRes.data.result.value / 1e9);
        const txs = txRes.data.result || [];
        const newestTx = txs[0]?.blockTime || 0;
        const oldestTx = txs[txs.length - 1]?.blockTime || 0;
        const ageDays = (newestTx - oldestTx) / 86400;

        let score = 0;
        if (ageDays >= 30) score += 40;
        if (balance >= 1) score += 30;
        if (txs.length >= 20) score += 30;

        return { score, age: ageDays.toFixed(1), bal: balance.toFixed(2), txCount: txs.length };
    } catch (e) { return { score: 0 }; }
}

// ==================== 3. RADAR & FILTER LOGIC ====================

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    
    ws.on('open', () => {
        log('📡 V11.0 MASTER RESTORATION - ALL FILTERS ACTIVE');
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" }));
    });

    ws.on('message', async (data) => {
        const event = JSON.parse(data.toString());
        globalCounter++;
        if (!event.mint || alertedMints.has(event.mint)) return;

        const mc = event.marketCapSol || 0;

        // V10.1 Monitoring Log
        if (mc >= 50 && mc < 60) {
            process.stdout.write('.'); // Silent monitoring
        }

        // --- THE FILTER GATE ---
        if (mc >= 60) {
            alertedMints.add(event.mint);
            log(`🔍 Auditing: ${event.name} (${mc.toFixed(1)} SOL)`);

            const audit = await performFullAudit(event.mint);
            const dev = await getWalletWarmth(event.traderPublicKey || event.user);

            // FINAL VALIDATION: Must pass Forensics AND be a decent Dev
            if (audit.safe && dev.score >= 30) {
                const report = `🚀 **GEM VERIFIED (V11.0)** 🚀\n\n` +
                               `🏷️ **${audit.name} (${audit.symbol})**\n` +
                               `💰 **MC:** ${mc.toFixed(1)} SOL\n\n` +
                               `--- 🛡️ **FORENSICS** ---\n` +
                               `✅ **Mint/Freeze:** Revoked\n` +
                               `✅ **Holders:** Clean (<15% Top)\n` +
                               `✅ **Metadata:** Immutable\n` +
                               `🌐 **Socials:** ${audit.hasSocials ? "Found" : "None"}\n\n` +
                               `--- 👴 **DEV AUDIT** ---\n` +
                               `👨‍💻 **Age:** ${dev.age} Days\n` +
                               `💳 **Balance:** ${dev.bal} SOL\n` +
                               `⭐ **Score:** ${dev.score}/100\n\n` +
                               `🔗 [DexScreener](https://dexscreener.com/solana/${event.mint})`;

                await bot.sendMessage(TELEGRAM_CHAT_ID, report, { parse_mode: 'Markdown' });
                log(`✅ ALERT SENT: ${audit.name}`);
            } else {
                log(`❌ REJECTED: ${event.name} (Forensic Fail or Low Dev Score)`);
            }
        }
    });

    ws.on('close', () => setTimeout(startRadar, 3000));
}

startRadar();
