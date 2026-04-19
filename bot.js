require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const WebSocket = require('ws');
const { Connection, PublicKey } = require('@solana/web3.js');

// ================= CONFIG =================

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8006731872";
const HELIUS_RPC = process.env.HELIUS_RPC || "https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb";

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const connection = new Connection(HELIUS_RPC, "confirmed");

// ================= MEMORY =================

const pumpTokens = new Map();
const processed = new Set();

// ================= LOG =================

const log = (m) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);
const reject = (m) => console.log(`[${new Date().toLocaleTimeString()}] ⚠️ ${m}`);
const error = (m) => console.log(`[${new Date().toLocaleTimeString()}] ❌ ${m}`);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ================= RETRY LOGIC (YOUR ORIGINAL) =================

const RETRY_DELAY = 2000; 
const MAX_RETRIES = 3;

async function axiosWithRetry(config, retries = 0) {
    try {
        await sleep(RETRY_DELAY);
        const res = await axios.post(HELIUS_RPC, config);
        if (res.data.error && res.data.error.code === -32429 && retries < MAX_RETRIES) {
            error(`Rate limited (attempt ${retries + 1}/${MAX_RETRIES}), retrying...`);
            await sleep(5000); 
            return axiosWithRetry(config, retries + 1);
        }
        return res;
    } catch (e) {
        if (retries < MAX_RETRIES && e.response?.status === 429) {
            error(`429 error (attempt ${retries + 1}/${MAX_RETRIES}), retrying...`);
            await sleep(5000);
            return axiosWithRetry(config, retries + 1);
        }
        throw e;
    }
}

// ================= PUMP LISTENER (YOUR ORIGINAL) =================

function startPumpListener() {
    const ws = new WebSocket("wss://pumpportal.fun/api/data");

    ws.on("open", () => {
        log("✅ Pump.fun connected. Storing new tokens...");
        ws.send(JSON.stringify({ method: "subscribeNewToken" }));
    });

    ws.on("message", (data) => {
        try {
            const e = JSON.parse(data.toString());
            if (!e.mint) return;

            pumpTokens.set(e.mint, {
                creator: e.traderPublicKey,
                name: e.symbol || "UNKNOWN",
                time: Date.now()
            });

            // Log sirf har 50th token par taake Railway logs spam na hon
            if (pumpTokens.size % 50 === 0) log(`📥 Stored ${pumpTokens.size} tokens in memory...`);
        } catch {}
    });

    ws.on("close", () => setTimeout(startPumpListener, 5000));
}

// ================= VERIFY (YOUR ORIGINAL 30-MIN FILTER) =================

function verifyPumpToken(mint) {
    const t = pumpTokens.get(mint);
    if (!t) return false;

    const age = (Date.now() - t.time) / 1000;
    return age < 1800; // < 30 minutes
}

// ================= DEV CHECK (YOUR ORIGINAL 5-DAY FILTER) =================

async function devCheck(wallet) {
    try {
        const res = await axiosWithRetry({
            jsonrpc: "2.0",
            id: 1,
            method: "getSignaturesForAddress",
            params: [wallet, { limit: 100 }]
        });

        const txs = res.data.result || [];
        if (!txs.length) return { safe: false };

        const ageDays = ((txs[0].blockTime - txs[txs.length - 1].blockTime) * 1000) / (1000 * 60 * 60 * 24);
        return { safe: ageDays >= 5, ageDays: ageDays.toFixed(1) };
    } catch (e) {
        return { safe: false };
    }
}

// ================= AUTHORITY (YOUR ORIGINAL FILTER) =================

async function checkAuthority(mint) {
    try {
        const res = await axiosWithRetry({
            jsonrpc: "2.0", id: 1, method: "getAccountInfo",
            params: [mint, { encoding: "jsonParsed" }]
        });
        const info = res.data.result?.value?.data?.parsed?.info;
        if (!info) return false;
        return !info.mintAuthority;
    } catch (e) {
        return false;
    }
}

// ================= PROCESS (YOUR ORIGINAL FLOW) =================

async function processToken(mint, meta) {
    if (processed.has(mint)) return;
    processed.add(mint);

    log(`🚀 GRADUATED: ${meta.name} (Waiting 60s for locks...)`);
    
    // Aapka original 60 seconds wait
    await sleep(60000);

    const dev = await devCheck(meta.creator);
    if (!dev.safe) return reject(`Dev fail: ${meta.name}`);

    const auth = await checkAuthority(mint);
    if (!auth) return reject(`Authority fail: ${meta.name}`);

    await bot.sendMessage(
        TELEGRAM_CHAT_ID,
        `🚀 SAFE TOKEN\n\n${meta.name}\n${mint}\nDev Age: ${dev.ageDays}d\nhttps://dexscreener.com/solana/${mint}`
    );

    log(`📤 ALERT SENT: ${meta.name}`);
}

// ================= OPTIMIZED RAYDIUM TX LISTENER =================
// Yahan maine `onLogs("all")` hata diya hai jo Helius ko crash kar raha tha.
// Uski jagah PumpPortal ka apna migration ws use kiya hai taake rate limit na aaye.

function startRaydiumListener() {
    log("🚀 Raydium Migration Listener Started (RPC Optimized)");
    const ws = new WebSocket("wss://pumpportal.fun/api/data");

    ws.on("open", () => {
        log("✅ Raydium Migration WS Connected");
        ws.send(JSON.stringify({ method: "subscribeTokenTrade" }));
    });

    ws.on("message", async (data) => {
        try {
            const e = JSON.parse(data.toString());
            
            if (e.txType === 'raydium_migration') {
                const mint = e.mint;
                if (!mint) return;

                // Aapka original verifyPumpToken filter yahan check hoga
                if (!verifyPumpToken(mint)) return;

                const meta = pumpTokens.get(mint);
                log(`🔥 VERIFIED GRADUATION: ${meta.name}`);
                
                await processToken(mint, meta);
            }
        } catch (err) {}
    });

    ws.on("close", () => setTimeout(startRaydiumListener, 5000));
}

// ================= MEMORY CLEANER (NEW FIX) =================
// Yeh Railway ko RAM full hone se bachayega. 
// Har 1 ghante baad purane tokens remove karega.

setInterval(() => {
    const now = Date.now();
    for (let [mint, data] of pumpTokens.entries()) {
        if ((now - data.time) > 3600000) { // 1 hour
            pumpTokens.delete(mint);
        }
    }
    log(`🧹 Memory Cleaned. Active tokens tracked: ${pumpTokens.size}`);
}, 3600000);

// ================= START =================

function start() {
    console.clear();
    log("🚀 BOT V6 FIXED STARTED");
    startPumpListener();
    startRaydiumListener();
}

start();
