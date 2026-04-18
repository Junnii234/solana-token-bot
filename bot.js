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

// ==================== ENHANCED FETCH LOGIC ====================

async function fullAudit(mint) {
    try {
        // Method 1: Try DAS API (getAsset)
        let res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        }, { headers: HEADERS, timeout: 7000 });

        let asset = res.data.result;

        // Method 2 Fallback: Agar getAsset fail ho jaye (Pump.fun issue)
        if (!asset) {
            log(`⚠️ getAsset failed for ${mint.slice(0,5)}, trying fallback...`);
            const fallback = await axios.post(HELIUS_RPC, {
                jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [mint, { encoding: "jsonParsed" }]
            }, { headers: HEADERS });
            if (!fallback.data.result) return null;
            // Basic data for fallback
            asset = { 
                mutable: true, // assume risky if DAS fails
                content: { metadata: { name: "Unknown (Fallback)" } },
                authorities: [] 
            };
        }

        const isImmutable = asset.mutable === false;
        const noFreeze = !asset.authorities?.some(a => a.scopes?.includes('freeze'));
        
        // Token Supply & Holders
        const holders = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint]
        }, { headers: HEADERS, timeout: 5000 });

        const top1 = holders.data.result?.value?.[0]?.amount || 0;
        const supply = asset.token_info?.supply || 1000000000000000; // Default large supply
        const isCleanDist = (top1 / supply) < 0.20; // 20% limit for safer testing

        return { 
            safe: isImmutable && noFreeze && isCleanDist, 
            name: asset.content?.metadata?.name || "Token",
            isImmutable, noFreeze, isCleanDist,
            creator: asset.authorities?.[0]?.address || asset.token_info?.mint_authority || null
        };
    } catch (e) {
        log(`❌ Audit Error: ${e.message}`);
        return null;
    }
}

async function devAudit(address) {
    try {
        if (!address) return { score: 0, age: 0, sol: 0, txs: 0 };
        const [bal, txs] = await Promise.all([
            axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
            axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [address, { limit: 50 }] })
        ]);

        const sol = (bal.data.result?.value || 0) / 1e9;
        const history = txs.data.result || [];
        const age = history.length > 1 ? (history[0].blockTime - history[history.length-1].blockTime) / 86400 : 0;

        let score = 0;
        if (age >= 14) score += 40; if (sol >= 0.2) score += 30; if (history.length >= 10) score += 30;

        return { score, age: age.toFixed(1), sol: sol.toFixed(2), txs: history.length };
    } catch (e) { return { score: 0, age: 0, sol: 0, txs: 0 }; }
}

// ==================== COMMANDS ====================

bot.onText(/\/test (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const testMint = match[1].trim();
    
    bot.sendMessage(chatId, `⏳ Fetching data for \`${testMint}\`...`, { parse_mode: 'Markdown' });

    const audit = await fullAudit(testMint);
    if (!audit) {
        return bot.sendMessage(chatId, "❌ Error: Could not reach Solana RPC or Mint is invalid. Check Helius Key.");
    }

    const dev = await devAudit(audit.creator);

    const report = `📊 **AUDIT RESULTS**\n\n` +
                   `🏷️ **Token:** ${audit.name}\n` +
                   `🛡️ **Security:**\n` +
                   `- Immutable: ${audit.isImmutable ? '✅' : '❌'}\n` +
                   `- No Freeze: ${audit.noFreeze ? '✅' : '❌'}\n` +
                   `- Top Holder Check: ${audit.isCleanDist ? '✅' : '❌'}\n\n` +
                   `👴 **Dev Quality:** ${dev.score}/100\n` +
                   `- Age: ${dev.age} Days\n` +
                   `- Balance: ${dev.sol} SOL\n\n` +
                   `🏁 **Status:** ${audit.safe && dev.score >= 30 ? "PASSED ✅" : "FAILED ❌"}`;

    bot.sendMessage(chatId, report);
});

// ==================== RADAR ====================

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    
    ws.on('open', () => {
        log('📡 V11.3 Scanner Online | Use /test [mint]');
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
                if (audit && audit.safe && dev.score >= 30) {
                    bot.sendMessage(TELEGRAM_CHAT_ID, `🚀 **NEW GEM**\n\n${audit.name}\nMC: ${mc.toFixed(1)} SOL\nScore: ${dev.score}/100\n\n[DexScreener](https://dexscreener.com/solana/${event.mint})`, { parse_mode: 'Markdown' });
                }
            }
        } catch (e) {}
    });

    ws.on('close', () => setTimeout(startRadar, 3000));
}

startRadar();
