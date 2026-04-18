require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// ==================== CONFIG ====================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const HELIUS_RPC = process.env.HELIUS_RPC;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const alertedMints = new Set();
const HEADERS = { 'Content-Type': 'application/json' };

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

// ==================== HELPERS ====================
const cleanMint = (mint) => mint.replace('pump', '');

// ==================== AUDIT ====================
async function fullAudit(rawMint) {
    const mint = cleanMint(rawMint);

    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0",
            id: 1,
            method: "getAsset",
            params: { id: mint }
        }, { headers: HEADERS, timeout: 8000 });

        const asset = res.data.result;

        // 🔁 Fallback for SPL tokens
        if (!asset) {
            return {
                safe: false,
                name: "SPL Token",
                isImmutable: false,
                noFreeze: false,
                isCleanDist: false,
                creator: null
            };
        }

        const isImmutable = asset.mutable === false;

        const noFreeze =
            !asset.authorities?.some(a => a.scopes?.includes('freeze')) &&
            asset.token_info?.freeze_authority === null;

        const holders = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0",
            id: 1,
            method: "getTokenLargestAccounts",
            params: [mint]
        }, { headers: HEADERS });

        const top1 = parseFloat(holders.data.result?.value?.[0]?.amount || 0);
        const supply = parseFloat(asset.token_info?.supply || 1);

        const isCleanDist = (top1 / supply) < 0.20;

        return {
            safe: isImmutable && noFreeze && isCleanDist,
            name: asset.content?.metadata?.name || "Unknown",
            isImmutable,
            noFreeze,
            isCleanDist,
            creator: asset.token_info?.mint_authority || null
        };

    } catch (e) {
        log("Audit Error: " + e.message);
        return null;
    }
}

// ==================== DEV AUDIT ====================
async function devAudit(address) {
    try {
        if (!address) {
            return { score: 10, age: "New", sol: "0.00", txCount: 0 };
        }

        const [bal, txs] = await Promise.all([
            axios.post(HELIUS_RPC, {
                jsonrpc: "2.0",
                id: 1,
                method: "getBalance",
                params: [address]
            }),
            axios.post(HELIUS_RPC, {
                jsonrpc: "2.0",
                id: 1,
                method: "getSignaturesForAddress",
                params: [address, { limit: 50 }]
            })
        ]);

        const sol = (bal.data.result?.value || 0) / 1e9;
        const history = txs.data.result || [];
        const count = history.length;

        let score = 0;
        let ageStr = "Fresh";

        if (count > 1) {
            const newest = history[0].blockTime;
            const oldest = history[count - 1].blockTime;
            const ageDays = (newest - oldest) / 86400;

            ageStr = ageDays.toFixed(2) + " days";

            if (ageDays >= 7) score += 20;
            if (sol >= 0.2) score += 20;
            if (count >= 10) score += 20;
        }

        return {
            score,
            age: ageStr,
            sol: sol.toFixed(2),
            txCount: count
        };

    } catch (e) {
        return { score: 0, age: "Error", sol: "0.00", txCount: 0 };
    }
}

// ==================== TEST COMMAND ====================
bot.onText(/\/test (.+)/, async (msg, match) => {
    const rawMint = match[1].trim();
    const mint = cleanMint(rawMint);

    bot.sendMessage(msg.chat.id, `🧬 Testing: ${mint}`);

    const audit = await fullAudit(mint);
    if (!audit) return bot.sendMessage(msg.chat.id, "❌ RPC Error");

    const dev = await devAudit(audit.creator || mint);

    const status = (audit.isCleanDist && dev.score >= 20) ? "PASSED ✅" : "FAILED ❌";

    const report =
`📊 AUDIT

Token: ${audit.name}

Security:
Immutable: ${audit.isImmutable ? '✅' : '❌'}
No Freeze: ${audit.noFreeze ? '✅' : '❌'}
Distribution: ${audit.isCleanDist ? '✅' : '❌'}

Dev:
Score: ${dev.score}/100
Age: ${dev.age}
Balance: ${dev.sol} SOL
Txs: ${dev.txCount}

Status: ${status}`;

    bot.sendMessage(msg.chat.id, report);
});

// ==================== RADAR ====================
function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    ws.on('open', () => {
        log('📡 Radar Started...');
        ws.send(JSON.stringify({ method: "subscribeTokenTrade" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());

            if (!event.mint) return;

            const mint = cleanMint(event.mint);

            if (alertedMints.has(mint)) return;

            const mc = event.marketCapSol || 0;

            if (mc >= 60) {
                alertedMints.add(mint);

                const [audit, dev] = await Promise.all([
                    fullAudit(mint),
                    devAudit(event.traderPublicKey || event.user)
                ]);

                console.log("Mint:", mint);
                console.log("Audit:", audit);
                console.log("Dev:", dev);

                if (audit && audit.isCleanDist && dev.score >= 20) {
                    bot.sendMessage(TELEGRAM_CHAT_ID,
`🚀 GEM

${audit.name}
MC: ${mc.toFixed(1)} SOL
Score: ${dev.score}/100

https://dexscreener.com/solana/${mint}`);
                }
            }

        } catch (e) {}
    });

    ws.on('close', () => {
        log("Reconnecting...");
        setTimeout(startRadar, 3000);
    });
}

startRadar();
