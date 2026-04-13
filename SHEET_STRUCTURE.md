# Google Sheet Structure Guide
## Infrasity Sales Dashboard — Expected Tab Names & Columns

The sync script reads specific tabs from your sheet. Tab names are **case-insensitive** and **fuzzy-matched** — 
"Email Volume", "email vol", or "EmailVolume" all work. Any tab NOT matched to a known type is 
auto-detected as a campaign tab and added to YAMM Campaigns automatically.

---

## Tab 1: Email Volume
**Matched by:** "email volume", "email vol"

| Column A | Column B | Column C |
|----------|----------|----------|
| Period | Emails Sent | Meetings |
| Mar10–Apr7 | 910 | 2 |
| Apr8–21 | 850 | 3 |

---

## Tab 2: LinkedIn
**Matched by:** "linkedin", "li", "linkedin volume"

| Column A | Column B | Column C |
|----------|----------|----------|
| Period | Messages | Type |
| Mar10–Apr7 | 399 | Mixed |
| Apr8–21 | 450 | First Pitch |

---

## Tab 3: Verticals
**Matched by:** "verticals", "vertical performance"

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Vertical | Open Rate | Click Rate | Meetings | Status | Channel | Notes |
| UK Agents | 68 | 17 | 0 | pending | YAMM | Chase now |
| IAC / FinOps | 65 | — | 3 | done | YAMM+Apollo | Amnic converted |

**Status values:** `done` / `pending` / `stalled` / `dead`
Click Rate can be blank or `—` for null.

---

## Tab 4: YAMM
**Matched by:** "yamm", "campaigns", "mail merges"

| A | B | C | D | E |
|---|---|---|---|---|
| Campaign Name | Date | Sent | Open Rate | Click Rate |
| Email Sheet – YC 26 Reachout | Apr 7 | 53 | 66 | 6 |
| 8th April | Apr 9 | 42 | 62 | 5 |

---

## Tab 5: Email Pitches
**Matched by:** "email pitches", "pitch analysis", "q1 email pitch"

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| ID | Vertical | Subject | Readability | Skimmability | Actionability | Meeting Prob | Verdict |
| P1 | Recently Funded | Developers won't find... | 7 | 6 | 7 | 7 | strong |
| P13 | Brevo Alt | What shows up when... | 8 | 8 | 8 | 8 | strong |

**Verdict values:** `strong` / `average` / `rework`

---

## Tab 6: LinkedIn Pitches
**Matched by:** "linkedin pitches", "li pitches"

Same columns as Email Pitches. Columns D/E/F map to Tone/Clarity/Personalisation.

---

## Tab 7: Hyper Personal
**Matched by:** "hyper", "hyper personal", "personalised"

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Company | Contact | Date | Signals Used | Ref Used? | Asset Attached? | Outcome | Notes |
| Keploy | Neha | Apr 10 | Hiring DevRel + Reddit threads | Yes | Yes | Meeting Booked | Pratham intro |

**Outcome values:** `Meeting Booked` / `Replied` / `Sent` / `Ghosted`
**Ref Used / Asset Attached:** `Yes` or `No`

---

## Auto-detected Campaign Tabs
Any tab whose name doesn't match the 7 types above is auto-scanned for campaign data.
The sync script looks for columns containing "open", "click", "sent" in the headers.
If found, it aggregates the data and adds it to YAMM Campaigns automatically.

**Example:** A tab named "Keploy - Apr 12" with columns [Prospect | Email | Merge Status | Open | Clicked]
will be auto-added as a YAMM campaign entry with name "Keploy - Apr 12".

---

## Making the Sheet "Public Read"
For the service account to access it, do ONE of:

**Option A — Share with service account email (Recommended):**
1. Open your Google Sheet
2. Click Share
3. Add the service account email (from service-account.json, field "client_email")
4. Set permission to "Viewer"
5. Click Send

**Option B — Make sheet publicly viewable:**
1. Click Share → "Change to anyone with the link"
2. Set to "Viewer"
3. This is less secure but works without a service account
