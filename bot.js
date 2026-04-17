require('dotenv').config();
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_API_KEY = "cad2ea55-0ae1-4005-8b8a-3b04167a57fb";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
let scannedMints = new Set();

const SAFE_FUNDS = ["9Wz2n", "66pPj", "5VC9e", "FixedFloat", "ChangeNOW", "SideShift", "Binance", "Bybit", "OKX"];

console.log("🔥 AGGRESSIVE SNIPER V44 (FIXED DETECTION)...\n");

// ==================== FIXED: PUMP.FUN DETECTION ====================

async function findNewTokens() {
    try {
        console.log('\n[' + new Date().toLocaleTimeString() + '] Scanning Pump.fun...');
        
        // METHOD 1: Query Pump.fun contracts directly via RPC
        // Pump.fun Program ID: 6EF8rrecthR5DkZJv96tS6pg6W5tTfG9c9X6Lgnn7W6b
        
        const response = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0",
            id: 1,
            method: "getProgramAccounts",
            params: [
                "6EF8rrecthR5DkZJv96tS6pg6W5tTfG9c9X6Lgnn7W6b", // Pump.fun program
                {
                    filters: [
                        {
                            memcmp: {
                                offset: 0,
                                bytes: "0"  // Filter for mints
                            }
                        }
                    ],
                    encoding: "base64",
                    commitment: "confirmed"
                }
            ]
        }, {
            timeout: 15000
        }).catch(async (err) => {
            console.log(`   ❌ Method 1 failed: ${err.message}`);
            // Fallback: Use Pump.fun API directly
            return await queryPumpFunAPI();
        });

        if (!response || !response.data) {
            console.log('   ❌ No response from RPC');
            return;
        }

        const accounts = response.data.result;
        
        if (!accounts || accounts.length === 0) {
            console.log('   ❌ No accounts found');
            return;
        }

        console.log(`   ✅ Got ${accounts.length} accounts from Pump.fun`);

        // Check last 20 accounts for new tokens (more thorough)
        const latest = accounts.slice(Math.max(0, accounts.length - 20));
        console.log(`   Checking last ${latest.length} for new mints...\n`);

        let newFound = 0;

        for (let acc of latest) {
            try {
                const mint = acc.pubkey;
                
                if (!scannedMints.has(mint)) {
                    console.log(`   🎯 NEW MINT DETECTED: ${mint.substring(0, 15)}...`);
                    scannedMints.add(mint);
                    newFound++;
                    
                    // Run forensic analysis
                    await performForensic(mint);
                    await new Promise(r => setTimeout(r, 1000)); // Rate limit
                }
            } catch (e) {
                console.log(`   ⚠️  Account error: ${e.message.split('\n')[0]}`);
            }
        }

        console.log(`   📊 Result: ${newFound} new mints found\n`);

        if (scannedMints.size > 2000) {
            console.log('   🧹 Clearing old mint cache...');
            scannedMints.clear();
        }

    } catch (e) {
        console.log(`   ❌ Detection Error: ${e.message.split('\n')[0]}`);
        process.stdout.write("!");
    }
}

// ==================== FALLBACK: PUMP.FUN API ====================

async function queryPumpFunAPI() {
    try {
        console.log('   Using Pump.fun API fallback...');
        
        const res = await axios.get('https://frontend-api.pump.fun/tokens/recent?pageSize=50', {
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        if (res.data) {
            console.log(`   ✅ Got ${res.data.length} tokens from Pump.fun API`);
            return { data: { result: res.data.map((t, i) => ({
                pubkey: t.mint,
                account: { data: ['', 'base64'] },
                _token: t
            })) } };
        }
    } catch (e) {
        console.log(`   ❌ Pump.fun API error: ${e.message.split('\n')[0]}`);
    }
    return null;
}

// ==================== FORENSIC ENGINE (UNCHANGED) ====================

async function performForensic(mint) {
    try {
        console.log(`   🔍 Running forensic on ${mint.substring(0, 10)}...`);
        
        // Step 1: Get asset metadata
        const assetRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0",
            id: "my-id",
            method: "getAsset",
            params: { id: mint }
        }, { timeout: 5000 }).catch(() => null);

        let hasSocials = false;
        if (assetRes?.data?.result) {
            const info = JSON.stringify(assetRes.data.result).toLowerCase();
            hasSocials = info.includes("t.me/") || info.includes("x.com/") || info.includes("twitter.com/");
        }

        // Step 2: Get dev info and transaction history
        const sigs = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0",
            id: 1,
            method: "getSignaturesForAddress",
            params: [mint, { limit: 1 }]
        }, { timeout: 5000 }).catch(() => null);

        if (!sigs?.data?.result || sigs.data.result.length === 0) {
            console.log(`   ⚠️  No signatures found`);
            return;
        }

        const launchSig = sigs.data.result[0].signature;
        
        // Step 3: Get transaction details
        const tx = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0",
            id: 1,
            method: "getTransaction",
            params: [launchSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        }, { timeout: 5000 }).catch(() => null);

        if (!tx?.data?.result?.transaction?.message?.accountKeys) {
            console.log(`   ⚠️  Could not parse transaction`);
            return;
        }

        const dev = tx.data.result.transaction.message.accountKeys[0].pubkey;
        
        // Step 4: Get dev history
        const devHistory = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0",
            id: 1,
            method: "getSignaturesForAddress",
            params: [dev, { limit: 100 }]
        }, { timeout: 5000 }).catch(() => null);

        if (!devHistory?.data?.result) {
            console.log(`   ⚠️  Could not get dev history`);
            return;
        }

        const txCount = devHistory.data.result.length;
        const genesis = devHistory.data.result[devHistory.data.result.length - 1];
        const ageMins = (Date.now() / 1000 - genesis.blockTime) / 60;

        console.log(`   📊 Stats: Age: ${ageMins.toFixed(0)}m | Txs: ${txCount} | Socials: ${hasSocials ? '✅' : '❌'}`);

        // FORENSIC CRITERIA: 3h+ Age OR 20+ Txs AND Socials
        if ((ageMins > 180 || txCount > 20) && hasSocials) {
            console.log(`   🌟 ELITE TOKEN FOUND!\n`);
            
            const msg = `🚀 *ELITE ALERT: PUMP.FUN MOON*\n\n` +
                        `📍 Mint: \`${mint}\`\n` +
                        `🕒 Dev Age: ${ageMins.toFixed(0)} mins\n` +
                        `📊 Dev History: ${txCount} txs\n` +
                        `🔗 Socials: ${hasSocials ? '✅ YES' : '❌ NO'}\n\n` +
                        `🔗 [DexScreener](https://dexscreener.com/solana/${mint})\n` +
                        `🔗 [Solscan](https://solscan.io/token/${mint})`;
            
            await bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown' });
            console.log(`   ✉️ TELEGRAM ALERT SENT!\n`);
        } else {
            console.log(`   ❌ Filtered: Age ${ageMins.toFixed(0)}m < 180m OR Txs ${txCount} < 20 OR No Socials\n`);
        }

    } catch (e) {
        console.log(`   ⚠️ Forensic Error: ${e.message.split('\n')[0]}\n`);
    }
}

// ==================== STARTUP ====================

async function startup() {
    try {
        await bot.sendMessage(TELEGRAM_CHAT_ID, "✅ *V44 ONLINE:* Fixed Detection + Full Forensic");
        console.log("✅ Bot connected to Telegram\n");
    } catch (e) {
        console.log("⚠️ Telegram connection issue\n");
    }

    console.log("🔍 Starting Pump.fun scan every 5 seconds...");
    console.log("📊 Looking for: Age 3h+ OR 20+ txs AND socials\n");
    console.log("═".repeat(60) + "\n");

    // Scan every 5 seconds
    setInterval(findNewTokens, 5000);
}

process.on('SIGINT', () => {
    console.log('\n\n👋 Bot stopped');
    process.exit(0);
});

startup();
