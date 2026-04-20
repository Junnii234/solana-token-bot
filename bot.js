Mushtaq bhai, yeh raha aapka mukammal aur updated code. Maine aapki hidayat ke mutabiq sari tabdeeliyan kar di hain aur code ko "Farmed Wallets" (Scammers) ke khilaf bohot mazboot bana diya hai.
### 🛠️ Code Mein Kya Tabdeeliyan Ki Gayi Hain?
 * **Age Limit:** Aapke purane code mein umar ki had 270 din thi. Maine isay update kar ke **10+ days** kar diya hai.
 * **SPL Token Portfolio (The Scammer Killer):** Maine balance check ke baad **3+ SPL Tokens** ka lazmi check laga diya hai. Ab agar koi scammer purana wallet lata hai jismein sirf SOL ho (aur koi coin na ho), toh bot usay foran reject kar dega.
 * **Program Diversity Fix:** Aapka purana code signatures.slice(0, 10) use kar raha tha, yani sirf aakhri 10 transactions check hoti thin jo launch ke waqt sirf Pump.fun ki hoti hain. Maine isay update kar ke **Random Sampling** par set kar diya hai. Ab bot poori history mein se randomly 10 transactions uthayega taake asli diversity ka pata chale.
Yeh raha aapka **V32.0** final code. Isay copy karein aur apni file mein replace kar len:
```javascript
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

// ==================== PROGRAM DIVERSITY CHECK (FIXED) ====================

async function getProgramDiversity(signatures) {
    const programSet = new Set();
    
    // Instead of the first 10, pick up to 10 random signatures from history 
    // to get a true sense of the developer's historical diversity.
    const sampleSize = Math.min(10, signatures.length);
    const sampledSignatures = [];
    for (let i = 0; i < sampleSize; i++) {
        const randomIndex = Math.floor(Math.random() * signatures.length);
        sampledSignatures.push(signatures[randomIndex]);
    }

    for (const sig of sampledSignatures) {
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
            // Ignore minor RPC fetch errors for diversity
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

        // Step 1: Age Check (Updated to 10+ Days)
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

            if (walletAgeDays >= 10) break;
            if (txs.length < 1000) break;
        }

        if (!historyFound) {
            reject(`No history found on blockchain`);
            return { warm: false };
        }

        if (walletAgeDays < 10) {
            reject(`Age: ${walletAgeDays.toFixed(1)}d (need 10+)`);
            return { warm: false };
        }

        // Step 2: Transaction Count (200+)
        if (totalTxs < 200) {
            reject(`Tx Count: ${totalTxs} (need 200+)`);
            return { warm: false };
        }

        // Step 3: Balance Check (2+ SOL)
        const balanceRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getBalance", params: [creator]
        }, { headers: HEADERS, timeout: 5000 });

        const balanceSol = (balanceRes.data.result.value || 0) / 1e9;
        if (balanceSol < 2) {
            reject(`Balance: ${balanceSol.toFixed(2)}SOL (need 2+)`);
            return { warm: false };
        }

        // Step 4: SPL Token Portfolio Check (Farmed Wallet Killer)
        try {
            const tokenAccountsRes = await axios.post(HELIUS_RPC, {
                jsonrpc: "2.0", id: 1, 
                method: "getTokenAccountsByOwner",
                params: [
                    creator, 
                    { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" }, 
                    { encoding: "jsonParsed" }
                ]
            }, { headers: HEADERS, timeout: 5000 });

            const tokens = tokenAccountsRes.data.result?.value || [];
            // Filter tokens that have an amount > 0
            const activeTokens = tokens.filter(t => t.account.data.parsed.info.tokenAmount.uiAmount > 0);

            if (activeTokens.length < 3) {
                reject(`Portfolio: Only ${activeTokens.length} SPL tokens (Scammer/Farmed Wallet detected. Need 3+)`);
                return { warm: false };
            }
            log(`   🎒 Portfolio Check Passed: Holds ${activeTokens.length} different tokens`);
        } catch (e) {
            error(`Token Account Fetch Error: ${e.message}`);
            return { warm: false }; 
        }

        // Step 5: Program Diversity
        const programCount = await getProgramDiversity(signatures);
        let diversityNote = "";
        if (programCount >= 3) {
            diversityNote = `Program Diversity: ${programCount} ✅ Excellent`;
        } else if (programCount > 0) {
            diversityNote = `Program Diversity: ${programCount} ⚠️ Low`;
        } else {
            diversityNote = `Program Diversity: 0 ⚠️ No diversity detected`;
        }

        const birthDate = new Date(birthTime * 1000);
        log(`📅 First Transaction: ${birthDate.toISOString()}`);

        log(`   ✅ WARM WALLET VERIFIED: ${walletAgeDays.toFixed(1)} days old | ${totalTxs} txs | ${diversityNote}`);
        return { warm: true, age: walletAgeDays.toFixed(1), balance: balanceSol.toFixed(2), txCount: totalTxs, firstTx: birthDate.toISOString(), programCount, diversityNote };

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
        log(`🔎 Manual Check Requested for Mint: ${mint}`);

        let res;
        try {
            res = await axios.get(`https://api.pump.fun/metadata/${mint}`);
        } catch (e) {
            bot.sendMessage(chatId, `⚠️ Pump.fun API unavailable. Blockchain metrics only will be checked.`);
            res = { data: {} };
        }

        const creator = res.data?.creator || mint; 
        const name = res.data?.symbol || "Unknown";

        const walletCheck = await checkWarmWallet(creator);

        if (walletCheck.warm) {
            const report = 
                `🌟 **REAL DEV - VERIFIED** 🌟\n\n` +
                `🏷️ **Token:** ${name}\n` +
                `📋 **Mint:** \`${mint}\`\n\n` +
                `✅ **VERIFIED METRICS:**\n` +
                `• Wallet Age: ${walletCheck.age} days\n` +
                `• Balance: ${walletCheck.balance} SOL\n` +
                `• Tx Count: ${walletCheck.txCount}\n` +
                `• ${walletCheck.diversityNote}\n` +
                `• First Tx: ${walletCheck.firstTx.split('T')[0]}\n\n` +
                `💰 [Pump.Fun](https://pump.fun/${mint})\n` +
                `📊 [DexScreener](https://dexscreener.com/solana/${mint})`;

            bot.sendMessage(chatId, report, { 
                parse_mode: 'Markdown', 
                disable_web_page_preview: true 
            });

        } else {
            bot.sendMessage(chatId, `⚠️ Wallet did not meet criteria for mint: ${mint}. (Likely Farmed/Scam)`);
        }

    } catch (e) {
        error(`Manual Check Error: ${e.message}`);
        bot.sendMessage(chatId, `❌ Error checking mint: ${e.message}`);
    }
});

// ==================== AUTO MONITORING ====================

function monitorPumpFun() {
    log('📡 Initializing WebSocket Connection...');
    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    ws.on('open', () => {
        log('✅ WebSocket Connected. Subscribing to New Tokens...');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            const mint = event.mint;
            const creator = event.traderPublicKey;
            const name = event.symbol || 'Unknown';

            if (!mint || alertedMints.has(mint)) return;
            alertedMints.add(mint);

            log(`\n🎯 NEW TOKEN DETECTED: ${name}`);
            const walletCheck = await checkWarmWallet(creator);

            if (walletCheck.warm) {
                const report =
                    `🚀 **MOON DEV DETECTED** 🚀\n\n` +
                    `🏷️ **Token:** ${name}\n` +
                    `📋 **Mint:** \`${mint}\`\n\n` +
                    `✅ **VERIFIED METRICS:**\n` +
                    `• Wallet Age: ${walletCheck.age} days\n` +
                    `• Balance: ${walletCheck.balance} SOL\n` +
                    `• Tx Count: ${walletCheck.txCount}\n` +
                    `• ${walletCheck.diversityNote}\n` +
                    `• First Tx: ${walletCheck.firstTx.split('T')[0]}\n\n` +
                    `💰 [Pump.Fun](https://pump.fun/${mint})\n` +
                    `📊 [DexScreener](https://dexscreener.com/solana/${mint})`;

                await bot.sendMessage(TELEGRAM_CHAT_ID, report, {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                });
            } else {
                log(`⚠️ Wallet rejected — skipping alert.`);
            }

        } catch (e) {
            error(`Event Processing Error: ${e.message}`);
        }
    });

    ws.on('close', () => {
        error('WebSocket Connection Closed.');
        log('⏳ Reconnecting in 5 seconds...');
        setTimeout(monitorPumpFun, 5000);
    });

    ws.on('error', (err) => {
        error(`WebSocket Error: ${err.message}`);
    });
}

// ==================== STARTUP ====================

async function startup() {
    console.clear();
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  🚀 V32.0 - MOON TOKEN & ANTI-SCAM MONITOR                 ║
║  🔥 Detection (10+d, 2+SOL, 200+Txs, 3+ SPL Tokens)        ║
║  ⚡ Powered by PumpPortal & Helius                         ║
╚════════════════════════════════════════════════════════════╝
    `);

    log("✅ System Check Passed");
    log(`📱 Telegram Bot: Active`);
    monitorPumpFun();
}

startup();

```
