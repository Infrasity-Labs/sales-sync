/**
 * INFRASITY SALES DASHBOARD — AUTO SYNC
 * ─────────────────────────────────────────────────────────────
 * Sheet: "Email Sheet -2026"
 * ID:     1o6C1Xhu_fXCVBFe2dKB0J_3svmy5TIHoyluKqTUmsuw
 *
 * CONFIRMED STRUCTURE:
 * ─ Sheet title: "Email Sheet -2026"
 * ─ Every tab = one campaign (no naming scheme)
 * ─ Tab names: "AI SRE", "8th April", "UK Agents 1", "SOBM",
 *   "Sheet10", "YC 26 Reachout march 30th", "Follow-up on: Eng Int" etc.
 * ─ Columns inside every tab (YAMM format):
 *     Prospect Name | Company Name | Email | [Pain Point] | [Competitor] | Merge Status
 *   Merge Status values: EMAIL_SENT, EMAIL_OPENED, EMAIL_CLICKED,
 *                        UNSUBSCRIBED, EMAIL_BOUNCED
 *
 * WHAT THIS DOES:
 * ─ Reads ALL tabs — each = 1 campaign
 * ─ Finds "Merge Status" column by scanning row 1 headers
 * ─ Computes sent/opened/clicked/openRate/clickRate per tab
 * ─ Detects vertical from tab name using keyword map
 * ─ Groups campaigns into verticals for performance matrix
 * ─ Writes dashboard/data/salesData.js
 * ─────────────────────────────────────────────────────────────
 */

const fs   = require("fs");
const path = require("path");

const SHEET_ID   = "1o6C1Xhu_fXCVBFe2dKB0J_3svmy5TIHoyluKqTUmsuw";
const OUTPUT     = path.join(__dirname, "../dashboard/data/salesData.js");
const LOG_FILE   = path.join(__dirname, "../logs/sync.log");

// ─── ZERO-AUTH PUBLIC SHEET ACCESS ────────────────────────────
// Sheet is public ("anyone with the link") — no credentials needed.
// Uses Google's public export endpoints instead of the Sheets API.

// ─── LOGGING ─────────────────────────────────────────────────
function log(msg) {
  const ts   = new Date().toLocaleString("en-GB", { timeZone: "Asia/Kolkata" });
  const line = `[${ts} IST] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch (_) {}
}

// ─── CSV PARSER ──────────────────────────────────────────────
function parseCSV(text) {
  if (!text || !text.trim()) return [];
  const rows = [];
  let current = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      current.push(field); field = "";
    } else if (ch === '\r' || ch === '\n') {
      current.push(field); field = "";
      rows.push(current); current = [];
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      field += ch;
    }
  }
  if (field || current.length > 0) {
    current.push(field);
    rows.push(current);
  }
  return rows;
}

// ─── GET ALL TAB NAMES (scrape from public spreadsheet page) ──
async function getAllTabs() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; InfrasitySync/1.0)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Failed to fetch spreadsheet page (${res.status})`);
  const html = await res.text();

  const tabs = [];
  const seen = new Set();

  // Google embeds tab data in the page's topsnapshot as JSON strings.
  // Format: [index,0,\"GID\",[{"1":[[0,0,\"TAB_NAME\"...
  // We walk the HTML looking for this pattern with escaped quotes.
  const GID_MARKER  = ',0,\\"';
  const NAME_MARKER = '0,0,\\"';
  let searchFrom = 0;

  while (true) {
    const pos = html.indexOf(GID_MARKER, searchFrom);
    if (pos === -1) break;

    const gidStart = pos + GID_MARKER.length;
    const gidEnd   = html.indexOf('\\"', gidStart);
    if (gidEnd === -1) { searchFrom = gidStart; continue; }

    const gid = html.substring(gidStart, gidEnd);
    if (!/^\d+$/.test(gid)) { searchFrom = gidEnd; continue; }

    // Tab name follows shortly after: 0,0,\"TAB_NAME\"
    const namePos = html.indexOf(NAME_MARKER, gidEnd);
    if (namePos === -1 || namePos - gidEnd > 100) { searchFrom = gidEnd; continue; }

    const nameStart = namePos + NAME_MARKER.length;
    const nameEnd   = html.indexOf('\\"', nameStart);
    if (nameEnd === -1) { searchFrom = nameStart; continue; }

    const title = html.substring(nameStart, nameEnd);

    if (!seen.has(gid)) {
      seen.add(gid);
      tabs.push({ title, index: tabs.length, gid: parseInt(gid) });
    }

    searchFrom = nameEnd;
  }

  // Fallback: extract tab names from the DOM (no gids — use CSV-by-name)
  if (tabs.length === 0) {
    const captionRe = /docs-sheet-tab-caption">([^<]+)</g;
    let m;
    while ((m = captionRe.exec(html))) {
      tabs.push({ title: m[1], index: tabs.length, gid: -1 });
    }
  }

  if (tabs.length === 0) {
    throw new Error(
      "Could not extract tab names from spreadsheet HTML.\n" +
      "  Make sure the sheet is shared as 'Anyone with the link' (Viewer or Editor)."
    );
  }

  return tabs;
}

// ─── FETCH ONE TAB (public CSV export) ────────────────────────
async function fetchTab(tab) {
  try {
    // Prefer gid-based export; fall back to gviz-by-name if gid unknown
    const url = tab.gid >= 0
      ? `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${tab.gid}`
      : `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab.title)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; InfrasitySync/1.0)" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();
    return parseCSV(csv);
  } catch (e) {
    log(`  ⚠ Could not read "${tab.title}": ${e.message}`);
    return [];
  }
}

// ─── PARSE ONE CAMPAIGN TAB ───────────────────────────────────
function parseCampaignTab(tabTitle, rows) {
  if (!rows || rows.length < 2) return null;

  // Row 0 = headers
  const headers = rows[0].map(h => String(h || "").toLowerCase().trim());

  // Find Merge Status column — YAMM always includes "Merge status" or "status"
  const mergeIdx = (() => {
    // Priority order
    const exact = headers.indexOf("merge status");
    if (exact >= 0) return exact;
    const partial = headers.findIndex(h => h.includes("merge") || h === "status");
    if (partial >= 0) return partial;
    // Last resort: look for a column whose values start with EMAIL_
    for (let col = 0; col < headers.length; col++) {
      for (let row = 1; row < Math.min(rows.length, 5); row++) {
        const val = String(rows[row][col] || "").toUpperCase();
        if (val.startsWith("EMAIL_") || val === "UNSUBSCRIBED") return col;
      }
    }
    return -1;
  })();

  if (mergeIdx === -1) {
    log(`  — No merge status column in "${tabTitle}", skipping`);
    return null;
  }

  // Find other useful columns
  const companyIdx = headers.findIndex(h => h.includes("company"));
  const ppIdx      = headers.findIndex(h =>
    h.includes("pain point") || h.includes("vertical") || h.includes("pitch")
  );
  const compIdx    = headers.findIndex(h =>
    h.includes("competitor") || h.includes("comp")
  );

  // Count statuses
  let sent = 0, opened = 0, clicked = 0, unsubscribed = 0, bounced = 0;
  const prospects = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rawStatus = String(row[mergeIdx] || "").trim();
    if (!rawStatus) continue;

    const status = rawStatus.toUpperCase();

    // YAMM only records the HIGHEST state per row (no duplicates)
    sent++;
    if (status.includes("OPENED"))  opened++;
    if (status.includes("CLICKED")) { opened++; clicked++; }  // clicked implies opened
    if (status.includes("UNSUBSCRIBED") || status.includes("UNSUB")) unsubscribed++;
    if (status.includes("BOUNCE"))  bounced++;

    prospects.push({
      company:    companyIdx >= 0 ? String(row[companyIdx] || "").trim() : "",
      painPoint:  ppIdx      >= 0 ? String(row[ppIdx]      || "").trim() : "",
      competitor: compIdx    >= 0 ? String(row[compIdx]    || "").trim() : "",
      status:     rawStatus,
    });
  }

  if (sent === 0) return null;

  const openRate  = Math.round((opened  / sent) * 100);
  const clickRate = Math.round((clicked / sent) * 100);

  return {
    name:         tabTitle.trim(),
    date:         extractDate(tabTitle),
    sent,
    opened,
    clicked,
    unsubscribed,
    bounced,
    openRate,
    clickRate,
    prospects,
  };
}

// ─── EXTRACT DATE FROM TAB NAME ───────────────────────────────
function extractDate(name) {
  const months = {
    jan:"Jan", feb:"Feb", mar:"Mar", apr:"Apr", may:"May", jun:"Jun",
    jul:"Jul", aug:"Aug", sep:"Sep", oct:"Oct", nov:"Nov", dec:"Dec",
    january:"Jan", february:"Feb", march:"Mar", april:"Apr", june:"Jun",
    july:"Jul", august:"Aug", september:"Sep", october:"Oct", november:"Nov", december:"Dec",
  };
  const n = name.toLowerCase();
  for (const [key, abbr] of Object.entries(months)) {
    if (n.includes(key)) {
      const dayMatch = name.match(/\b(\d{1,2})(st|nd|rd|th)?\b/i);
      return dayMatch ? `${dayMatch[1]} ${abbr}` : abbr;
    }
  }
  return "";
}

// ─── VERTICAL KEYWORD DETECTION ───────────────────────────────
const VERTICALS = [
  { name:"Recently Funded",       kws: ["recently funded","funded","series","yc batch","raise"] },
  { name:"AI Agents",             kws: ["ai agent","agentic","agent non us","agent us","agent 2"] },
  { name:"AI SRE",                kws: ["sre","ai sre","incident","reliability"] },
  { name:"UK Agents",             kws: ["uk agent","uk agents"] },
  { name:"LLM / Visibility",      kws: ["llm","obv","visibility","ai visibility"] },
  { name:"Security",              kws: ["sec ","security","appsec"," sec"] },
  { name:"Eng / International",   kws: ["eng int","engineering int","international"] },
  { name:"SOBM",                  kws: ["sobm"] },
  { name:"YC Spring 2026",        kws: ["yc 26","yc26","yc reachout","y combinator"] },
  { name:"Follow-up",             kws: ["follow-up","followup","follow up"] },
  { name:"Xpander / AI Infra",    kws: ["xpander"] },
];

function detectVertical(tabName) {
  const n = tabName.toLowerCase();
  for (const v of VERTICALS) {
    if (v.kws.some(k => n.includes(k))) return v.name;
  }
  // Fallback: use the full tab name (it's descriptive enough)
  return tabName.trim();
}

// ─── GROUP CAMPAIGNS INTO VERTICAL PERFORMANCE ────────────────
function buildVerticals(campaigns) {
  const map = {};
  for (const c of campaigns) {
    const vname = detectVertical(c.name);
    if (!map[vname]) {
      map[vname] = {
        vertical: vname,
        sent: 0, opened: 0, clicked: 0,
        campaigns: [], meetings: 0,
      };
    }
    map[vname].sent    += c.sent;
    map[vname].opened  += c.opened;
    map[vname].clicked += c.clicked;
    map[vname].campaigns.push(c.name);
  }

  return Object.values(map)
    .map(g => ({
      vertical:        g.vertical,
      openRate:        g.sent > 0 ? Math.round((g.opened  / g.sent) * 100) : 0,
      clickRate:       g.sent > 0 ? Math.round((g.clicked / g.sent) * 100) : 0,
      meetings:        g.meetings,
      followupStatus:  "pending",
      channel:         "YAMM",
      notes:           `${g.campaigns.length} campaign(s). Last: "${g.campaigns[g.campaigns.length - 1]}"`,
    }))
    .sort((a, b) => b.openRate - a.openRate);
}

// ─── WRITE OUTPUT ─────────────────────────────────────────────
function write(campaigns, verticals, lastUpdated) {
  const dir = path.dirname(OUTPUT);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Email volume time-series: each campaign = one data point
  const emailVolume = campaigns.map(c => ({
    period:   c.name,
    emails:   c.sent,
    meetings: 0, // user updates meetings manually
  }));

  const out = `// ══════════════════════════════════════════════════════════════
// INFRASITY SALES DASHBOARD — AUTO-GENERATED DATA
// Last synced: ${lastUpdated}
// Source: https://docs.google.com/spreadsheets/d/1o6C1Xhu_fXCVBFe2dKB0J_3svmy5TIHoyluKqTUmsuw
// Generated by: infrasity-sync/scripts/sync.js
// DO NOT EDIT MANUALLY — overwritten at 4:00 AM IST daily
// ══════════════════════════════════════════════════════════════

const META = {
  lastUpdated: ${JSON.stringify(lastUpdated)},
  currentMonthMeetings: 3,
  targetMeetings: 10,
  autoSynced: true,
  totalCampaigns: ${campaigns.length},
  totalProspects: ${campaigns.reduce((s, c) => s + c.sent, 0)},
};

// ── ALL CAMPAIGNS (one entry per sheet tab, auto-read) ────────
let yammCampaigns = ${JSON.stringify(
  campaigns.map(c => ({
    name: c.name, date: c.date, sent: c.sent,
    openRate: c.openRate, clickRate: c.clickRate,
    opened: c.opened, clicked: c.clicked,
    unsubscribed: c.unsubscribed, bounced: c.bounced,
  })), null, 2)};

// ── EMAIL VOLUME TIME-SERIES ──────────────────────────────────
let emailVolume = ${JSON.stringify(emailVolume, null, 2)};

// ── LINKEDIN (manually maintained — not in the YAMM sheet) ────
let linkedinVolume = [
  { period:"May–Jun 2025",   messages:467  },
  { period:"Jun26–Jul1",     messages:266  },
  { period:"Jul 2–8",        messages:347  },
  { period:"Jul 8–21",       messages:847  },
  { period:"Jul23–Aug4",     messages:817  },
  { period:"Aug 5–18",       messages:460  },
  { period:"Aug19–Sep1",     messages:1313 },
  { period:"Sep 2–15",       messages:1186 },
  { period:"Sep15–Oct13",    messages:1989 },
  { period:"Oct 14–27",      messages:1389 },
  { period:"Oct27–Nov10",    messages:1287 },
  { period:"Nov10–Dec8",     messages:5011 },
  { period:"Dec 9–29",       messages:5108 },
  { period:"Dec31–Jan12",    messages:1925 },
  { period:"Jan13–Feb16",    messages:2815 },
  { period:"Feb 17–24",      messages:1428 },
  { period:"Feb25–Mar10",    messages:1829 },
  { period:"Mar10–Apr7",     messages:399  },
];

// ── VERTICAL PERFORMANCE (auto-grouped from campaign tabs) ────
let verticals = ${JSON.stringify(verticals, null, 2)};

// ── EMAIL PITCHES (Q1 2026 analysis — manually maintained) ────
const emailPitches = [
  { id:"P13", vertical:"Brevo Alt",        subject:"What shows up when marketers ask for Mailchimp replacements?",          r:8, s:8, a:8, m:8, verdict:"strong"  },
  { id:"P6",  vertical:"Client Lookalike", subject:"GPT and Perplexity already explain your category without citing you",   r:7, s:8, a:8, m:8, verdict:"strong"  },
  { id:"P4",  vertical:"DevRel Hiring",    subject:"The visibility won't wait while your DevRel is still ramping",          r:8, s:7, a:7, m:7, verdict:"strong"  },
  { id:"P23", vertical:"Hiring Signal",    subject:"Execution on day 1 or onboarding by day 90",                            r:8, s:8, a:7, m:7, verdict:"strong"  },
  { id:"P19", vertical:"AI Agentic",       subject:"You missed three developer searches today",                             r:7, s:7, a:7, m:7, verdict:"strong"  },
  { id:"P12", vertical:"YC Spring 2026",   subject:"Post-YC execution: LLM rankings, citations, developer content",        r:7, s:7, a:7, m:7, verdict:"strong"  },
  { id:"P1",  vertical:"Recently Funded",  subject:"Developers won't find them through funding news",                       r:7, s:6, a:7, m:7, verdict:"strong"  },
  { id:"P2",  vertical:"AI Agents",        subject:"Competitors getting cited in AI answers while you aren't",              r:6, s:6, a:6, m:6, verdict:"average" },
  { id:"P5",  vertical:"Test Automation",  subject:"Competitors getting cited in AI answers (duplicate)",                   r:6, s:6, a:6, m:5, verdict:"average" },
  { id:"P8",  vertical:"DataOps",          subject:"How LLMs surface your company during evaluation",                       r:7, s:6, a:7, m:6, verdict:"average" },
  { id:"P15", vertical:"Confidential AI",  subject:"If engineers research secure AI workloads, are you part of that?",     r:7, s:6, a:7, m:7, verdict:"average" },
  { id:"P18", vertical:"Respond Comps",    subject:"[Company] in GPT, so I chose Respond",                                 r:7, s:7, a:6, m:6, verdict:"average" },
  { id:"P20", vertical:"AI SRE",           subject:"Your AI SRE diagnoses incidents fast but nobody can find it",          r:7, s:6, a:7, m:7, verdict:"average" },
  { id:"P24", vertical:"Xpander Comps",    subject:"[Company] missed three developer searches today",                      r:7, s:6, a:6, m:6, verdict:"average" },
  { id:"P3",  vertical:"AI Kubernetes",    subject:"Assiting [Company] with AI-driven visibility [TYPO IN SUBJECT]",       r:5, s:5, a:5, m:4, verdict:"rework"  },
  { id:"P14", vertical:"Brevo Comps",      subject:"Want to try email marketing but not with Mailchimp",                   r:6, s:5, a:5, m:4, verdict:"rework"  },
  { id:"P16", vertical:"Conf AI Follow-up",subject:"Follow-up (word-for-word copy of P15 — wasted touchpoint)",            r:5, s:5, a:5, m:4, verdict:"rework"  },
  { id:"P22", vertical:"Recently Funded FU",subject:"Follow-up (Respond.io metrics reused again, 3rd time)",               r:6, s:6, a:5, m:5, verdict:"rework"  },
];

const liPitches = [
  { id:"LI-P10", vertical:"Security Teams",   subject:"I noticed a pattern across security teams lately.",                        r:7, s:7, a:7, m:7, verdict:"strong"  },
  { id:"LI-P2",  vertical:"Dir. Content",     subject:"If content were just about publishing more blogs, everyone would be #1",  r:5, s:7, a:6, m:6, verdict:"average" },
  { id:"LI-P5",  vertical:"CTOs",             subject:"We work with enterprise AI teams when onboarding pulls engineers away",   r:6, s:7, a:7, m:6, verdict:"average" },
  { id:"LI-P9",  vertical:"General / Growth", subject:"Moving in 2026 — if you were to fix one organic growth lever, what?",    r:7, s:6, a:4, m:6, verdict:"average" },
  { id:"LI-P1",  vertical:"Fractional CMOs",  subject:"Developer marketing is the only space where paid ads might hurt you",    r:6, s:6, a:5, m:5, verdict:"average" },
  { id:"LI-P3",  vertical:"General",          subject:"With entire B2B market going crazy about AI and LLM visibility...",      r:3, s:4, a:2, m:3, verdict:"rework"  },
  { id:"LI-P4",  vertical:"General / Growth", subject:"Publishing more blogs alone wont be moving any needle [typo]",           r:5, s:6, a:3, m:4, verdict:"rework"  },
  { id:"LI-P6",  vertical:"SRE / Incident",   subject:"I'm assuming content at [Company] is majorly handled internally...",     r:5, s:4, a:5, m:3, verdict:"rework"  },
  { id:"LI-P7",  vertical:"General",          subject:"I have been speaking with Qodo, Ox Security and Firefly...",             r:6, s:4, a:2, m:4, verdict:"rework"  },
  { id:"LI-P8",  vertical:"Named Prospect",   subject:"We have been serving as an extended arm of growth teams...",             r:4, s:5, a:3, m:3, verdict:"rework"  },
];

// ── HYPER-PERSONALISED EMAILS ─────────────────────────────────
let hyperEmails = [
  { company:"Keploy", contact:"Neha", date:"Apr 10", signals:"Hiring DevRel + Hiring Technical Marketing + Reddit threads API testing", refUsed:"yes", assetAttached:"yes", outcome:"meeting_booked", notes:"Warm intro via Pratham. Tech Content Roadmap as gift. Booked same day." },
];

const hyperPipeline = [
  { company:"UK Agents with hiring signal",   signal:"Check LinkedIn for DevRel openings + Reddit threads for their category", priority:"high"   },
  { company:"YC Spring 2026 batch",           signal:"Find 1 mutual connection per company via YC alumni network",             priority:"medium" },
  { company:"Observability tools",            signal:"Hiring SRE / DevRel? Create AIOps visibility roadmap as gift",           priority:"medium" },
  { company:"Compliance SaaS (post-SOC2)",    signal:"LinkedIn SOC2 Type 2 announcement = perfect warm signal",                priority:"medium" },
];

// ── PIPELINE LEAKS ────────────────────────────────────────────
const leaks = [
  { severity:"critical", title:"High open rates, zero meeting conversion",  detail:"UK Agents: 68% open, 17% click, 0 meetings. LLM Campaign: 61% open, 0% click. CTA is the gap.",        fix:"Replace 'grab a slot' with: 'I have Thursday 4pm IST open — does that work?'" },
  { severity:"critical", title:"Follow-ups are copy-pastes",                detail:"P16, P22, 8/10 LinkedIn follow-ups replay the first pitch word-for-word.",                              fix:"Follow-up formula: 1 new proof point OR 1 pointed question OR 1 new angle." },
  { severity:"critical", title:"Respond.io case study overused",            detail:"4X / 0→40% / 24% appears in 3+ pitches. Credibility kill.",                                             fix:"Rotate: Security→Ox. IAC→Firefly. Agents→Qodo. Never repeat in same cluster." },
  { severity:"warning",  title:"LinkedIn CTAs are non-asks",                detail:"8/10 LI pitches end with 'happy to chat'. Shrugs, not asks.",                                           fix:"'Are you free for 15 min this Thursday?' — one sentence change." },
  { severity:"warning",  title:"Apollo domain deliverability broken",       detail:"GitHub Seq: 4.3% open. Israel Seq: 3.7%. Spam folder.",                                                 fix:"Audit via MX Toolbox. Switch high-potential verticals to YAMM." },
  { severity:"warning",  title:"No signal-based triggering",                detail:"Every meeting that converted had a trigger. Batch-blasting wastes sequences.",                           fix:"Crunchbase funded alerts + LinkedIn DevRel postings + Reddit competitor mentions." },
  { severity:"info",     title:"Copy-paste bleed across verticals",         detail:"P2 and P5 near-identical. P7 duplicates P6 subject line.",                                              fix:"Log every subject line. No duplicate hooks across batches." },
];

const nextSteps = [
  { priority:"P0", timeframe:"This week",    title:"Rebuild the Follow-up Machine",           body:"UK Agents, YC 26, LLM OBv all warm. 3-touch: new proof → pointed question → breakup email." },
  { priority:"P0", timeframe:"This week",    title:"Kill Vague CTAs",                         body:"'Grab a slot' → 'I have Thursday 4pm IST open — does that work?' A/B test on next 3 batches." },
  { priority:"P0", timeframe:"This month",   title:"Deploy P13 Research-First Formula",       body:"Formula: [X Reddit threads + Y LLM prompts] = '[Competitor] mentioned N times, you 0.' Build per vertical." },
  { priority:"P1", timeframe:"This month",   title:"Signal-First Prospecting System",         body:"Crunchbase funded (last 30d) + LinkedIn DevRel role posted last 7d. Send within 48h of signal." },
  { priority:"P1", timeframe:"Q2 2026",      title:"LinkedIn Warm → Convert Pipeline",        body:"Model off LI-P10. 30-day test: 50 OP/day, specific time CTA. Target reply rate: >3%." },
  { priority:"P2", timeframe:"Q2 2026",      title:"Loom Video — Top 20 Warm Prospects",      body:"90-sec: 'I ran your company through 5 AI models.' LI DM + email. One booking = 3h justified." },
];

const newVerticals = [
  { name:"VC / Investor Portfolio", why:"Pitch one GP, get 5–10 portfolio warm intros. Highest leverage move.",     signal:"YC S25/W26, a16z, Sequoia portfolio pages.",                    opportunity:"high"   },
  { name:"AI Security / AppSec",    why:"LI-P10 scored 7/7/7/7. Ox, Qualifire, Rapidfort prove it.",              signal:"r/netsec, r/appsec, SOC2 mentions on LinkedIn.",                 opportunity:"high"   },
  { name:"PLG / Freemium SaaS",     why:"Free-tier teams need to convert devs to paid. Reddit + LLM is the play.", signal:"Free tier + active subreddits + under 500 employees.",           opportunity:"medium" },
  { name:"AI Coding Tools",         why:"Post-Cursor, every AI coding tool fights for LLM citations.",             signal:"ProductHunt launches, GitHub trending, HN Show HN.",             opportunity:"high"   },
  { name:"Observability / AIOps",   why:"Lightrun and Spike.sh already converted. r/devops and r/SRE are huge.",   signal:"Datadog/New Relic comps, under 200 employees, recent SRE hire.", opportunity:"medium" },
  { name:"Compliance / GRC SaaS",   why:"Sprinto, Scrut showed interest. SOC2 tools have terrible organic.",       signal:"LinkedIn SOC2 Type 2 announcement = perfect warm signal.",        opportunity:"medium" },
];
`;

  fs.writeFileSync(OUTPUT, out, "utf-8");
  log(`✓ Wrote ${out.length.toLocaleString()} bytes to ${OUTPUT}`);
}

// ─── MAIN ─────────────────────────────────────────────────────
async function main() {
  log("══════════════════════════════════════════");
  log("INFRASITY SYNC START");
  log("══════════════════════════════════════════");

  // 1. List all tabs (scraped from public spreadsheet page)
  log("Fetching sheet tab list...");
  const allTabs = await getAllTabs();
  log(`Found ${allTabs.length} tabs:`);
  allTabs.forEach(t => log(`  [${t.index}] "${t.title}" (gid=${t.gid})`));

  // 2. Process all tabs in parallel batches (rate-limit safe)
  const campaigns = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < allTabs.length; i += BATCH_SIZE) {
    const batch   = allTabs.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(t => fetchTab(t)));

    for (let j = 0; j < batch.length; j++) {
      const { title } = batch[j];
      const rows      = results[j];
      const campaign  = parseCampaignTab(title, rows);

      if (campaign) {
        campaigns.push(campaign);
        log(`  ✓ "${title}": ${campaign.sent} sent | ${campaign.openRate}% open | ${campaign.clickRate}% click`);
      }
    }
  }

  if (campaigns.length === 0) {
    log("ERROR: No campaigns parsed. Check sheet sharing permissions.");
    process.exit(1);
  }

  // 3. Build derived data
  const verticals = buildVerticals(campaigns);

  // 4. Log summary
  const totSent    = campaigns.reduce((s, c) => s + c.sent,    0);
  const totOpened  = campaigns.reduce((s, c) => s + c.opened,  0);
  const totClicked = campaigns.reduce((s, c) => s + c.clicked, 0);
  log(`\nSummary across all ${campaigns.length} campaigns:`);
  log(`  Total prospects:   ${totSent.toLocaleString()}`);
  log(`  Total opened:      ${totOpened.toLocaleString()} (${Math.round(totOpened/totSent*100)}%)`);
  log(`  Total clicked:     ${totClicked.toLocaleString()} (${Math.round(totClicked/totSent*100)}%)`);
  log(`  Verticals grouped: ${verticals.length}`);

  // 5. Write salesData.js
  const now = new Date().toLocaleString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
  }) + " IST";

  write(campaigns, verticals, now);

  log("SYNC COMPLETE ✓");
  log("══════════════════════════════════════════\n");
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  log(err.stack);
  process.exit(1);
});
