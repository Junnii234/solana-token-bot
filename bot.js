require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// ==================== CONFIG ====================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8006731872";
const HELIUS_RPC = process.env.HELIUS_RPC || `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true }); // Polling TRUE for commands
const alertedMints = new Set();
const HEADERS = { 'Content-Type': 'application/json' };

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
let globalCounter = 0;

// ==================== CORE AUDIT FUNCTIONS ====================

async function fullAudit(mint) {
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        }, { headers: HEADERS, timeout: 5000 });

        const asset = res.data.result;
        if (!asset) return null;

        const isImmutable = asset.mutable === false;
        const noFreeze = !asset.authorities?.some(a => a.scopes.includes('freeze'));
        
        const holders = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint]
        }, { headers: HEADERS, timeout: 5000 });

        const top1 = holders.data.result.value[0]?.amount || 0;
        const supply = asset.token_info?.supply || 1;
        const isCleanDist = (top1 / supply) < 0.15;

        return { 
            safe: isImmutable && noFreeze && isCleanDist, 
            name: asset.content?.metadata?.name || "Token",
            isImmutable, noFreeze, isCleanDist,
            creator: asset.authorities?.[0]?.address || null
        };
    } catch (e) { return null; }
}

async function devAudit(address) {
    try {
        if (!address) return { score: 0 };
        const [bal, txs] = await Promise.all([
            axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
            axios.post(HELIUS_RPC, { jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [address, { limit: 50 }] })
        ]);

        const sol = bal.data.result.value / 1e9;
        const history = txs.data.result || [];
        const age = history.length > 1 ? (history[0].blockTime - history[history.length-1].blockTime) / 86400 : 0;

        let score = 0;
        if (age >= 30) score += 40; if (sol >= 0.5) score += 30; if (history.length >= 20) score += 30;

        return { score, age: age.toFixed(1), sol: sol.toFixed(2), txs: history.length };
    } catch (e) { return { score: 0 }; }
}

// ==================== /TEST COMMAND LOGIC ====================

bot.onText(/\/test (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const testMint = match[1].trim();
    
    bot.sendMessage(chatId, `🔍 Manual Audit Started for: \`${testMint}\`...`, { parse_mode: 'Markdown' });

    const audit = await fullAudit(testMint);
    if (!audit) return bot.sendMessage(chatId, "❌ Error: Could not fetch mint data. Check address/RPC.");

    const dev = await devAudit(audit.creator);

    const report = `🧪 **TEST AUDIT REPORT**\n\n` +
                   `🏷️ **Token:** ${audit.name}\n` +
                   `🛡️ **Forensics:**\n` +
                   `- Immutable: ${audit.isImmutable ? '✅' : '❌'}\n` +
                   `- No Freeze: ${audit.noFreeze ? '✅' : '❌'}\n` +
                   `- Top Holder <15%: ${audit.isCleanDist ? '✅' : '❌'}\n\n` +
                   `👴 **Dev Score:** ${dev.score}/100\n` +
                   `- Age: ${dev.age} Days\n` +
                   `- Balance: ${dev.sol} SOL\n\n` +
                   `🏁 **Result:** ${audit.safe && dev.score >= 30 ? "PASSED ✅" : "FAILED ❌"}`;

    bot.sendMessage(chatId, report);
});

// ==================== RADAR ENGINE ====================

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    
    ws.on('open', () => {
        log('📡 V11.2 LIVE - Use /test [mint] in Telegram to verify');
        ws.send(JSON.stringify({ "method": "subscribeTokenTrade" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            globalCounter++;
            if (!event.mint || alertedMints.has(event.mint)) return;

            const mc = event.marketCapSol || 0;

            if (mc >= 60) {
                alertedMints.add(event.mint);
                const [audit, dev] = await Promise.all([
                    fullAudit(event.mint), 
                    devAudit(event.traderPublicKey || event.user)
                ]);

                if (audit && audit.safe && dev.score >= 30) {
                    const msg = `🚀 **GEM DETECTED (V11.2)**\n\n` +
                                `🏷️ **${audit.name}**\n` +
                                `💰 **MC:** ${mc.toFixed(1)} SOL\n\n` +
                                `🛡️ Score: ${dev.score}/100 | Age: ${dev.age}d\n` +
                                `🔗 [DexScreener](https://dexscreener.com/solana/${event.mint})`;

                    await bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown' });
                }
            }
        } catch (e) {}
    });

    ws.on('close', () => setTimeout(startRadar, 3000));
}

startRadar();
setInterval(() => log(`💓 Scanned: ${globalCounter}`), 60000);
