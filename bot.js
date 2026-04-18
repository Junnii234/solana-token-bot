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

// ==================== LOGS ====================

const log = (m) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);
const reject = (m) => console.log(`⚠️ REJECT: ${m}`);
const error = (m) => console.log(`❌ ${m}`);

// ==================== UTIL ====================

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
                text.includes("liquidity") ||
                text.includes("createpool")
            ) return true;
        }

        return false;

    } catch {
        return false;
    }
}

// ==================== 2. DEV WALLET (5+ DAYS RULE FIXED) ====================

async function devScore(wallet) {
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0",
            id: 1,
            method: "getSignaturesForAddress",
            params: [wallet, { limit: 300 }]
        }, { headers: HEADERS });

        const txs = res.data.result || [];

        if (!txs.length) {
            return { score: 100, safe: false, ageDays: 0 };
        }

        const newest = txs[0];
        const oldest = txs[txs.length - 1];

        const ageDays =
            ((newest.blockTime - oldest.blockTime) * 1000) /
            (1000 * 60 * 60 * 24);

        const balRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0",
            id: 1,
            method: "getBalance",
            params: [wallet]
        }, { headers: HEADERS });

        const sol = (balRes.data.result.value || 0) / 1e9;

        let score = 0;

        // 🔥 STRICT RULE: 5 DAYS MINIMUM
        if (ageDays < 5) score += 60;
        else if (ageDays < 30) score += 25;
        else if (ageDays < 90) score += 10;

        if (sol < 1) score += 30;
        else if (sol < 5) score += 15;

        if (txs.length < 20) score += 20;

        const safe = ageDays >= 5 && score < 50;

        return {
            score,
            safe,
            sol,
            txCount: txs.length,
            ageDays: ageDays.toFixed(2)
        };

    } catch {
        return { score: 100, safe: false, ageDays: 0 };
    }
}

// ==================== 3. AUTHORITY CHECK (REAL SETAUTHORITY PARSER) ====================

async function checkAuthority(mintAddress) {
    try {
        const res = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0",
            id: 1,
            method: "getSignaturesForAddress",
            params: [mintAddress, { limit: 50 }]
        }, { headers: HEADERS });

        const signatures = res.data.result || [];

        let mintRevoked = false;
        let freezeRevoked = false;

        for (let sig of signatures) {

            const txRes = await axios.post(HELIUS_RPC, {
                jsonrpc: "2.0",
                id: 1,
                method: "getTransaction",
                params: [sig.signature, { maxSupportedTransactionVersion: 0 }]
            }, { headers: HEADERS });

            const logs = txRes.data?.result?.meta?.logMessages || [];
            const text = logs.join(" ").toLowerCase();

            if (text.includes("setauthority")) {

                if (
                    text.includes("minttokens") &&
                    (text.includes("none") || text.includes("null"))
                ) {
                    mintRevoked = true;
                }

                if (
                    text.includes("freezeaccount") &&
                    (text.includes("none") || text.includes("null"))
                ) {
                    freezeRevoked = true;
                }
            }
        }

        return {
            revoked: mintRevoked && freezeRevoked,
            mintRevoked,
            freezeRevoked
        };

    } catch {
        return { revoked: false };
    }
}

// ==================== 4. TOKEN SAFETY ====================

function tokenSafe(name) {
    const bad = ["100x", "moon", "pump", "rocket", "inu!!!"];
    return !bad.some(b => name.toLowerCase().includes(b));
}

// ==================== 5. WAIT PHASE ====================

async function waitPhase() {
    log("⏳ WAITING 60 seconds for stabilization...");
    await sleep(60000);
}

// ==================== MAIN PIPELINE ====================

async function processToken(mint, name, creator) {

    log(`🎯 Token detected: ${name}`);

    // STEP 1: MUST BE GRADUATED
    if (!(await isGraduated(mint))) return;

    log("🚀 Graduated confirmed");

    // STEP 2: WAIT
    await waitPhase();

    // STEP 3: DEV CHECK (5+ DAYS ENFORCED)
    const dev = await devScore(creator);
    if (!dev.safe) {
        reject(`Dev unsafe | Age: ${dev.ageDays}d | Score: ${dev.score}`);
        return;
    }

    // STEP 4: NAME CHECK
    if (!tokenSafe(name)) {
        reject("Bad token name");
        return;
    }

    // STEP 5: AUTHORITY CHECK (REAL)
    const auth = await checkAuthority(mint);
    if (!auth.revoked) {
        reject("Authorities NOT revoked");
        return;
    }

    // FINAL ALERT
    const msg =
        `🚀 SAFE POST-GRADUATION TOKEN\n\n` +
        `🏷️ ${name}\n` +
        `📌 ${mint}\n\n` +
        `🧠 Dev Age: ${dev.ageDays} days\n` +
        `💰 Dev SOL: ${dev.sol.toFixed(2)}\n` +
        `📊 TX: ${dev.txCount}\n\n` +
        `🔥 ALL CHECKS PASSED\n` +
        `https://dexscreener.com/solana/${mint}`;

    await bot.sendMessage(TELEGRAM_CHAT_ID, msg);

    log("📤 ALERT SENT");
}

// ==================== WS ====================

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
