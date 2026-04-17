require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });
const alertedMints = new Set();

// TESTED CEX SIGNATURES ONLY
const CEX_SIGNATURES = ["fixedfloat", "changenow", "binance", "okx", "bybit", "kucoin", "gate.io", "mexc", "9wz2n", "66ppj", "5vc9e", "ac56n", "asty", "36vc", "2aqp", "h8sr", "6a7s2", "47s6a", "7xvyf"];

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');

    ws.on('open', () => {
        console.log('🛡️ V50: CEX-ONLY MODE (Anti-Fraud Active)');
        ws.send(JSON.stringify({ "method": "subscribeNewToken" }));
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            if (!event.mint || alertedMints.has(event.mint)) return;
            
            alertedMints.add(event.mint);
            performForensic(event.mint, event.traderPublicKey);
        } catch (e) { }
    });

    ws.on('close', () => setTimeout(startRadar, 3000));
}

async function performForensic(mint, devWallet) {
    try {
        // 1. Socials Check (Mandatory)
        const asset = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        });
        const meta = JSON.stringify(asset.data.result || "").toLowerCase();
        const hasSocials = meta.includes("t.me/") || meta.includes("x.com/") || meta.includes("twitter.com/");

        if (!hasSocials) return; // Silent skip if no socials

        // 2. CEX Funding Check (Mandatory)
        const sigsRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [devWallet, { limit: 100 }]
        });
        const sigs = sigsRes.data.result || [];
        if (sigs.length === 0) return;

        const genesis = sigs[sigs.length - 1];
        const fundTx = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [genesis.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        
        const logs = JSON.stringify(fundTx.data.result?.meta?.logMessages || "").toLowerCase();
        
        // CHECKING IF FUNDER IS FROM CEX LIST
        const isCEX = CEX_SIGNATURES.some(cex => logs.includes(cex.toLowerCase()));

        if (isCEX) {
            const ageMins = (Date.now() / 1000 - genesis.blockTime) / 60;
            const msg = `🌟 *CEX VERIFIED SIGNAL (V50)*\n\n` +
                        `📍 Mint: \`${mint}\`\n` +
                        `💰 Funding: *CEX/Exchange Detected* ✅\n` +
                        `🕒 Dev Age: ${ageMins.toFixed(0)} mins\n\n` +
                        `🔗 [DexScreener](https://dexscreener.com/solana/${mint})`;

            await bot.sendMessage(TELEGRAM_CHAT_ID, msg, { parse_mode: 'Markdown' });
            console.log(`✅ CEX Alert Sent: ${mint.substring(0,5)}`);
        } else {
            console.log(`❌ Skipped: Personal Wallet (Non-CEX)`);
        }

    } catch (e) { 
        alertedMints.delete(mint); 
    }
}

startRadar();
setInterval(() => alertedMints.clear(), 12 * 60 * 60 * 1000);
