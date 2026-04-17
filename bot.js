require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');

const TELEGRAM_TOKEN = "8758743414:AAGUbb0kA9fPMfU-diX7-lVVal7cxzOTqTM";
const TELEGRAM_CHAT_ID = "8006731872";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=cad2ea55-0ae1-4005-8b8a-3b04167a57fb`;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const alertedMints = new Set();

// Expanded CEX Signatures
const CEX_LIST = ["FixedFloat", "ChangeNOW", "Binance", "Bybit", "OKX", "Kucoin", "Gate.io", "9Wz2n", "66pPj", "5VC9e", "AC56n", "ASTy", "36vC", "2AQp", "H8sR", "6a7S2"];

bot.onText(/\/test (.+)/, async (msg, match) => {
    const testMint = match[1];
    bot.sendMessage(msg.chat.id, `🧪 Deep Scanning Satoshi-logic...`);
    
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
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ Error."); }
});

async function checkIsCEX(wallet) {
    try {
        const sigsRes = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [wallet, { limit: 10 }]
        });
        const sigs = sigsRes.data.result || [];
        if (sigs.length === 0) return false;

        const genesis = sigs[sigs.length - 1];
        const fundTx = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [genesis.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        
        const logs = JSON.stringify(fundTx.data.result?.meta?.logMessages || "").toLowerCase();
        const funder = fundTx.data.result?.transaction?.message?.accountKeys[0]?.pubkey || "";
        
        return CEX_LIST.some(sig => funder.toLowerCase().startsWith(sig.toLowerCase()) || logs.includes(sig.toLowerCase()));
    } catch (e) { return false; }
}

async function performForensic(mint, devWallet, isManual = false) {
    try {
        // 1. Socials Check
        const asset = await axios.post(HELIUS_RPC, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        });
        const meta = JSON.stringify(asset.data.result || "").toLowerCase();
        const hasSocials = meta.includes("t.me/") || meta.includes("x.com/") || meta.includes("twitter.com/");

        // 2. DEEP CEX CHECK (Check Dev and his Funder)
        let isCEX = await checkIsCEX(devWallet);
        
        // Agar pehla wallet fail ho jaye, to Satoshi ke asli funder (4r33x) ko check karo
        if (!isCEX) {
            console.log("Checking secondary funder...");
            const sigs = await axios.post(HELIUS_RPC, {
                jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [devWallet, { limit: 5 }]
            });
            const firstTx = sigs.data.result[sigs.data.result.length - 1];
            const detail = await axios.post(HELIUS_RPC, {
                jsonrpc: "2.0", id: 1, method: "getTransaction",
                params: [firstTx.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
            });
            const secondaryFunder = detail.data.result.transaction.message.accountKeys[0].pubkey;
            isCEX = await checkIsCEX(secondaryFunder);
        }

        if (isCEX && (hasSocials || isManual)) {
            bot.sendMessage(TELEGRAM_CHAT_ID, `✅ *TEST PASSED*\nMint: \`${mint}\`\nFunding: *Deep Scan Verified* ✅`, {parse_mode: 'Markdown'});
        } else if (isManual) {
            bot.sendMessage(TELEGRAM_CHAT_ID, `❌ *TEST FAILED*\nSocials: ${hasSocials ? "✅" : "❌"}\nCEX: ❌ (Even after Deep Scan)`);
        }
    } catch (e) { }
}

function startRadar() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    ws.on('open', () => ws.send(JSON.stringify({ "method": "subscribeNewToken" })));
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
