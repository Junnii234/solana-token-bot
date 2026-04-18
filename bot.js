require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// ================= CONFIG =================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const HELIUS_RPC = process.env.HELIUS_RPC;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const seen = new Set();
const devTracker = {};

const log = (m) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);
const cleanMint = (m) => m.replace('pump', '');

// ================= DEX =================
async function getDex(mint) {
    try {
        const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
        return res.data.pairs?.[0] || null;
    } catch {
        return null;
    }
}

// ================= DEV AUDIT =================
async function devAudit(address) {
    try {
        if (!address) {
            return { score: 0, age: "Unknown", sol: "0.00", txCount: 0, status: "Scammer ❌" };
        }

        const [bal, txs] = await Promise.all([
            axios.post(HELIUS, {
                jsonrpc: "2.0",
                id: 1,
                method: "getBalance",
                params: [address]
            }),
            axios.post(HELIUS, {
                jsonrpc: "2.0",
                id: 1,
                method: "getSignaturesForAddress",
                params: [address, { limit: 100 }]
            })
        ]);

        const sol = (bal.data.result?.value || 0) / 1e9;
        const history = txs.data.result || [];
        const count = history.length;

        let score = 0;
        let ageDays = 0;
        let ageStr = "Fresh";

        if (count > 1) {
            const newest = history[0].blockTime;
            const oldest = history[count - 1].blockTime;
            ageDays = (newest - oldest) / 86400;
            ageStr = ageDays.toFixed(1) + " days";

            if (ageDays >= 90) score += 30;
            else if (ageDays >= 30) score += 20;
            else if (ageDays >= 7) score += 10;
        }

        if (sol >= 2) score += 25;
        else if (sol >= 0.5) score += 15;
        else if (sol >= 0.1) score += 5;

        if (count >= 100) score += 25;
        else if (count >= 50) score += 15;
        else if (count >= 10) score += 10;

        let rapidTx = 0;
        for (let i = 1; i < history.length; i++) {
            if (history[i - 1].blockTime - history[i].blockTime < 5) {
                rapidTx++;
            }
        }

        const botLike = rapidTx > 20;

        if (!botLike) score += 20;
        else score -= 10;

        let status = "Scammer ❌";
        if (score >= 70) status = "Strong Dev 🟢";
        else if (score >= 40) status = "Decent 🟡";
        else if (score >= 20) status = "Risky 🟠";

        return {
            score,
            age: ageStr,
            sol: sol.toFixed(2),
            txCount: count,
            status
        };

    } catch {
        return { score: 0, age: "Error", sol: "0.00", txCount: 0, status: "Error ❌" };
    }
}

// ================= DEV TRACK =================
function trackDev(wallet) {
    if (!wallet) return 0;

    if (!devTracker[wallet]) {
        devTracker[wallet] = { count: 0 };
    }

    devTracker[wallet].count++;
    return devTracker[wallet].count;
}

// ================= ANALYZE (DEBUG ENGINE) =================
function analyzeToken(dex, dev, devBuys) {
    const reasons = [];
    let score = 0;

    const liq = dex.liquidity?.usd || 0;
    const vol = dex.volume?.m5 || 0;
    const mc = dex.fdv || 0;

    if (liq > 5000) score += 25;
    else reasons.push(`Low Liquidity ($${Math.floor(liq)})`);

    if (liq > 15000) score += 15;

    if (vol > 2000) score += 20;
    else reasons.push(`Low Volume ($${Math.floor(vol)})`);

    if (vol > 10000) score += 20;

    if (mc < 100000) score += 15;
    else reasons.push(`High MC ($${Math.floor(mc)})`);

    if (dev.score >= 40) score += 20;
    else reasons.push(`Weak Dev (${dev.score})`);

    if (dev.score >= 70) score += 10;

    if (devBuys >= 2) score += 10;
    else reasons.push(`Low Dev Buys (${devBuys})`);

    if (devBuys >= 4) score += 15;

    return { score, reasons, liq, vol, mc };
}

// ================= ALERT =================
function formatAlert(dex, mint, score, dev, devBuys) {
    return `
🚀 *JUNNI X GEM ALERT*

💎 *${dex.baseToken.name}*
━━━━━━━━━━━━━━━━━━
💰 MC: *$${Math.floor(dex.fdv || 0)}*
💧 Liquidity: *$${Math.floor(dex.liquidity?.usd || 0)}*
📊 Volume (5m): *$${Math.floor(dex.volume?.m5 || 0)}*

👴 Dev Score: *${dev.score}/100*
📅 Age: *${dev.age}*
💼 Balance: *${dev.sol} SOL*
📈 Txs: *${dev.txCount}*
🔥 Status: *${dev.status}*

⚡ Dev Buys: *${devBuys}*
⭐ Score: *${score}/100*

🔗 https://dexscreener.com/solana/${mint}
`;
}

// ================= RADAR =================
function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    ws.on('open', () => {
        log("🚀 SNIPER LIVE...");
        ws.send(JSON.stringify({ method: "subscribeTokenTrade" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (!event.mint) return;

            const mint = cleanMint(event.mint);
            if (seen.has(mint)) return;

            const devWallet = event.traderPublicKey || event.user;
            const devBuys = trackDev(devWallet);

            const dex = await getDex(mint);
            if (!dex) return;

            const dev = await devAudit(devWallet);
            const { score, reasons, liq, vol, mc } = analyzeToken(dex, dev, devBuys);

            // 🔥 DEBUG LOG
            console.log(`
----------------------------
Token: ${dex.baseToken.name}
MC: $${Math.floor(mc)}
Liq: $${Math.floor(liq)}
Vol5m: $${Math.floor(vol)}
Dev Score: ${dev.score}
Dev Buys: ${devBuys}
Final Score: ${score}

${score >= 60 ? "✅ ACCEPTED" : "❌ REJECTED"}
${reasons.length ? "Reasons: " + reasons.join(", ") : ""}
----------------------------
`);

            if (score >= 60 && liq > 5000) {
                seen.add(mint);

                const msg = formatAlert(dex, mint, score, dev, devBuys);
                bot.sendMessage(CHAT_ID, msg, { parse_mode: "Markdown" });
            }

        } catch {}
    });

    ws.on('close', () => {
        log("Reconnecting...");
        setTimeout(startRadar, 2000);
    });
}

startRadar();

// ================= TEST =================
bot.onText(/\/ping/, (msg) => {
    bot.sendMessage(msg.chat.id, "✅ Bot Running");
});
