require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const WebSocket = require('ws');

// ==================== CONFIG ====================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8758743414:AAEKc_ORnq15WQHIR1jbKqh7psZfUcSCAcQ";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8006731872";
const HELIUS_RPC = process.env.HELIUS_RPC || `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const alertedMints = new Set();
const HEADERS = { 'Content-Type': 'application/json' };

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] 🟢 ${msg}`);
const error = (msg) => console.error(`[${new Date().toLocaleTimeString()}] ❌ ${msg}`);
const reject = (reason) => console.log(`[${new Date().toLocaleTimeString()}] ⚠️ REJECT: ${reason}`);


// ==================== DEV HISTORY ====================

async function getDevTokenHistory(creator) {
    try {
        const res = await axios.get(`https://frontend-api.pump.fun/coins/user-created-coins/${creator}`, {
            timeout: 8000
        });
        return res.data || [];
    } catch (e) {
        error(`Dev History Error: ${e.message}`);
        return [];
    }
}

// ==================== DEV SCORING ====================

function analyzeDevHistory(tokens) {
    let rugs = 0;
    let successful = 0;
    let total = tokens.length;

    tokens.forEach(t => {
        if (t.complete) successful++;
        else rugs++;
    });

    let score = 0;

    if (successful >= 3) score += 3;
    else if (successful >= 1) score += 1;

    if (rugs > successful) score -= 2;

    return {
        total,
        rugs,
        successful,
        score
    };
}


// ==================== PROGRAM DIVERSITY CHECK ====================

async function getProgramDiversity(signatures) {
    const programSet = new Set();
    for (const sig of signatures.slice(0, 10)) {
        try {
            const txRes = await axios.post(HELIUS_RPC, {
                jsonrpc: "2.0", id: 1,
                method: "getTransaction",
                params: [sig, { encoding: "json" }]
            }, { headers: HEADERS, timeout: 8000 });

            const instructions = txRes.data.result?.transaction?.message?.instructions || [];
            instructions.forEach(ix => {
                if (ix.programId) programSet.add(ix.programId);
            });
        } catch (e) {
            error(`Program Diversity Fetch Error: ${e.message}`);
        }
    }
    return programSet.size;
}


// ==================== STEP-WISE WARM WALLET DETECTION ====================

async function checkWarmWallet(creator) {
    try {
        log(`   🔍 Deep Scan Dev: ${creator.slice(0, 10)}...`);
        
        const now = Math.floor(Date.now() / 1000);
        let lastSignature = null;
        let walletAgeDays = 0;
        let historyFound = false;
        let totalTxs = 0;
        let birthTime = null;
        let signatures = [];

        // Step 1: Age Check
        for (let i = 0; i < 5; i++) {
            const params = [creator, { limit: 1000 }];
            if (lastSignature) params[1].before = lastSignature;

            const res = await axios.post(HELIUS_RPC, {
                jsonrpc: "2.0", id: 1, 
                method: "getSignaturesForAddress", 
                params: params
            }, { headers: HEADERS, timeout: 8000 });

            const txs = res.data.result;
            if (!txs || txs.length === 0) break; 

            historyFound = true;
            totalTxs += txs.length;
            signatures.push(...txs.map(t => t.signature));

            const oldestTxInBatch = txs[txs.length - 1]; 
            lastSignature = oldestTxInBatch.signature;
            birthTime = oldestTxInBatch.blockTime || now;
            walletAgeDays = (now - birthTime) / 86400;

            if (walletAgeDays >= 270) break;
            if (txs.length < 1000) break;
        }

        if (!historyFound) {
            reject(`No history found on blockchain`);
            return { warm: false };
        }

        if (walletAgeDays < 270) {
            reject(`Age: ${walletAgeDays.toFixed(1)}d (need 270+)`);
            return { warm: false };
        }

        // Step 2: Balance Check
        const balanceRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getBalance", params: [creator]
        }, { headers: HEADERS, timeout: 5000 });

        const balanceSol = (balanceRes.data.result.value || 0) / 1e9;
        if (balanceSol < 2) {
            reject(`Balance: ${balanceSol.toFixed(2)}SOL (need 2+)`);
            return { warm: false };
        }

        // ==================== NEW: DEV HISTORY CHECK ====================

        const tokens = await getDevTokenHistory(creator);
        const devStats = analyzeDevHistory(tokens);

        if (devStats.total === 0) {
            reject("No dev history found ❌");
            return { warm: false };
        }

        if (devStats.successful === 0) {
            reject(`0 successful tokens (Rugs: ${devStats.rugs}) ❌`);
            return { warm: false };
        }

        if (devStats.score <= 0) {
            reject(`Bad dev score: ${devStats.score} ❌`);
            return { warm: false };
        }

        // Step 3: Transaction Count
        if (totalTxs < 200) {
            reject(`Tx Count: ${totalTxs} (need 200+)`);
            return { warm: false };
        }

        // Step 4: Program Diversity
        const programCount = await getProgramDiversity(signatures);
        let diversityNote = programCount > 0 
            ? `Program Diversity: ${programCount} ✅`
            : `Program Diversity: 0 ⚠️`;

        const birthDate = new Date(birthTime * 1000);

        log(`   ✅ WARM + GOOD DEV: ${walletAgeDays.toFixed(1)}d | Score: ${devStats.score}`);

        return { 
            warm: true,
            age: walletAgeDays.toFixed(1),
            balance: balanceSol.toFixed(2),
            txCount: totalTxs,
            firstTx: birthDate.toISOString(),
            programCount,
            diversityNote,
            devStats
        };

    } catch (e) {
        error(`Logic Error: ${e.message}`);
        return { warm: false };
    }
}


// ==================== TELEGRAM COMMAND ====================

bot.onText(/\/check (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    let mint = match[1].trim();

    if (mint.endsWith("pump")) {
        mint = mint.replace("pump", "");
    }

    try {
        log(`🔎 Manual Check: ${mint}`);

        let res;
        try {
            res = await axios.get(`https://api.pump.fun/metadata/${mint}`);
        } catch {
            bot.sendMessage(chatId, `⚠️ Pump API down, using fallback`);
            res = { data: {} };
        }

        const creator = res.data?.creator || mint;
        const name = res.data?.symbol || "Unknown";

        const walletCheck = await checkWarmWallet(creator);

        if (walletCheck.warm) {
            const report = 
                `🌟 REAL DEV DETECTED 🌟\n\n` +
                `Token: ${name}\n` +
                `Mint: ${mint}\n\n` +

                `DEV HISTORY:\n` +
                `• Total: ${walletCheck.devStats.total}\n` +
                `• Successful: ${walletCheck.devStats.successful}\n` +
                `• Rugs: ${walletCheck.devStats.rugs}\n` +
                `• Score: ${walletCheck.devStats.score}\n\n` +

                `Wallet Age: ${walletCheck.age} days\n` +
                `Balance: ${walletCheck.balance} SOL\n`;

            bot.sendMessage(chatId, report);

        } else {
            bot.sendMessage(chatId, `❌ Rejected`);
        }

    } catch (e) {
        bot.sendMessage(chatId, `Error`);
    }
});


// ==================== AUTO MONITOR ====================

function monitorPumpFun() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    ws.on('open', () => {
        ws.send(JSON.stringify({ method: "subscribeNewToken" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            const mint = event.mint;
            const creator = event.traderPublicKey;

            if (!mint || alertedMints.has(mint)) return;
            alertedMints.add(mint);

            const walletCheck = await checkWarmWallet(creator);

            if (walletCheck.warm) {
                bot.sendMessage(TELEGRAM_CHAT_ID,
                    `🔥 GOOD DEV TOKEN\nScore: ${walletCheck.devStats.score}\nMint: ${mint}`
                );
            }

        } catch {}
    });
}


// ==================== START ====================

function startup() {
    console.clear();
    log("🚀 BOT STARTED WITH DEV SCORING");
    monitorPumpFun();
}

startup();
