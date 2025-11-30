export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname.split("/").filter(Boolean); 
        // ["password", "balance-update"]

        // Path must match: /<password>/balance-update
        const incomingPassword = path[0];
        const endpoint = path[1];

        if (endpoint === "balance-update" && request.method === "POST") {

            // --- PASSWORD IN PATH AS WISE DOES NOT SUPPORT QUERY STRINGS ---
            if (!incomingPassword || incomingPassword !== env.WEBHOOK_PASSWORD) {
                console.warn("Invalid webhook password in path");
                return new Response("Unauthorized", { status: 401 });
            }

            try {
                const data = await request.json();

                const webhookCurrency = data.data.currency;
                const webhookTransactionType = data.data.transaction_type;
                const webhookAmount = data.data.amount;

                if (
                    webhookTransactionType === "credit" &&
                    webhookCurrency === env.WISE_SOURCE_CURRENCY &&
                    webhookAmount >= Number(env.WISE_MINIMUM_DEPOSIT)
                ) {
                    console.log(`Amount $${webhookAmount} credited. Starting transfer...`);

                    ctx.waitUntil(handleTransfer(webhookAmount, env));
                } else {
                    console.log(
                        `Deposit of $${webhookAmount} ${webhookCurrency} ignored — does not meet criteria.`
                    );
                }

                return new Response("", { status: 200 });

            } catch (err) {
                console.error("Webhook error:", err);
                return new Response("Bad Request", { status: 400 });
            }
        }

        return new Response("Not Found", { status: 404 });
    }
};

/* -----------------------------
   RETRY FUNCTION
--------------------------------*/
async function retryFetch(url, options = {}, retries = 3) {
    let attempt = 0;

    while (true) {
        const res = await fetch(url, options);

        if (res.ok) return res;

        attempt++;

        if (attempt > retries) {
            const text = await res.text();
            throw new Error(`API error after retries: ${res.status} ${text}`);
        }

        const delay = 250 * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, delay));
    }
}

/* -----------------------------
   TRANSFER WORKFLOW
--------------------------------*/
async function handleTransfer(amount, env) {
    try {
        const profileId = await getProfile(env);
        const recipientId = await getRecipient(env);
        const quoteId = await getQuote(amount, profileId, env);
        await startTransfer(profileId, recipientId, quoteId, env);

        console.log("Transfer completed successfully.");

    } catch (err) {
        console.error("Transfer error:", err);
    }
}

/* -----------------------------
   API: Get Profile
--------------------------------*/
async function getProfile(env) {
    const url = `${env.WISE_API_URL}/v1/profiles`;

    const res = await retryFetch(url, {
        headers: { Authorization: `Bearer ${env.WISE_API_TOKEN}` }
    });

    const profiles = await res.json();
    const personal = profiles.find(p => p.type === "personal");

    if (!personal) throw new Error("No personal profile found");
    return personal.id;
}

/* -----------------------------
   API: Get Recipient
--------------------------------*/
async function getRecipient(env) {
    const url = `${env.WISE_API_URL}/v1/accounts?currency=${env.WISE_TARGET_CURRENCY}`;

    const res = await retryFetch(url, {
        headers: { Authorization: `Bearer ${env.WISE_API_TOKEN}` }
    });

    const accounts = await res.json();
    const account = accounts.find(
        a => a.details.accountNumber === env.WISE_TARGET_ACCOUNT_NUMBER
    );

    if (!account)
        throw new Error(`Recipient not found: ${env.WISE_TARGET_ACCOUNT_NUMBER}`);

    console.log(`Found recipient ${account.accountHolderName}`);
    return account.id;
}

/* -----------------------------
   API: Get Quote
--------------------------------*/
async function getQuote(amount, profileId, env) {
    const body = {
        sourceCurrency: env.WISE_SOURCE_CURRENCY,
        targetCurrency: env.WISE_TARGET_CURRENCY,
        sourceAmount: amount,
        targetAmount: null,
        payOut: "BANK_TRANSFER",
        preferredPayIn: "BALANCE"
    };

    const url = `${env.WISE_API_URL}/v3/profiles/${profileId}/quotes`;

    const res = await retryFetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.WISE_API_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    const quote = await res.json();
    const balanceOption = quote.paymentOptions.find(o => o.payIn === "BALANCE");

    if (!balanceOption)
        throw new Error("No BALANCE payment option available");

    console.log("Quote received", {
        rate: quote.rate,
        fee: balanceOption.fee.total,
        targetAmount: balanceOption.targetAmount
    });

    return quote.id;
}

/* -----------------------------
   API: Start Transfer
--------------------------------*/
async function startTransfer(profileId, recipientId, quoteId, env) {
    const transferData = {
        targetAccount: recipientId,
        quoteUuid: quoteId,
        customerTransactionId: crypto.randomUUID(),
        details: {
            reference: "Salary",
            transferPurpose: "Salary",
            transferPurposeSubTransferPurpose: "Salary",
            sourceOfFunds: "Salary"
        }
    };

    const transferRes = await retryFetch(
        `${env.WISE_API_URL}/v1/transfers`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.WISE_API_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(transferData)
        }
    );

    const transfer = await transferRes.json();
    const transferId = transfer.id;

    const fundRes = await retryFetch(
        `${env.WISE_API_URL}/v3/profiles/${profileId}/transfers/${transferId}/payments`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.WISE_API_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ type: "BALANCE" })
        }
    );

    const fundJson = await fundRes.json();
    console.log("Funding complete:", fundJson.status);
}
