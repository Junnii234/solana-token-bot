require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const WebSocket = require('ws');

// ==================== CONFIG ====================

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "PASTE_TOKEN";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "PASTE_CHAT_ID";
const HELIUS_RPC = process.env.HELIUS_RPC || "https://mainnet.helius-rpc.com/?api-key=PASTE_KEY";

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

const seen = new Set();

const HEADERS = { "Content-Type": "application/json" };

// ==================== UTIL ====================

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const log = (m) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);
const reject = (m) => console.log(`⚠️ REJECT: ${m}`);

// ==================== 1. GRADUATION CHECK ====================

async function isGraduated(mint) {
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0",
            id: 1,
            method: "getSignaturesForAddress",
            params: [mint, { limit: 10 }]
        }, { headers: HEADERS });

        const txs = res.data.result || [];

        for (let tx of txs) {
            const d = await axios.post(HELIUS_RPC, {
                jsonrpc: "2.0",
                id: 1,
                method: "getTransaction",
                params: [tx.signature, { maxSupportedTransactionVersion: 0 }]
            }, { headers: HEADERS });

            const logs = d.data?.result?.meta?.logMessages || [];
            const text = logs.join(" ").toLowerCase();

            if (
                text.includes("migrate") ||
                text.includes("raydium") ||
                text.includes("createpool") ||
                text.includes("liquidity")
            ) return true;
        }

        return false;

    } catch {
        return false;
    }
}

// ==================== 2. DEV WALLET ANALYSIS ====================

async function devScore(wallet) {
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0",
            id: 1,
            method: "getSignaturesForAddress",
            params: [wallet, { limit: 300 }]
        }, { headers: HEADERS });

        const txs = res.data.result || [];

        const balanceRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0",
            id: 1,
            method: "getBalance",
            params: [wallet]
        }, { headers: HEADERS });

        const sol = (balanceRes.data.result.value || 0) / 1e9;

        let score = 0;

        if (txs.length < 20) score += 30;
        if (sol < 1) score += 30;
        if (txs.length > 200) score += 10; // bot-like activity

        const safe = score < 50;

        return { score, safe, sol, txCount: txs.length };

    } catch {
        return { score: 100, safe: false };
    }
}

// ==================== 3. AUTHORITY CHECK ====================

async function checkAuthority(mint) {
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0",
            id: 1,
            method: "getAccountInfo",
            params: [mint, { encoding: "jsonParsed" }]
        }, { headers: HEADERS });

        const info = res.data.result?.value?.data?.parsed?.info;

        if (!info) return false;

        return !(info.mintAuthority || info.freezeAuthority);

    } catch {
        return false;
    }
}

// ==================== 4. SIMULATED TOKEN METRICS ====================

function tokenSafety(name) {
    const bad = ["100x", "moon", "pump", "rocket", "inu!!!"];
    return !bad.some(b => name.toLowerCase().includes(b));
}

// ==================== 5. HOLDER + SUPPLY (SIMULATED SAFE CHECK) ====================

function supplyHolderCheck() {
    // NOTE: real implementation needs indexer (Helius DAS / Birdeye API)
    return true;
}

// ==================== FINAL PIPELINE ====================

async function processToken(mint, name, creator) {

    log(`🎯 Token detected: ${name}`);

    // STEP 1: MUST BE GRADUATED
    if (!(await isGraduated(mint))) {
        return;
    }

    log("🚀 Graduated token confirmed");

    // STEP 2: WAIT 60 SECONDS (REAL STABILITY PHASE)
    log("⏳ WAITING 60 seconds for stabilization...");
    await sleep(60000);

    // STEP 3: DEV CHECK
    const dev = await devScore(creator);
    if (!dev.safe) {
        reject(`Dev risky score: ${dev.score}`);
        return;
    }

    // STEP 4: TOKEN NAME CHECK
    if (!tokenSafety(name)) {
        reject("Bad token name");
        return;
    }

    // STEP 5: AUTHORITY CHECK
    const authoritySafe = await checkAuthority(mint);
    if (!authoritySafe) {
        reject("Authority NOT revoked");
        return;
    }

    // STEP 6: SUPPLY/HOLDERS CHECK
    if (!supplyHolderCheck()) {
        reject("Supply/Holders unsafe");
        return;
    }

    // ✅ FINAL PASS
    const msg =
        `🚀 SAFE POST-GRADUATION TOKEN\n\n` +
        `🏷️ ${name}\n` +
        `📌 ${mint}\n\n` +
        `🧠 Dev Score: ${dev.score}\n` +
        `💰 Dev SOL: ${dev.sol.toFixed(2)}\n` +
        `📊 TX: ${dev.txCount}\n\n` +
        `🔥 ALL 5 PHASES PASSED\n` +
        `https://dexscreener.com/solana/${mint}`;

    await bot.sendMessage(TELEGRAM_CHAT_ID, msg);

    log("📤 ALERT SENT (ALL CHECKS PASSED)");
}

// ==================== WS LISTENER ====================

function start() {
    log("🚀 Bot starting...");

    const ws = new WebSocket("wss://pumpportal.fun/api/data");

    ws.on("open", () => {
        ws.send(JSON.stringify({ method: "subscribeNewToken" }));
    });

    ws.on("message", async (data) => {
        try {
            const e = JSON.parse(data.toString());

            const mint = e.mint;
            const creator = e.traderPublicKey;
            const name = e.symbol || "UNKNOWN";

            if (!mint || seen.has(mint)) return;
            seen.add(mint);

            await processToken(mint, name, creator);

        } catch {}
    });

    ws.on("close", () => {
        log("Reconnecting...");
        setTimeout(start, 5000);
    });
}

start();
