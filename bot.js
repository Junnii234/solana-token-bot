require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const WebSocket = require('ws');
const { Connection, PublicKey } = require('@solana/web3.js');

// ================= CONFIG =================

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8758743414:AAEKc_ORnq15WQHIR1jbKqh7psZfUcSCAcQ";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8006731872";
const HELIUS_RPC = process.env.HELIUS_RPC || "https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb";

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const connection = new Connection(HELIUS_RPC, "confirmed");

const SOL_MINT = "So11111111111111111111111111111111111111112";

// ✅ CORRECT: Pump.fun migration account (for polling method)
const PUMP_FUN_MIGRATION_ACCOUNT = "39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg";

const RAYDIUM_PROGRAMS = [
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", // CPMM
    //"CAMMCzo5YL8w4VFF3i5nVjB6w3Vv4YFQj1h7Q9h3i6k"  // CLMM
];

// ================= MEMORY =================

const pumpTokens = new Map();
const processed = new Set();
let lastCheckedMigrationSig = null; // ✅ NEW: Track last checked TX

// ================= LOG =================

const log = (m) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);
const reject = (m) => console.log(`⚠️ ${m}`);
const error = (m) => console.log(`❌ ${m}`);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ================= RETRY LOGIC =================

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

// ================= PUMP LISTENER =================

function startPumpListener() {

    const ws = new WebSocket("wss://pumpportal.fun/api/data");

    ws.on("open", () => {
        log("✅ Pump.fun connected");
        ws.send(JSON.stringify({ method: "subscribeNewToken" }));
    });

    ws.on("message", (data) => {
        try {
            const e = JSON.parse(data.toString());

            if (!e.mint) {
                reject(`Pump.fun message missing mint field`);
                return;
            }

            pumpTokens.set(e.mint, {
                creator: e.traderPublicKey,
                name: e.symbol || "UNKNOWN",
                time: Date.now()
            });

            log(`📥 Stored: ${e.symbol}`);

        } catch (err) {
            error(`Pump.fun parse error: ${err.message}`);
        }
    });

    ws.on("close", () => {
        error("Pump.fun connection closed, reconnecting...");
        setTimeout(startPumpListener, 5000);
    });

    // Monitor WebSocket health
    setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) {
            error("Pump.fun WebSocket unhealthy, forcing reconnect...");
            ws.close();
        }
    }, 30000);
}

// ================= VERIFY =================

function verifyPumpToken(mint) {
    const t = pumpTokens.get(mint);
    if (!t) return false;

    const age = (Date.now() - t.time) / 1000;
    return age < 3600; // 60 minutes
}

// ================= DEV CHECK =================

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

        const ageDays =
            ((txs[0].blockTime - txs[txs.length - 1].blockTime) * 1000) /
            (1000 * 60 * 60 * 24);

        return { safe: ageDays >= 5, ageDays: ageDays.toFixed(1) };

    } catch (e) {
        error(`devCheck error: ${e.message}`);
        return { safe: false };
    }
}

// ================= AUTHORITY =================

async function checkAuthority(mint) {
    try {
        const res = await axiosWithRetry({
            jsonrpc: "2.0",
            id: 1,
            method: "getAccountInfo",
            params: [mint, { encoding: "jsonParsed" }]
        });

        const info = res.data.result?.value?.data?.parsed?.info;

        if (!info) return false;

        return !info.mintAuthority;

    } catch (e) {
        error(`checkAuthority error: ${e.message}`);
        return false;
    }
}

// ================= PROCESS =================

async function processToken(mint, meta) {

    if (processed.has(mint)) return;
    processed.add(mint);

    log(`🚀 GRADUATED: ${meta.name}`);

    await sleep(60000);

    const dev = await devCheck(meta.creator);
    if (!dev.safe) return reject("Dev fail");

    const auth = await checkAuthority(mint);
    if (!auth) return reject("Authority fail");

    await bot.sendMessage(
        TELEGRAM_CHAT_ID,
        `🚀 SAFE TOKEN\n\n${meta.name}\n${mint}\nDev Age: ${dev.ageDays}d\nhttps://dexscreener.com/solana/${mint}`
    );

    log("📤 ALERT SENT");
}

// ================= RAYDIUM TX LISTENER =================

function startRaydiumListener() {

    log("🚀 Raydium TX Listener Started");

    connection.onLogs("all", async (logInfo) => {
        try {

            const sig = logInfo.signature;
            const logs = logInfo.logs.join(" ").toLowerCase();

            if (
                !logs.includes("raydium_migration") &&
                !logs.includes("liquidity") &&
                !logs.includes("initialize2") &&
                !logs.includes("initialize") &&
                !logs.includes("swap")
            ) return;

            const tx = await connection.getParsedTransaction(sig, {
                maxSupportedTransactionVersion: 0
            });

            if (!tx || tx.meta?.err) return;

            const instructions = tx.transaction.message.instructions;

            for (let ix of instructions) {

                const programId = ix.programId.toBase58();

                if (!RAYDIUM_PROGRAMS.includes(programId)) continue;

                const accounts = ix.accounts.map(a => a.toBase58());

                for (let acc of accounts) {

                    if (acc === SOL_MINT) continue;

                    if (!verifyPumpToken(acc)) continue;

                    const meta = pumpTokens.get(acc);

                    log(`🔥 VERIFIED GRADUATION (Raydium): ${meta.name}`);

                    await processToken(acc, meta);
                }
            }

        } catch (e) {
            error(e.message);
        }
    });
}

// ================= MIGRATION ACCOUNT LISTENER (POLLING) =================
// ✅ CORRECT: Use polling instead of onLogs since we can't pass custom addresses

async function startMigrationAccountListener() {

    log("🚀 Pump.fun Migration Account Listener Started (Polling)");

    setInterval(async () => {
        try {
            const res = await axiosWithRetry({
                jsonrpc: "2.0",
                id: 1,
                method: "getSignaturesForAddress",
                params: [PUMP_FUN_MIGRATION_ACCOUNT, { limit: 10 }]
            });

            const sigs = res.data.result || [];

            for (let sig of sigs) {
                // ✅ Skip if we already checked this signature
                if (lastCheckedMigrationSig === sig.signature) break;

                if (sig.err) continue;

                const tx = await axiosWithRetry({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "getTransaction",
                    params: [sig.signature, { maxSupportedTransactionVersion: 0 }]
                });

                const txData = tx.data.result;
                if (!txData || txData.meta?.err) continue;

                const instructions = txData.transaction.message.instructions;

                // Extract all accounts involved
                const allAccounts = new Set();

                for (let ix of instructions) {
                    if (ix.accounts) {
                        ix.accounts.forEach(a => {
                            allAccounts.add(a.toBase58?.() || a);
                        });
                    }
                }

                // Check if any account is a stored pump token
                for (let acc of allAccounts) {
                    if (verifyPumpToken(acc)) {
                        const meta = pumpTokens.get(acc);

                        log(`🔥 VERIFIED GRADUATION (Migration Polling): ${meta.name}`);

                        await processToken(acc, meta);
                    }
                }
            }

            // ✅ Update last checked signature
            if (sigs.length > 0) {
                lastCheckedMigrationSig = sigs[0].signature;
            }

        } catch (e) {
            error(`Migration listener error: ${e.message}`);
        }
    }, 30000); // Poll every 30 seconds
}

// ================= START =================

function start() {
    log("🚀 BOT V7.1 STARTED (FIXED MIGRATION LISTENER)");
    log("Changes:");
    log("  ✅ Removed broken length check");
    log("  ✅ Increased pump token TTL to 3600s");
    log("  ✅ Migration account listener uses POLLING (correct method)");
    log("  ✅ Polls every 30 seconds for new migrations");
    log("  ✅ Better error logging");

    startPumpListener();
    startRaydiumListener();
    startMigrationAccountListener(); // ✅ Now uses polling instead of onLogs
}

start();
