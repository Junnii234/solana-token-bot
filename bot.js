require('dotenv').config();
const axios = require('axios');

// API Configuration
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

// 🏆 VERIFIED MOON-TOKEN SIGNATURES (CEX & BRIDGES)
const CEX_SIGNATURES = [
    "9Wz2n", "66pPj", "5VC9e", "AC56n", "ASTy", "36vC", "2AQp", "H8sR", "6V9p",
    "FixedFloat", "ChangeNOW", "SideShift", "StealthEX", "SimpleSwap",
    "Binance", "Bybit", "OKX", "MEXC", "KuCoin", "Bitget", "Gate.io"
];

/**
 * PHASE 1 & 2: DEV-FIRST FORENSIC ENGINE
 */
async function performEliteForensic(mint) {
    try {
        console.log(`\n-----------------------------------------`);
        console.log(`🔍 SCANNING: ${mint}`);

        // --- STEP 1: DEV WALLET & GENESIS TRACE (PHASE 1) ---
        const sigsRes = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [mint]
        });
        
        if (!sigsRes.data.result || sigsRes.data.result.length === 0) return { isElite: false, reason: "No Txs Found" };

        const launchTxSig = sigsRes.data.result[sigsRes.data.result.length - 1].signature;
        const txDetails = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [launchTxSig, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        
        const dev = txDetails.data.result.transaction.message.accountKeys[0].pubkey;

        // Trace Funding (Genesis)
        const walletSigs = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [dev, { limit: 1000 }]
        });
        
        const genesis = walletSigs.data.result[walletSigs.data.result.length - 1];
        const walletAgeMins = (Date.now() / 1000 - genesis.blockTime) / 60;

        const fundTx = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getTransaction",
            params: [genesis.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]
        });
        
        const funder = fundTx.data.result.transaction.message.accountKeys[0].pubkey;
        const logs = JSON.stringify(fundTx.data.result.meta.logMessages || "").toLowerCase();

        // Check CEX/Bridge Pattern
        const isCEX = CEX_SIGNATURES.some(sig => funder.startsWith(sig) || logs.includes(sig.toLowerCase()));
        
        // 🛡️ DEV-FIRST FILTER: Agar funding kharab hai aur wallet naya hai, to yahin stop
        if (!isCEX && walletAgeMins < 1440) {
            console.log(`   ❌ DEV REJECTED: Internal Funding & New Wallet (${walletAgeMins.toFixed(0)}m)`);
            return { isElite: false, reason: "Risky Dev Funding" };
        }

        console.log(`   ✅ DEV PASSED: ${isCEX ? 'CEX Funded' : 'Old Wallet (' + walletAgeMins.toFixed(0) + 'm)'}`);

        // --- STEP 2: SOCIAL DETECTION (PHASE 2 - ONLY IF DEV PASSED) ---
        // Give a small delay for metadata indexing if needed
        const assetRes = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint }
        });
        
        const fullDump = JSON.stringify(assetRes.data.result).toLowerCase();
        const hasTG = fullDump.includes("t.me/") || fullDump.includes("telegram.me/");
        const hasX = fullDump.includes("twitter.com/") || fullDump.includes("x.com/");
        const webMatch = fullDump.match(/https?:\/\/(?!(pump\.fun|ipfs|arweave|schema\.metaplex|github|w3\.org))[a-zA-Z0-9.-]+\.[a-z]{2,}/g);
        const hasWeb = webMatch && webMatch.length > 0;
        
        const socialScore = (hasTG ? 1 : 0) + (hasX ? 1 : 0) + (hasWeb ? 1 : 0);

        // --- STEP 3: FINAL VERDICT ---
        if (socialScore >= 1) {
            console.log(`   ✅ SOCIALS PASSED: TG:${hasTG?'Y':'N'} X:${hasX?'Y':'N'} Web:${hasWeb?'Y':'N'}`);
            console.log(`   🌟 FINAL VERDICT: ELITE PASS`);
            return { isElite: true, dev, age: walletAgeMins.toFixed(0), funding: isCEX ? "CEX" : "OLD" };
        } else {
            console.log(`   ❌ SOCIALS FAILED: No valid links found.`);
            return { isElite: false, reason: "No Socials" };
        }

    } catch (error) {
        console.log(`   ⚠️ Error processing ${mint.substring(0,8)}: ${error.message}`);
        return { isElite: false, error: error.message };
    }
}

// 🔄 LOOP ENGINE (Fix for Multiple Mints)
const TARGET_MINTS = [
    "34q2KmCvapecJgR6ZrtbCTrzZVtkt3a5mHEA3TuEsWYb",
    "BXnUS5vNFNvnjy2hLx6UCycgH5VvMw8HkC9qfae2pump",
    "NV2RYH954cTJ3ckFUpvfqaQXU4ARqqDH3562nFSpump",
    "Dfh5DzRgSvvCFDoYc2ciTkMrbDfRKybA4SoFbPmApump"
];

async function startBot() {
    console.log("🚀 MOON-TOKEN SNIPER ENGINE STARTED");
    for (const mint of TARGET_MINTS) {
        const result = await performEliteForensic(mint);
        // Yahan aap apni BUY logic add kar sakte hain: if(result.isElite) buy(mint);
    }
}

startBot();
