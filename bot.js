require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: { autoStart: true, params: { timeout: 10 } } });
const alertedMints = new Set();
const CEX_LIST = ["fixedfloat", "changenow", "binance", "okx", "bybit", "kucoin", "gate.io", "mexc", "9wz2n", "66ppj", "5vc9e", "ac56n", "asty", "36vc", "2aqp", "h8sr", "6a7s2", "47s6a", "7xvyf"];

console.log('🛡️ V61 ONLINE: ELITE GEMS ONLY (Strict Mode)');

async function performForensic(mint, devWallet) {
    try {
        // 1. Socials Check (Must be there)
        const asset = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        });
        const meta = JSON.stringify(asset.data.result || "").toLowerCase();
        const hasSocials = meta.includes("t.me/") || meta.includes("x.com/") || meta.includes("twitter.com/");
        if (!hasSocials) return; 

        // 2. STRICT: Dev SOL Balance Check (Min 1.2 SOL)
        const balanceRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getBalance", params: [devWallet]
        });
        const solBalance = balanceRes.data.result.value / 1e9;
        if (solBalance < 1.2) return; // Skip poor devs

        // 3. STRICT: Funder History (Min 25 transactions)
        const sigsRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [devWallet, { limit: 10 }]
        });
        const genesis = sigsRes.data.result[sigsRes.data.result.length - 1];
        const fundTx = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [genesis.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        
        const funderWallet = fundTx.data.result.transaction.message.accountKeys[0].pubkey;
        const funderHistory = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [funderWallet, { limit: 50 }]
        });
        const txCount = funderHistory.data.result?.length || 0;
        
        // Skip if wallet is too fresh (Less than 25 txns)
        if (txCount < 25) return;

        // 4. CEX Check (Priority)
        const logs = JSON.stringify(fundTx.data.result?.meta?.logMessages || "").toLowerCase();
        const isCEX = CEX_LIST.some(sig => funderWallet.toLowerCase().startsWith(sig) || logs.includes(sig));

        // FINAL DECISION
        const tokenName = asset.data.result?.content?.metadata?.name || "Unknown";
        const msg = `💎 *ELITE GEM DETECTED (V61)*\n\n` +
                    `🏷️ **Name:** \`${tokenName}\`\n` +
                    `💰 **Dev Budget:** ${solBalance.toFixed(2)} SOL\n` +
                    `📈 **Wallet Trust:** ${txCount} txns\n` +
                    `🏦 **CEX Verified:** ${isCEX ? "✅ Yes" : "❌ No"}\n\n` +
                    `🔗 [Jupiter](https://jup.ag/swap/SOL-${mint})\n` +
                    `📊 [DexScreener](https://dexscreener.com/solana/${mint})`;

        await bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown', disable_web_page_preview: true });

    } catch (e) { }
}

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    ws.on('open', () => ws.send(JSON.stringify({ "method": "subscribeNewToken" })));
    ws.on('message', async (data) => {
        const event = JSON.parse(data.toString());
        if (event.mint && !alertedMints.has(event.mint)) {
            alertedMints.add(event.mint);
            // 50 Seconds wait for metadata update
            setTimeout(() => performForensic(event.mint, event.traderPublicKey), 50000);
        }
    });
    ws.on('close', () => setTimeout(startRadar, 3000));
}

startRadar();
