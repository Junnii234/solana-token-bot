require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// ==================== CONFIG ====================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8006731872";
const HELIUS_RPC = process.env.HELIUS_RPC || `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const alertedMints = new Set();
const HEADERS = { 'Content-Type': 'application/json' };
const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

// ==================== IMPROVED FORENSIC ENGINE ====================

async function fullAudit(mint) {
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        }, { headers: HEADERS, timeout: 8000 });

        const asset = res.data.result;
        if (!asset) return null;

        // Metadata Audit (Crucial: Mutable MUST be false)
        const isImmutable = asset.mutable === false;
        const noFreeze = !asset.authorities?.some(a => a.scopes?.includes('freeze'));
        
        // Holder Audit
        const holders = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint]
        }, { headers: HEADERS, timeout: 5000 });

        const top1 = (holders.data.result?.value?.[0]?.amount || 0);
        const supply = asset.token_info?.supply || 1000000000 * 1e6;
        const isCleanDist = (top1 / supply) < 0.15; // 15% Cap

        return { 
            safe: isImmutable && noFreeze && isCleanDist, 
            name: asset.content?.metadata?.name || "Unknown",
            isImmutable, noFreeze, isCleanDist,
            creator: asset.authorities?.[0]?.address || asset.token_info?.mint_authority || null
        };
    } catch (e) { return null; }
}

async function devAudit(address) {
    try {
        if (!address) return { score: 0, age: 0, sol: 0, txs: 0 };

        // Fetching more transactions to find the true first one
        const [bal, txs] = await Promise.all([
            axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
            axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [address, { limit: 100 }] })
        ]);

        const sol = (bal.data.result?.value || 0) / 1e9;
        const history = txs.data.result || [];
        
        let ageDays = 0;
        if (history.length > 1) {
            const newest = history[0].blockTime;
            const oldest = history[history.length - 1].blockTime;
            ageDays = (newest - oldest) / 86400; // Time in days
            
            // If Helius only gives recent txs, we check if the wallet is fundamentally "old"
            // through a second check or simply by increasing the limit.
        }

        // --- SCORING SYSTEM (Based on your Warm Wallet Table) ---
        let score = 0;
        if (ageDays >= 30) score += 40; 
        else if (ageDays >= 7) score += 20;

        if (sol >= 1.5) score += 30; 
        else if (sol >= 0.5) score += 15;

        if (history.length >= 50) score += 30; 
        else if (history.length >= 10) score += 15;

        return { 
            score, 
            age: ageDays < 0.1 ? "New/Active" : `${ageDays.toFixed(1)} Days`, 
            sol: sol.toFixed(2), 
            txCount: history.length 
        };
    } catch (e) { return { score: 0, age: 0, sol: 0, txs: 0 }; }
}

// ==================== COMMANDS & RADAR ====================

bot.onText(/\/test (.+)/, async (msg, match) => {
    const testMint = match[1].trim();
    bot.sendMessage(msg.chat.id, `🧬 Analyzing Forensics for: \`${testMint}\`...`, { parse_mode: 'Markdown' });

    const audit = await fullAudit(testMint);
    if (!audit) return bot.sendMessage(msg.chat.id, "❌ RPC Error: Verify Address.");

    const dev = await devAudit(audit.creator);

    const report = `📊 **AUDIT RESULTS V11.5**\n\n` +
                   `🏷️ **Token:** ${audit.name}\n` +
                   `🛡️ **Security Check:**\n` +
                   `- Immutable (No Rug): ${audit.isImmutable ? '✅' : '❌'}\n` +
                   `- No Freeze Auth: ${audit.noFreeze ? '✅' : '❌'}\n` +
                   `- Holder Distribution: ${audit.isCleanDist ? '✅' : '❌'}\n\n` +
                   `👴 **Dev Forensic:**\n` +
                   `- Warmth Score: ${dev.score}/100\n` +
                   `- Wallet Age: ${dev.age}\n` +
                   `- Current Balance: ${dev.sol} SOL\n` +
                   `- Total Activity: ${dev.txCount} Txs\n\n` +
                   `🏁 **Status:** ${audit.safe && dev.score >= 30 ? "PASSED ✅" : "FAILED ❌"}`;

    bot.sendMessage(msg.chat.id, report);
});

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    ws.on('open', () => {
        log('📡 V11.5 FIXED RADAR ONLINE');
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" }));
    });
    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (!event.mint || alertedMints.has(event.mint)) return;
            const mc = event.marketCapSol || 0;
            if (mc >= 60) {
                alertedMints.add(event.mint);
                const [audit, dev] = await Promise.all([fullAudit(event.mint), devAudit(event.traderPublicKey || event.user)]);
                if (audit && audit.safe && dev.score >= 35) {
                    const msg = `🚀 **GEM DETECTED**\n\n${audit.name}\nMC: ${mc.toFixed(1)} SOL\nDev Score: ${dev.score}\n\n[DexScreener](https://dexscreener.com/solana/${event.mint})`;
                    bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown' });
                }
            }
        } catch (e) {}
    });
    ws.on('close', () => setTimeout(startRadar, 3000));
}

startRadar();
