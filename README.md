# SUCCESS SKILL — deployment starter

A React + Supabase eBook storefront with Razorpay Standard Checkout in Test Mode, server-side order creation, Checkout signature verification, raw-body webhook verification, and private eBook downloads.

## Important compliance and scope
This starter intentionally does **not** implement commissions for recruiting people, joining, paying a registration fee, or buying rank upgrades. A ₹600 label or an eBook by itself does not make recruitment-linked rewards lawful. The commission setting is disabled and 0% by default. Have an Indian lawyer review the actual product, retail-sales process, refund policy, compensation plan, disclosures, and direct-selling obligations before activating commissions or taking public orders. Rank labels are displayed, but automatic rank qualification is deliberately not implemented: define rank criteria based on genuine verified retail sales only after legal review.

## 1. Create Supabase project
1. Visit https://supabase.com and create a project.
2. Open **SQL Editor → New query**.
3. Paste and run `supabase/schema.sql`.
4. Open **Project Settings → API**. Copy Project URL and anon/public key.
5. In this folder, copy `.env.example` to `.env` and fill in:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Never put the service-role key in `.env` or frontend code.

## 2. Run locally
Install Node.js LTS from https://nodejs.org, then in this folder:
```bash
npm install
npm run dev
```
Open the local URL printed by Vite.

## 3. Create the admin account
1. Sign up on your site using your own email.
2. Confirm the email if Supabase email confirmation is enabled.
3. In Supabase SQL Editor run:
```sql
update public.profiles set role='admin' where email='YOUR-ADMIN-EMAIL';
```
4. Sign out and sign in again. The admin order-verification panel will appear.

## 5. Configure Razorpay Test Mode (required before checkout)

1. Create/activate your Razorpay account and complete the provider's required verification.
2. In the Razorpay Dashboard, switch to **Test Mode** and generate a Test Key ID and Test Key Secret. The source contains placeholders only; no API keys are included.
3. In Supabase → SQL Editor, run `supabase/migrations/20261119_razorpay.sql` if this is an existing project. For a brand-new project, run the updated `supabase/schema.sql` instead.
4. In Supabase → Edge Functions → Secrets (or using the CLI), set these server-side secrets:

```bash
supabase secrets set RAZORPAY_KEY_ID=rzp_test_REPLACE_WITH_YOUR_KEY_ID
supabase secrets set RAZORPAY_KEY_SECRET=REPLACE_WITH_YOUR_TEST_KEY_SECRET
supabase secrets set RAZORPAY_WEBHOOK_SECRET=REPLACE_WITH_YOUR_WEBHOOK_SECRET
```

Use the exact test key values from your own Razorpay Dashboard. `RAZORPAY_WEBHOOK_SECRET` is a secret you choose when creating the webhook in Razorpay; it is not your API Key Secret. Never put any of these secrets in Vercel frontend environment variables, React code, GitHub, or `.env`.

5. Deploy all four functions:

```bash
supabase functions deploy download-ebook
supabase functions deploy create-razorpay-order
supabase functions deploy verify-razorpay-payment
supabase functions deploy razorpay-webhook
```

6. In Razorpay Dashboard → Account & Settings → Webhooks, add this URL (replace the project ref):

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/razorpay-webhook
```

Set the same webhook secret as `RAZORPAY_WEBHOOK_SECRET` and subscribe to **`payment.captured`**. Save the webhook. Enable automatic payment capture in Razorpay (recommended) so successful payments reach the captured state.

## 6. Checkout and payment security

- The customer clicks **Buy eBook · ₹600** and signs in first.
- `create-razorpay-order` authenticates the Supabase user, reads the active product from the database, enforces ₹600, creates the local pending order, and creates a Razorpay order for **60000 paise / INR**. The browser cannot choose the amount.
- Razorpay Checkout receives the server-created order ID and the public Key ID. The Key Secret is never sent to the browser.
- `verify-razorpay-payment` looks up the local order belonging to the signed-in buyer, verifies the HMAC-SHA256 Checkout signature using the order ID stored by the server, then calls Razorpay's API and requires the payment to be **captured**, INR, and exactly 60000 paise.
- `razorpay-webhook` verifies `X-Razorpay-Signature` against the **exact raw request body** using the webhook secret. Only a valid `payment.captured` event for a matching ₹600 INR order marks it paid. Duplicate webhook deliveries are safe to retry.
- Both successful server verification paths mark the order `paid` and `retail_verified`; the existing direct-sale commission trigger remains one-level and disabled by default.
- `download-ebook` checks the authenticated user's verified paid order before issuing a short-lived signed URL from the private `ebooks` bucket. A browser success callback alone never unlocks the PDF.

The webhook is the server-to-server fallback if the customer closes the browser or loses connection after paying. In Razorpay Test Mode, use the test payment details shown in Razorpay's official documentation/Dashboard; do not make real payments while testing. Before launch, test successful capture, failed payment, checkout dismissal, duplicate webhook delivery, and download denial for an unpaid account.

## 7. Upload the eBook securely

1. In Supabase → Storage, create a **private** bucket named `ebooks`.
2. Upload your PDF (for example `success-skill.pdf`).
3. In SQL Editor, set the product's `storage_path` to the exact object path:

```sql
update public.products
set storage_path='success-skill.pdf'
where title='SUCCESS SKILL eBook';
```

4. Keep the bucket private. The download Edge Function creates a 120-second signed URL only after a verified paid order.

## 8. Deploy to Vercel

1. Push this project to a private GitHub repository.
2. Import it in Vercel.
3. Add only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel project settings.
4. Deploy. Vercel provides a free `*.vercel.app` address on its free tier, subject to its current plan limits.

## 9. Commission configuration
The database trigger creates a direct commission only if:
- an order is marked `paid`,
- an admin sets `retail_verified=true`,
- the buyer has a referrer,
- the commission plan is explicitly enabled and a rate above zero is configured.

It is not multi-level. It does not pay for recruitment, paid upgrades, or rank changes. Do not set a rate or enable the plan until a qualified Indian legal professional has reviewed the exact plan and the sales are genuine retail sales. Example SQL (illustrative only):
```sql
update public.commission_settings
set direct_sales_rate=5, enabled=true
where id=1;
```

## 10. Security checklist before launch
- Enable email confirmation and configure SMTP in Supabase.
- Set strong password and rate-limit policies.
- Test RLS using customer and admin accounts.
- Keep the eBook bucket private.
- Add a refund/cancellation workflow and monitor Razorpay webhook delivery; update the order/refund state for refunds before granting future downloads.
- Add privacy policy, terms, refund policy, contact details, seller identity, product description, invoice/tax treatment, and customer support.
- Have the Indian direct-selling and consumer-law review completed.
- Do not promise income or earnings.

## 11. Known starter limitations
- Razorpay Test Mode integration is included; switch to live keys only after successful end-to-end testing and provider approval.
- No withdrawal/payout feature.
- No multi-level or recruitment commission.
- Rank labels are shown, but rank qualification rules are not automated.
- Admin product editing is currently done through Supabase dashboard/SQL.
