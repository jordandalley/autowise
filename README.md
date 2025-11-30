# AutoWise

AutoWise is a Cloudflare worker that listens for webhooks from Wise (formerly Transferwise) on updated balances.

Using source and destination currencies and a minimum updated balance amount, it will then produce API calls back to Wise to initiate a cross-currency transfer to a bank account of your choosing.

# Implementation

*** I highly recommend testing this with the Wise sandbox first, to test all is good: https://sandbox.transferwise.tech/ ***

Step 1 - Creating an API token:

1. Login to Wise, go to your profile, click 'Integrations and tools' then 'API tokens'
2. Click 'Add new token'

Step 2 - Create a target account:

1. Login to Wise, and go to 'Recipients'
2. Click 'Add Recipient'
3. Add the target bank account and currency

Step 3 - Create Cloudflare Worker

1. Just create a generic worker, then edit the worker.js file and paste the contents.
2. Afterwards, add the following environmental variables

| Type | Name | Example Value | Description |
| :--- | :--- | :--- | :--- |
| Plaintext | WEBHOOK_PASSWORD | thisisapassword | Generate a password for the webhook |
| Secret | WISE_API_TOKEN | wfh93q4fnq4937n0q374q93d73q0294dn9082q | Your API token from Wise for initiating transfers |
| Plaintext | WISE_API_URL | https://api.transferwise.com | API endpoint for Wise |
| Plaintext | WISE_MINIMUM_DEPOSIT | 1000 | Minimum amount in whole numbers of the source currency required before initiating a transfer |
| Plaintext | WISE_SOURCE_CURRENCY | AUD | Name of the source currency to match |
| Plaintext | WISE_TARGET_CURRENCY | NZD | Name of the destination currency |
| Plaintext | WISE_TARGET_ACCOUNT_NUMBER | 012345678901234 | The target account number of the recipient created in step 2 |

3. Deploy the worker and take note of the URL.. usually something like https://app.account.workers.dev/

Step 4 - Creating the Webhook:

1. Login to Wise, go to your profile, click 'Integrations and tools' then 'Webhooks'
2. Click 'Create a new webhook' and give it a name
3. In the URL field, enter the URL as: `https://<worker url>/<webhook password>/balance-update` - eg: `https://autowise.youraccount.workers.dev/thisisapassword/balance-update`
4. Hit the 'Test webhook' button
5. If all good, then it should show tests as successful.
