# AdaguTrackerPro — User Manual

This guide is for counter staff and the shop owner. It walks through AdaguTrackerPro the way the screens are laid out: sign in, set up the shop, then run pledge loans and monthly gold savings.

Dates in the app look like **9 Oct 2026** (day, 3-letter month, year). Gold weights show three decimals.

## The example used in this guide

Every number below is the same sample, so the steps match each other. Your own receipts, rates, and accounts will differ.

| Item | Sample |
| --- | --- |
| Shop | Amman Jewellers |
| Customer | Meenakshi S, mobile 9876543210 |
| Adagu receipt | `ADG0001`, sanctioned 9 Oct 2026 |
| Jewellery | One 22K chain, net weight 10.000 g |
| Gold rate that day | Rs. 7,000 / g |
| Assessed value | Rs. 70,000 (10.000 g × Rs. 7,000) |
| Loan | Rs. 50,000 (under the 75% limit of Rs. 52,500) |
| Monthly interest | 2.1%, which is Rs. 1,050 on this loan |
| Scheme | `GS-001`, Swarna Sembu 11 |
| Installment | Rs. 7,000 a month for 11 months, 22K |
| Account | `GS-202610-0001`, enrolled 9 Oct 2026 |
| First collection | Rs. 7,000 at Rs. 7,000 / g = **1.000 g**, receipt `GSR-2026-0001` |
| Maturity payout | 11.300 g × Rs. 7,500 / g = **Rs. 84,750** in cash |

The 11.300 g in the payout row is 10.800 g accumulated plus a 0.500 g bonus for paying all 11 installments. The payout is always **grams × the gold rate that day**. The shop pays cash, UPI, or a bank transfer. It does not hand over gold or jewellery, and it does not raise a bill.

---

## 1. What this app does

AdaguTrackerPro runs two parts of the shop:

- **Adagu** — a pledge loan. You record the jewellery, sanction a loan, collect monthly interest, add extra cash, renew, redeem and return the gold, or send the loan to auction.
- **Gold Savings** — a monthly scheme. The customer pays installments, gold grams accumulate, and at the end you pay the value out in money.

There is no cash bill, tax invoice, stock, or old-gold purchase in this app.

A new install also asks an administrator to enter the shop name before anyone can work. Those details print on receipts and passbooks.

---

## 2. First day

### Sign in

1. Open the app. The title is your shop name, or **AdaguTrackerPro** until the shop is set up.
2. Enter **Username** and **Password**.
3. Click **Sign in**.

The first account is username `admin` and password `admin123`. On the first sign-in the app asks for a new password. Change it before anyone else uses the computer.

### Change password

1. On **Change password**, the screen says **You must set a new password before continuing.**
2. Fill **Current password**, **New password**, and **Confirm new password**.
3. Click **Save password**.

### Set up your shop

If the shop name is still empty, the next screen is **Set up your shop**. These details print on pledge receipts and gold savings documents.

An administrator fills:

| Field | Required |
| --- | --- |
| **Shop name** | Yes |
| **Phone** | Yes |
| **Address** | Yes |
| **Address line 2** | No |
| **City** | Yes |
| **State** | No |
| **Pincode** | No |
| **Upload logo** | No. PNG or JPG, up to 2MB. After a logo is chosen the button reads **Change logo**. |

Click **Save and continue**. The app opens the Dashboard.

A staff user who is not an administrator sees **Ask an administrator to enter the shop details before continuing.** and can only click **Sign out**.

To change the name, phones, address, logo, or the extra print lines later, go to **Settings → Adagu Settings → Shop Identity** and click **Save Changes**.

### Sign out

**Sign out** is at the bottom of the left sidebar.

---

## 3. Getting around

The left sidebar is the same on every page. A user only sees the items an administrator has allowed.

| Sidebar | What it is for |
| --- | --- |
| **Dashboard** | Today's totals and shortcuts |
| **Adagu** | Pledge receipts and a new loan |
| **Gold Savings** | Schemes, enrollments, collections, and payout |
| **Dues** | Interest, extra cash, redeem, renew, and auction |
| **Customers** | Names, phones, and each customer's loans and schemes |
| **Reports** | Adagu and customer lists you can export |
| **Gold & Silver Rates** | The daily rates used for valuation and payout |
| **Users** | Administrators only. Staff logins and what each person can open |
| **Settings** | Shop identity, Adagu rules, printers, and backup |

**Adagu** has two tabs: **Receipts** and **New Adagu**.

**Gold Savings** has nine tabs: **Dashboard**, **Schemes**, **Enroll**, **Accounts**, **Collections**, **Ledger**, **Maturity**, **Overdue**, and **Reports**.

---

## 4. Start of day — gold and silver rates

Set the rate before you sanction a loan or collect a gold savings installment. The app uses the rate in force on the date of the transaction.

1. Open **Gold & Silver Rates**.
2. Enter the day's rates. The cards are **24K GOLD**, **22K GOLD**, **20K GOLD**, **18K GOLD**, and the silver cards, plus the buy-rate cards such as **24K GOLD BUY**.
3. Click **Save rates**.

If a transaction uses a rate that is not dated on that day, an administrator has to accept it before the entry is saved.

For the sample, the 22K rate on 9 Oct 2026 is Rs. 7,000 / g.

---

## 5. Customers

Add the customer once. Adagu and Gold Savings both search this list.

1. Open **Customers**.
2. Click **Add customer** and save the name, mobile, and address.
3. The cards at the top show **Total Customers**, **Customers with Dues**, and **New Customers**.

Open a customer to see contact details, Adagu loans, gold savings accounts, and payment history. You cannot delete a customer who still has a gold savings account.

Sample customer: **Meenakshi S**, mobile **9876543210**.

---

## 6. Adagu — a new pledge

### Sanction the loan

1. Open **Adagu**, then **New Adagu**. The screen title is **Adagu Bill**.
2. Under **Borrower Details**, search for the customer or add one with **New**.
3. Under **Jewellery Details**, click **Add Item**. Enter the description, metal, purity, weights, and pieces. Add a photo if you have one.
4. Under **Loan Details**, enter **Loan Amount**. For the sample that is Rs. 50,000 against an assessed value of Rs. 70,000.
5. **Interest Rate (%)** is filled from settings and cannot be typed here. The note under the field says **Set in Settings → Billing POS**. Change the percentage under **Settings → Adagu Settings**, in **Adagu monthly interest (%)**, then save. The sample uses 2.1%, so monthly interest is Rs. 1,050.
6. Check **Due Date** and the **Calculated Summary**.
7. Click **Save draft** if you are not ready, or **Generate**.
8. On **Sanction loan**, confirm **Sanction loan**. The receipt number is assigned, starting at `ADG0001`.

**Preview** opens the pledge receipt. **PDF** saves a copy. **Back** returns to the list. **Reset** clears a draft you have not sanctioned. **Delete** removes a draft.

The receipt list (**Adagu → Receipts**) filters by **All**, **Draft**, **Active**, **Redeemed**, **Forfeited**, and **Renewed**, and by **Today**, **This month**, or **All**. **Forfeited** is a status you can filter. There is no **Forfeit** button. A loan reaches that state through auction. Active rows show the **live outstanding payoff** (principal, any extra loans, and interest to date), so the list always matches what the customer would pay today.

To open a loan again, use **Adagu → Receipts** and open that row. That opens the same **Adagu Bill**.

### While the loan is active

On an active loan the editor shows **Renew**, **Auction notice**, **Record auction**, and **Collect / Redeem**.

Day-to-day collections are easier from **Dues**, in the next section. The same actions exist in both places.

**Collect / Redeem** on the bill offers:

- **Record collection** for a partial payment.
- **Full redeem** to close the loan and return the gold. **Fill payoff** fills the amount still due.

---

## 7. Dues — interest, extra cash, redeem, renew, auction

Open **Dues**. The title is **Adagu Dues**. The cards are **Adagu Outstanding**, **Active Loans**, **Interest Overdue**, and **Today's Collections**.

Filters: **All**, **Interest due**, **Active**, **Notice sent**, **Auctioned**, **Reminders**, and **Closed**.

Click **View** on a row. The drawer is where you work on that loan. To open the full bill, go to **Adagu → Receipts** and open the receipt (for the sample, `ADG0001`).

### Collect monthly interest

1. Filter **Interest due**, or find the loan and click **View**.
2. Click **Interest**. The window title is **Collect interest · ADG0001**.
3. Check the amount and the payment mode, then click **Record collection**.

For the sample, one month of interest is Rs. 1,050.

**Reminders** lists loans that need a call. Each row can open WhatsApp with the reminder message from Settings, and offers **Collect interest**.

### Add extra cash

1. **View** the active loan.
2. Click **Extra**. The window is **Extra loan · ADG0001**.
3. Enter the extra amount and click **Add extra**.

The extra amount plus the principal still owed must stay inside the shop's LTV limit. If it is above the limit the window says so; an administrator can tick **Allow above LTV** to go ahead anyway.

### Renew

1. **View** the loan, or open it from **Receipts**.
2. Click **Renew**. The window is **Renew loan · ADG0001**.
3. The window shows the **new ticket rate** (the shop's current rate from Settings) and, when it differs, the old ticket's rate.
4. Click **Renew loan**.

The old receipt becomes **Renewed** and is closed on the renewal date. The new receipt is a new `ADG` number and charges the shop's current rate. The principal carried across is not counted as money collected. A **Renewal ticket** print opens when the renewal is saved from Dues. As with an extra loan, a renewal above the LTV limit needs **Allow above LTV** (administrators only).

### Redeem and return the gold

1. **View** the loan.
2. Click **Redeem**. The window is **Close Adagu loan · ADG0001**.
3. Change the **close date** if the customer is settling on an earlier day — the payoff follows that date.
4. Click **Full redeem** when the customer is paying everything due. **Record collection** is the partial option in the same window.
5. After the loan is **Redeemed**, click **Release receipt** to print the gold release.

### Auction

1. **View** the loan.
2. Click **Notice**. The window is **Auction notice · ADG0001**. Click **Send notice**.
3. **Print notice** appears after a notice date is saved. It prints the auction notice.
4. When the auction happens, click **Auction**. The window is **Record auction · ADG0001**.
5. Choose **Outside buyer** or **Shop takes the gold**. If the sale does not cover the balance, you can tick **Write off the … shortfall**.
6. Click **Record auction**.

The list filter **Auctioned** shows these loans. **Forfeited** on the Adagu receipt list is the closed status after the gold is no longer with the customer.

Interest stops on the auction date, so a shortfall does not grow. If you left the shortfall open (you did not write it off), a **Collect shortfall** button appears on the forfeited loan in Dues. Record what the customer pays; the loan stays **Forfeited** and the balance clears.

### Undo the last payment (administrator)

1. **View** the loan and scroll to **Payment history**.
2. Click **Undo last payment** and confirm.

Only the latest payment on an **Active** or **Redeemed** loan can be undone, and only by an administrator. Undoing a redemption puts the loan back on the books. Payments that are part of a renewal, transfer or auction, and payments on a renewed loan, cannot be undone.

---

## 8. Gold Savings

Open **Gold Savings**. Work across the nine tabs in this order the first time: set a scheme, enroll, collect each month, follow up if someone is late, then pay out at maturity.

### Create a scheme (administrator)

1. Open **Schemes**. The title is **Scheme configuration**.
2. Click **New scheme**. Only an administrator sees this button.
3. Save the name, monthly amount, duration, purity, bonus, grace period, late fee, and cancellation rules.
4. **Activate** the scheme. **Edit** and **Deactivate** are on the same row.

Sample scheme: **Swarna Sembu 11**, code `GS-001`, Rs. 7,000 a month, 11 months, 22K, bonus 0.500 g when all 11 installments are paid.

Staff can open **Schemes** to read the rules. They cannot add or change a scheme.

### Enroll a customer

1. Open **Enroll**. The title is **Enroll customer**.
2. Choose the customer and the scheme. Set **Enrollment date** (9 Oct 2026 in the sample).
3. Accept the terms. Collect the first installment if that option is ticked.
4. Click **Create scheme account**.
5. On **Confirm enrollment**, click **Enroll**.
6. **Enrollment receipt** prints the passbook. The account number for the sample is `GS-202610-0001`.

The first collection, if you take it now, is Rs. 7,000. At Rs. 7,000 / g that credits **1.000 g**, receipt `GSR-2026-0001`.

### Collect the next installment

1. Open **Collections**. The title is **Monthly collections**.
2. Select the account and click **Collect next installment**.
3. In **Collect payment**, check the amount, the rate, and any late fee, then click **Record payment**.
4. **Collection receipt** opens for printing.

You can also click **Collect payment** on the account itself (**Accounts**, then the account).

Gold credited is the amount paid divided by the gold rate for that date. A later month at a higher rate credits fewer grams for the same rupees.

### The account

**Accounts** lists every scheme account. Open one to see:

| Tab | What it shows |
| --- | --- |
| **Overview** | Paid installments, gold so far, and the bonus rule |
| **Installments** | The schedule. An administrator can **Waive** an installment |
| **Payments** | Each receipt. An administrator can **Reverse** a posted payment |
| **Gold ledger** | Grams credited and paid out |
| **Maturity** | **Open maturity**, which jumps to the payout screen for this account |
| **Audit** | Who changed the account |

**Print passbook** reprints the passbook. **Cancel** (administrator only) opens **Cancel scheme account**. Confirm **Cancel account & refund**. The **Cancellation refund voucher** prints for the customer. The refund follows the scheme's cancellation deduction.

### Ledger and overdue

**Ledger** is the scheme ledger across accounts. Filter **All**, **Payment**, **Reversal**, **Bonus**, **Redemption**, or **Posted**. **Export** and **Print passbook** are on this screen.

**Overdue** (**Overdue aging**) groups late installments. Filter **All** or a day bucket such as **1-7 days**. **Print call list** prints the follow-up list. **Export CSV** downloads it. A row can open WhatsApp for that customer.

### Pay out at maturity

Redemption in this app is a money payout. The screen says no gold, jewellery, or bill is issued.

1. Open **Maturity**. The title is **Maturity & payout**. You can also use **Open maturity** on the account.
2. Select the account. Check **Amount paid**, **Accumulated gold**, **Applicable bonus**, and **Total eligible gold**.
3. In **Payout**, check **Payout date** and **Gold rate (per g)**.
4. Leave **Gold weight (blank = full eligible)** empty to pay the full balance. Type a weight only for a partial payout, and only if the scheme allows it.
5. Choose **Payment mode**: **Cash**, **UPI**, or **Bank transfer**. For UPI or bank, fill **Transaction reference**.
6. The line under the fields is the sum: gold × rate. For the sample that is 11.300 g × Rs. 7,500 = Rs. 84,750.
7. Click **Pay out ₹84,750.00** (the button shows the live amount).
8. On **Confirm payout**, click **Pay out**.
9. **Payout voucher** opens. Print it for the customer to sign.

A full payout closes the account. The rate must be the rate for the payout date, unless an administrator accepts an older rate.

### Gold Savings reports

Open the **Reports** tab inside Gold Savings (not the sidebar **Reports**). Pick a report, set the dates or scheme, and click **Export CSV**.

- Daily collections
- Monthly collections
- Customer ledger
- Scheme performance
- Active schemes
- Matured schemes
- Overdue installments
- Overdue aging
- Cancelled schemes
- Gold accumulation
- Redemption history
- Outstanding obligations

**Redemption history** includes the payout amount and the payment mode.

The Gold Savings **Dashboard** (**Monthly Gold Savings**) shows collections, overdue aging, and accounts coming due. **Enroll customer** and **Collect payment** are the two shortcuts there.

---

## 9. Dashboard

**Dashboard** is the home screen. The search box finds pledges and customers. The bell lists pledges that need attention, and Gold Savings alerts when that module is available.

| Card | Meaning |
| --- | --- |
| **Total Customers** | Every customer, with how many were added in the last 7 days |
| **Active Pledges** | Loans that are still open, with how many were started in the last 7 days |
| **Today's Pledges** | Pledges dated today, and their loan value |
| **Due Soon** | Open loans whose repayment date falls in the next 30 days |
| **Overdue** | Open loans whose repayment date has passed |

**New Customer** opens the customer form. **New Pledge** opens a new Adagu loan.

**Attention Required (Due Soon & Overdue)** lists those loans. The customer name opens the pledge. Overdue rows are marked **Overdue**; loans still inside the 30-day window are marked **Active**.

---

## 10. Reports

Sidebar **Reports** is for Adagu and customers. It opens on **Active Pledges**.

Two menus sit at the top. The labels are **Adagu / Pledge** and **Customer** (shortened from **Adagu / Pledge Reports** and **Customer Reports**).

**Adagu / Pledge**

- Active Pledges
- Closed Pledges
- Due / Overdue Pledges
- Customer-wise Pledges
- Pledge Transactions
- Adagu Interest Income
- Adagu Collections by Mode
- Adagu Discounts
- Adagu Auctions

**Customer**

- Customer List
- Customer Outstanding

Use **From**, **To**, **As of**, or **Customer** when the report has those filters, then **Export CSV**.

---

## 11. Settings

**Settings** has four tabs: **Adagu Settings**, **Printers**, **Backup**, and **Data**.

### Adagu Settings

This tab has two cards.

**Shop Identity** — click **Save Changes** on this card.

- **Business details:** **Shop Name**, **GSTIN**, **Tagline**, **Phone 1**, **App subtitle**, **Phone 2**
- **Address:** **Address Line 1**, **Address Line 2**, **City**, **State**, **Pincode**
- **Print images and lines:** **Business Logo**, **Signature Image**, **BIS Logo**, **QR Code**, **Proprietor line 1**, **Proprietor line 2**, **Proprietor line 3**, **Promo line**
- **Gold Savings passbook:** **Passbook banner**, **Passbook side image**

**Adagu Settings** — the second card. Click **Save Changes** here too. **Test Print** opens a sample Adagu receipt so you can check the layout before a customer is waiting.

- **Pawnbroker licence no.**
- **Adagu LTV (% of assessed value)** — how much of the jewellery value you can lend. The starting value is 75%.
- **Adagu monthly interest (%)** — the rate copied onto each new loan. The starting value is 2.1%.
- **Auction notice period (days)**
- **Require KYC (Aadhaar or PAN) before sanctioning**
- **WhatsApp reminder message** — the text used from **Dues → Reminders**

### Printers

**Adagu receipt** sets the paper (**A5**, **A4**, or **Thermal 80mm**) and how many copies. Click **Save Changes**. Gold Savings vouchers print from the same preview window.

### Backup

**Database Backup** shows when the last copy was taken.

- **Back Up Now** writes a backup immediately.
- **Export Copy** downloads the database file.
- **Export Excel** downloads every table as a workbook you can read.
- **Restore from File** replaces the current data with a `.db` backup. Confirm **Restore** only when you mean to. A backup from the full JewelTrackerPro app can be restored here.

**Automatic backup** can be **Daily** or **Weekly**, at a time you choose. The app makes that copy when it is open, and catches up on the next launch if it was closed at the scheduled time. You can also point an extra copy at a USB drive or another folder so one copy is not only on this computer.

### Data

**Data** shows the app version, where the log folder is, and how many records are stored.

---

## 12. Users (administrator)

**Users** is only on an administrator's sidebar.

1. Under **Add New User**, enter **Username** and **Temporary Password**.
2. Set **Role** to **Staff** or **Admin**.
3. For a staff user, tick the areas they may open: **Dashboard**, **Adagu**, **Customers**, **Dues**, **Reports**, **Gold & Silver Rates**, **Settings**, and **Gold Savings**.
4. Click **Create user**.

The new person signs in with the temporary password and is sent to **Change password** before they can work.

The list filters are **All**, **Admin**, **Staff**, **Active**, and **Inactive**. On a user you can change which areas they can open, reset the password, or deactivate them. A deactivated user is signed out.

---

## 13. What you can print

Printing always opens a preview first. Use the system print dialog to print or save a PDF.

| When | What opens |
| --- | --- |
| **Preview** or **PDF** on an Adagu bill, the print icon on **Receipts**, or **Bill** on a dues row | Pledge receipt |
| **Release receipt** after a full redeem | Gold release receipt |
| **Print notice** after an auction notice | Auction notice |
| **Renew loan** from Dues | Renewal ticket |
| After **Enroll**, or **Print passbook** on an account or the ledger | Scheme passbook |
| After **Record payment** | Collection receipt |
| After **Pay out** | Payout voucher |
| After **Cancel account & refund** | Cancellation refund voucher |
| **Print call list** on **Overdue** | Overdue call list |
| **Test Print** in **Settings → Adagu Settings** | Sample Adagu receipt, with no customer |

---

## A normal counter day

1. Sign in. If you are the administrator on a new computer, finish **Set up your shop** first.
2. Open **Gold & Silver Rates** and click **Save rates**.
3. New loan: **Adagu → New Adagu → Generate → Sanction loan**, then print the receipt.
4. Interest: **Dues → View → Interest → Record collection**.
5. Customer paying off and taking the gold: **Dues → Redeem → Full redeem → Release receipt**.
6. Scheme installment: **Gold Savings → Collections → Collect next installment → Record payment**.
7. Scheme finished: **Gold Savings → Maturity → Pay out … → Pay out**, then print the **Payout voucher**.
