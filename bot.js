require('dotenv').config();
const axios = require('axios');

const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

// Forensic List
const TEST_TOKENS = [
    "7voyyzYZVgZSmpzVqVZekmyZMtz1u7Cn29b84bVpump",
    "ACtfUWtgvaXrQGNMiohTusi5jcx5RJf5zwu9aAxkpump",
    "BFiGUxnidogqcZAPVPDZRCfhx3nXnFLYqpQUaUGpump",
    "GRMRCsJJEEYXChrSDGaAsuK3W8YooF2R69GcdCXDpump",
    "kLqMvUm1p4pRbxU4r8kWCTVAuWMJLtcTJqGb4b5pump",
    "DiNCVMS3GRSxrWSC4REh7VZeppQ3DEkx8UjJt4u94nHR",
    "3vvDYGkavdt1FNoUw1r5YxDTA6SrWRbHtUV72Ltkpump"
];

async function runPerfectedTest() {
    console.log("🚀 STARTING JUNNI'S PERFECTED FORENSIC TEST...\n");

    for (let mint of TEST_TOKENS) {
        try {
            console.log(`🔍 Analyzing: ${mint}`);

            // STEP 1: Get Asset via Helius (Metadata + Creator)
            const assetRes = await axios.post(HELIUS_RPC_URL, {
                jsonrpc: "2.0",
                id: "get-asset",
                method: "getAsset",
                params: { id: mint }
            });

            const asset = assetRes.data.result;
            if (!asset) {
                console.log("   ❌ Error: Token not found on-chain yet.\n");
                continue;
            }

            // Correct Logic to find Creator and Socials
            const creator = asset.authorities?.[0]?.address || asset.creator?.address || "Unknown";
            const metadata = asset.content?.metadata || {};
            
            // Helius metadata links usually inside 'links' or 'attributes'
            const hasSocials = asset.content?.links?.twitter || asset.content?.links?.website || asset.content?.links?.telegram || false;

            console.log(`   ├ Dev Address: ${creator}`);
            console.log(`   ├ Socials Detected: ${hasSocials ? "✅ YES" : "❌ NO"}`);

            // STEP 2: Deep Forensic based on Wallet Transaction Signatures
            const forensic = await performDeepForensic(creator);
            
            const finalResult = (hasSocials && forensic.isClean) ? "✅ ELITE PASS" : "❌ REJECTED";
            console.log(`   └ Forensic Result: ${finalResult} (${forensic.source})\n`);

        } catch (err) {
            console.log(`   ❌ Error: ${err.message}\n`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
}

async function performDeepForensic(walletAddr) {
    if (walletAddr === "Unknown") return { isClean: false, source: "Incomplete Data" };
    
    try {
        const sigRes = await axios.post(HELIUS_RPC_URL, {
            jsonrpc: "2.0", id: "sigs",
            method: "getSignaturesForAddress",
            params: [walletAddr, { limit: 20 }]
        });
        const sigs = sigRes.data.result || [];
        
        // RULE: Professional Devs use fresh wallets (Max 10 signatures)
        if (sigs.length > 0 && sigs.length <= 12) {
            return { isClean: true, source: "Fresh/Elite Wallet" };
        }
        return { isClean: false, source: `Dirty Wallet (${sigs.length} TXs)` };
    } catch (e) { return { isClean: false, source: "Scan Fail" }; }
}

runPerfectedTest();
