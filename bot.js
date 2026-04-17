require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

// Polling true ki hai taake /test command bhi chale
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const alertedMints = new Set();

// Updated Hype & CEX List
const CEX_LIST = ["fixedfloat", "changenow", "binance", "okx", "bybit", "kucoin", "gate.io", "mexc", "9wz2n", "66ppj", "5vc9e", "ac56n", "asty", "36vc", "2aqp", "h8sr", "6a7s2", "47s6a", "7xvyf"];

// --- 🧪 Manual Test Command ---
bot.onText(/\/test (.+)/, async (msg, match) => {
    const testMint = match[1];
    bot.sendMessage(msg.chat.id, `🕵️‍♂️ Deep Scanning: \`${testMint.substring(0,8)}...\``, {parse_mode: 'Markdown'});
    
    try {
        const sigs = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [testMint]
        });
        const launchSig = sigs.data.result[sigs.data.result.length - 1].signature;
        const tx = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [launchSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        const dev = tx.data.result.transaction.message.accountKeys[0].pubkey;
        performForensic(testMint, dev, true);
    } catch (e) {
        bot.sendMessage(msg.chat.id, "❌ Forensic Error: Invalid Mint or RPC issue.");
    }
});

// --- 🛠️ Forensic Engine (3-Level Deep Scan) ---
async function performForensic(mint, devWallet, isManual = false) {
    try {
        // 1. Fetch Metadata (Name & Socials)
        const asset = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        });
        const tokenName = asset.data.result?.content?.metadata?.name || "Unknown Token";
        const meta = JSON.stringify(asset.data.result || "").toLowerCase();
        const hasSocials = meta.includes("t.me/") || meta.includes("x.com/") || meta.includes("twitter.com/");

        if (!hasSocials && !isManual) return; // Automatic skip if no socials

        // 2. Recursive CEX Check (Up to 3 levels)
        let currentWallet = devWallet;
        let verifiedSource = null;

        for (let i = 0; i < 3; i++) {
            const sigsRes = await axios.post(HELIUS_RPC, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [currentWallet, { limit: 10 }]
            });
            const sigs = sigsRes.data.result || [];
            if (sigs.length === 0) break;

            const genesis = sigs[sigs.length - 1];
            const fundTx = await axios.post(HELIUS_RPC, {
                jsonrpc: "2.0", id: 1, method: "getTransaction",
                params: [genesis.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });
            
            const logs = JSON.stringify(fundTx.data.result?.meta?.logMessages || "").toLowerCase();
            const funder = fundTx.data.result?.transaction?.message?.accountKeys[0]?.pubkey || "";
            
            // Check if Funder or Logs match CEX List
            const foundCEX = CEX_LIST.find(sig => funder.toLowerCase().startsWith(sig) || logs.includes(sig));

            if (foundCEX) {
                verifiedSource = foundCEX.toUpperCase();
                break;
            }
            currentWallet = funder; // Trace 1 level deeper
        }

        // 3. Send Alert
        if (verifiedSource) {
            const msg = `🌟 *ELITE CEX SIGNAL (V57)*\n\n` +
                        `🏷️ **Name:** \`${tokenName}\`\n` +
                        `📍 **Mint:** \`${mint}\`\n` +
                        `💰 **Source:** *${verifiedSource} Verified* ✅\n\n` +
                        `🔗 [Jupiter Swap](https://jup.ag/swap/SOL-${mint})\n` +
                        `📊 [DexScreener](https://dexscreener.com/solana/${mint})`;

            await bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown', disable_web_page_preview: true });
            console.log(`✅ Alert Sent: ${tokenName}`);
        } else if (isManual) {
            bot.sendMessage(TELEGRAM_CHAT_ID, `❌ *TEST FAILED*\nSocials: ${hasSocials ? "✅" : "❌"}\nCEX: ❌ (No verified source in 3 levels)`);
        }
    } catch (e) {
        if (!isManual) alertedMints.delete(mint);
    }
}

// --- 📡 Radar Start ---
function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    ws.on('open', () => {
        console.log('🛡️ V57 ONLINE: Multi-Level CEX Radar Active');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
    });
    ws.on('message', async (data) => {
        const event = JSON.parse(data.toString());
        if (event.mint && !alertedMints.has(event.mint)) {
            alertedMints.add(event.mint);
            performForensic(event.mint, event.traderPublicKey);
        }
    });
    ws.on('close', () => setTimeout(startRadar, 3000));
}

startRadar();
setInterval(() => alertedMints.clear(), 12 * 60 * 60 * 1000);
