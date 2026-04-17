require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

// --- CONFIG ---
const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

// --- FIX: Specific Polling for Conflict Resolution ---
const bot = new TelegramBot(TELEGRAM_TOKEN, { 
    polling: { 
        autoStart: true, 
        params: { timeout: 10 },
        interval: 100 // Thora gap taake conflict na ho
    } 
});

const alertedMints = new Set();
const CEX_LIST = ["fixedfloat", "changenow", "binance", "okx", "bybit", "kucoin", "gate.io", "mexc", "9wz2n", "66ppj", "5vc9e", "ac56n", "asty", "36vc", "2aqp", "h8sr", "6a7s2", "47s6a", "7xvyf"];

console.log('🚀 V62 ULTRA-STRICT DEPLOYED: Whale Mode Only');

// Forensic Logic (Ultra Strict)
async function performForensic(mint, devWallet) {
    try {
        const asset = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        });
        const meta = JSON.stringify(asset.data.result || "").toLowerCase();
        const hasSocials = meta.includes("t.me/") || meta.includes("x.com/") || meta.includes("twitter.com/");
        
        if (!hasSocials) return; // Must have Socials

        // 1. Budget Check (Min 2.5 SOL)
        const balanceRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getBalance", params: [devWallet]
        });
        const solBalance = balanceRes.data.result.value / 1e9;
        if (solBalance < 2.5) return; 

        // 2. Funder History (Min 50+ Transactions)
        const sigsRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [devWallet, { limit: 5 }]
        });
        const genesis = sigsRes.data.result[sigsRes.data.result.length - 1];
        const fundTx = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [genesis.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        
        const funderWallet = fundTx.data.result.transaction.message.accountKeys[0].pubkey;
        const funderHistory = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [funderWallet, { limit: 100 }]
        });
        const txCount = funderHistory.data.result?.length || 0;
        
        if (txCount < 50) return; // Strict History Requirement

        // 3. Ownership Check
        const tokenAccounts = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTokenLargestAccounts", params: [mint]
        });
        const topHoldPct = (tokenAccounts.data.result.value[0].uiAmount / 1000000000) * 100;
        if (topHoldPct > 15) return; 

        const tokenName = asset.data.result?.content?.metadata?.name || "Unknown";
        const msg = `🐳 *ULTRA-STRICT WHALE SIGNAL*\n\n` +
                    `🏷️ **Name:** \`${tokenName}\`\n` +
                    `💰 **Dev Budget:** ${solBalance.toFixed(2)} SOL\n` +
                    `📈 **History:** ${txCount} txns\n` +
                    `🔒 **Holdings:** ${topHoldPct.toFixed(1)}%\n\n` +
                    `🔗 [Jupiter](https://jup.ag/swap/SOL-${mint}) | [DexScreener](https://dexscreener.com/solana/${mint})`;

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
            setTimeout(() => performForensic(event.mint, event.traderPublicKey), 60000);
        }
    });
    ws.on('close', () => setTimeout(startRadar, 3000));
}

startRadar();

// Silent conflict handling
bot.on('polling_error', (err) => {
    if (!err.message.includes('409 Conflict')) console.error(err);
});
