require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const WebSocket = require('ws');

// ==================== CONFIG ====================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const HELIUS_RPC = process.env.HELIUS_RPC;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const HEADERS = { 'Content-Type': 'application/json' };
const alertedMints = new Set();

// ==================== SIMPLE CACHE (IMPORTANT) ====================
const cache = new Map();

// ==================== RATE LIMITER (FIX 429) ====================
let lastRequest = 0;

async function rateLimit() {
    const now = Date.now();
    const diff = now - lastRequest;

    if (diff < 400) {
        await new Promise(res => setTimeout(res, 400 - diff));
    }

    lastRequest = Date.now();
}

// ==================== LOGS ====================
const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
const error = (msg) => console.error(`[${new Date().toLocaleTimeString()}] ❌ ${msg}`);

// ==================== HELPER REQUEST (SAFE WRAPPER) ====================
async function rpcCall(payload, retries = 2) {
    await rateLimit();

    try {
        const res = await axios.post(HELIUS_RPC, payload, {
            headers: HEADERS,
            timeout: 10000
        });

        return res.data;
    } catch (e) {
        if (retries > 0) {
            log(`🔁 Retry RPC...`);
            await new Promise(r => setTimeout(r, 800));
            return rpcCall(payload, retries - 1);
        }

        throw e;
    }
}

// ==================== ON-CHAIN DEV STATS ====================
async function getOnChainDevStats(wallet) {

    if (cache.has(wallet)) return cache.get(wallet);

    try {
        const sigRes = await rpcCall({
            jsonrpc: "2.0",
            id: 1,
            method: "getSignaturesForAddress",
            params: [wallet, { limit: 80 }]
        });

        const txs = sigRes.result || [];

        let tokenCreations = 0;
        let programSet = new Set();

        for (const tx of txs.slice(0, 40)) {

            try {
                const detail = await rpcCall({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "getTransaction",
                    params: [tx.signature, { encoding: "json" }]
                });

                const instructions = detail.result?.transaction?.message?.instructions || [];

                for (const ix of instructions) {
                    if (ix.programId) programSet.add(ix.programId);

                    if (
                        ix.parsed?.type === "initializeMint" ||
                        ix.parsed?.type === "createAccount"
                    ) {
                        tokenCreations++;
                    }
                }

            } catch {}
        }

        const result = {
            txCount: txs.length,
            tokenCreations,
            programDiversity: programSet.size
        };

        cache.set(wallet, result);
        return result;

    } catch (e) {
        error(`Dev Stats Error: ${e.message}`);

        return {
            txCount: 0,
            tokenCreations: 0,
            programDiversity: 0
        };
    }
}

// ==================== WARM WALLET CHECK ====================
async function checkWarmWallet(wallet) {

    try {
        const balanceRes = await rpcCall({
            jsonrpc: "2.0",
            id: 1,
            method: "getBalance",
            params: [wallet]
        });

        const balance = (balanceRes.result?.value || 0) / 1e9;

        const dev = await getOnChainDevStats(wallet);

        // SCORE SYSTEM
        let score = 0;

        if (dev.txCount > 200) score += 1;
        if (dev.tokenCreations >= 1) score += 2;
        if (dev.programDiversity > 3) score += 1;
        if (balance > 1) score += 1;

        if (dev.tokenCreations === 0) {
            return { warm: false, reason: "No token creation history" };
        }

        if (score <= 1) {
            return { warm: false, reason: "Low dev score" };
        }

        return {
            warm: true,
            balance,
            dev,
            score
        };

    } catch (e) {
        error(`Warm check error: ${e.message}`);
        return { warm: false };
    }
}

// ==================== TELEGRAM COMMAND ====================
bot.onText(/\/check (.+)/, async (msg, match) => {

    const chatId = msg.chat.id;
    const mint = match[1];

    try {

        const creator = mint; // fallback logic

        const result = await checkWarmWallet(creator);

        if (!result.warm) {
            return bot.sendMessage(chatId, `❌ Rejected: ${result.reason}`);
        }

        bot.sendMessage(chatId,
            `🔥 WARM DEV DETECTED\n\n` +
            `Score: ${result.score}\n` +
            `Balance: ${result.balance} SOL\n` +
            `TX: ${result.dev.txCount}\n` +
            `Creations: ${result.dev.tokenCreations}\n` +
            `Diversity: ${result.dev.programDiversity}`
        );

    } catch (e) {
        bot.sendMessage(chatId, `Error: ${e.message}`);
    }
});

// ==================== WS MONITOR ====================
function startWS() {

    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    ws.on('open', () => {
        ws.send(JSON.stringify({ method: "subscribeNewToken" }));
        log("WS connected");
    });

    ws.on('message', async (data) => {

        try {
            const event = JSON.parse(data);

            const mint = event.mint;
            const creator = event.traderPublicKey;

            if (!mint || alertedMints.has(mint)) return;
            alertedMints.add(mint);

            const result = await checkWarmWallet(creator);

            if (result.warm) {
                bot.sendMessage(TELEGRAM_CHAT_ID,
                    `🚀 NEW GOOD DEV TOKEN\nScore: ${result.score}\nMint: ${mint}`
                );
            }

        } catch {}
    });

    ws.on('close', () => {
        log("WS closed, reconnecting...");
        setTimeout(startWS, 5000);
    });
}

// ==================== START ====================
(function start() {
    console.clear();
    log("🚀 BOT STARTED (FIXED VERSION)");
    startWS();
})();
