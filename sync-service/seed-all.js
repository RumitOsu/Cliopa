/**
 * Cliopa Comprehensive Seeder
 * Seeds ALL tables needed for a fully populated demo:
 *   - calls + report_cards (with linked call_ids)
 *   - call_analytics (sentiment, keywords, script adherence)
 *   - coaching_sessions + agent_goals
 *   - performance_alerts
 *   - score_disputes + dispute_comments
 *   - keyword_libraries + script_templates
 *
 * Usage:  SUPABASE_SERVICE_KEY=xxx node seed-all.js
 *         SUPABASE_SERVICE_KEY=xxx CLEAN=true node seed-all.js   # wipe first
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zkywapiptgpnfkacpyrz.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TARGET_CALLS = parseInt(process.env.TARGET_CALLS || '1000');
const CLEAN = process.env.CLEAN === 'true';

if (!SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_KEY required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Random helpers ────────────────────────────────────────────────────────────
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rng = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
const clamp = (v) => Math.min(100, Math.max(0, Math.round(v)));
const gauss = (mean, std) => {
  const u1 = Math.random(), u2 = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
};
const fclamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

const FIRST_NAMES = [
  'Maria','James','Linda','Robert','Patricia','Michael','Jennifer','David','Susan','William',
  'Jessica','Richard','Sarah','Joseph','Karen','Thomas','Lisa','Charles','Nancy','Christopher',
  'Betty','Daniel','Margaret','Matthew','Sandra','Anthony','Ashley','Mark','Dorothy','Donald',
];
const LAST_NAMES = [
  'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
  'Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin',
];

const CCM_CAMPAIGNS = ['CCM_R7_Outbound','CCM_R10_Outbound','CCM_FPD_Outbound','CCM_PD_Collections'];
const CCM_INBOUND = ['CCM_Inbound_General','CCM_Inbound_Payments'];
const CRM_CAMPAIGNS = ['CRM_Retention_Outbound','CRM_Save_Inbound','CRM_Win_Back'];

function phone() { return `(${rng(200,999)}) ${rng(200,999)}-${rng(1000,9999)}`; }
function acct4() { return String(rng(1000,9999)); }
function ssn4() { return String(rng(1000,9999)); }
function dob() { return `${rng(1,12)}/${rng(1,28)}/${rng(1960,1997)}`; }
function loanAmt() { return pick([200,250,300,350,400,450,500,600,700,800,900,1000,1200,1500]); }
function nsfFee() { return pick([25,30,35]); }
function extFee() { return pick([35,40,45,50]); }
function daysPD() { return pick([1,2,3,5,7,8,10,12,14,18,21,30]); }
function fmt(d) { return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`; }
function greet(h) { return h < 12 ? 'morning' : 'afternoon'; }
function dollar(n) { return `$${Number(n).toFixed(2)}`; }

function randomCallDate() {
  const now = Date.now();
  const ago6 = now - 180 * 86400000;
  return new Date(ago6 + Math.random() * (now - ago6));
}
function businessDate(base) {
  const d = new Date(base);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(rng(8,17), rng(0,59), rng(0,59), 0);
  return d;
}

// ── Transcript Templates ──────────────────────────────────────────────────────
function mkParams() {
  const cd = businessDate(randomCallDate());
  const loan = loanAmt();
  const pmt = Math.random() < 0.35 ? loan : Math.round(loan / pick([2,3,4]) * 100) / 100;
  const due = new Date(cd); due.setDate(due.getDate() - daysPD());
  const next = new Date(cd); next.setDate(next.getDate() + 14);
  return {
    cf: pick(FIRST_NAMES), cl: pick(LAST_NAMES),
    get cFull() { return `${this.cf} ${this.cl}`; },
    loan, pmt, nsf: nsfFee(), ext: extFee(),
    a4: acct4(), s4: ssn4(), db: dob(),
    due: fmt(due), next: fmt(next), cd, h: cd.getHours(),
    dpd: daysPD(),
  };
}

function T_outbound_good(p) {
  return {
    role:'ccm', callType:'outbound_collection', quality:'good',
    campaign: pick(CCM_CAMPAIGNS),
    disposition: pick(['Promise to Pay (PTP)','Payment Taken','Payment Arrangement Set']),
    dur: rng(240,520),
    text: `Agent: Good ${greet(p.h)}, may I please speak with ${p.cf} ${p.cl}?\nCustomer: This is ${p.cf}.\nAgent: Hi ${p.cf}, this is [AGENT] calling from TLC Financial on a recorded line. Before I continue I do need to let you know that this is an attempt to collect a debt and any information obtained will be used for that purpose. How are you doing today?\nCustomer: I'm okay, what's this about?\nAgent: Of course. I'm calling regarding your TLC account ending in ${p.a4}. Before I can discuss any details, I need to verify your identity. Could I get your date of birth and the last four of your Social Security Number?\nCustomer: Sure, it's ${p.db} and ${p.s4}.\nAgent: Perfect, thank you. So the reason I'm calling today is that we have a payment of ${dollar(p.pmt)} that was due on ${p.due} and we haven't received that yet. Is everything okay on your end?\nCustomer: Oh gosh, I completely forgot, I've just been really busy with work.\nAgent: I totally understand, life gets hectic. ${p.cf}, are you in a position to process that payment today? We really want to keep your account in good standing.\nCustomer: Yeah I think I can. Can I use my debit card?\nAgent: Absolutely. I'll need your card number, expiration date, and the three-digit security code on the back.\nCustomer: Okay let me grab my wallet. [pause] It's [reads card numbers] expiration is oh eight twenty seven, code is three four nine.\nAgent: Got it, let me process that. [pause] Alright, the payment of ${dollar(p.pmt)} has gone through successfully. You'll get a confirmation to the email on file. I'm also going to note in your file that we spoke today and the payment was processed. Is there any change to your contact information?\nCustomer: No everything's the same.\nAgent: Perfect. Thank you for taking care of that ${p.cf}. Have a great ${greet(p.h)}.\nCustomer: Thanks, you too.`,
  };
}

function T_outbound_average(p) {
  return {
    role:'ccm', callType:'outbound_collection', quality:'average',
    campaign: pick(CCM_CAMPAIGNS),
    disposition: pick(['Callback Scheduled','Partial Promise','Left Message']),
    dur: rng(150,340),
    text: `Agent: Hello can I speak to ${p.cFull}?\nCustomer: Yeah speaking.\nAgent: Hi this is [AGENT] from TLC. This call is recorded, this is a debt collection call, any info used for that purpose. I'm calling about your account ending in ${p.a4}, I need to verify real quick, what's your date of birth?\nCustomer: It's ${p.db}.\nAgent: Okay and last four of your social?\nCustomer: ${p.s4}.\nAgent: Alright. So we have a payment of ${dollar(p.pmt)} due on ${p.due} that we haven't seen. What's going on?\nCustomer: I've been having some money problems lately to be honest.\nAgent: Okay well we do need to get this taken care of. Can you make the payment today?\nCustomer: I don't know if I can do the full amount.\nAgent: Well what can you do?\nCustomer: Maybe like half?\nAgent: Okay so that would be ${dollar(p.pmt / 2)} by today and then the rest when?\nCustomer: Maybe in two weeks?\nAgent: Alright I'll note that. So you're paying ${dollar(p.pmt / 2)} today and the balance in two weeks?\nCustomer: Yeah that should work.\nAgent: Okay what card?\nCustomer: My Visa ending in eight eight four two.\nAgent: Processing. [pause] Okay that went through. The remaining balance is due in two weeks. We'll follow up. Anything else?\nCustomer: No that's it.\nAgent: Okay have a good one.`,
  };
}

function T_outbound_poor(p) {
  return {
    role:'ccm', callType:'outbound_collection', quality:'poor',
    campaign: pick(CCM_CAMPAIGNS),
    disposition: pick(['Refused to Pay','Disputed Debt','Callback Scheduled']),
    dur: rng(70,200),
    text: `Agent: Hi is this ${p.cFull}?\nCustomer: Who's calling?\nAgent: This is [AGENT] from TLC.\nCustomer: Oh. Yeah this is ${p.cf}.\nAgent: Yeah so we have you past due on account ${p.a4}. The amount of ${dollar(p.pmt)} was due ${p.due}. When are you gonna pay?\nCustomer: Um I wasn't expecting a call. What is this for exactly?\nAgent: Your loan. You owe ${dollar(p.pmt)} and it's past due.\nCustomer: Can you tell me your name again and what company?\nAgent: [AGENT], TLC Financial.\nCustomer: And how much do I owe?\nAgent: ${dollar(p.pmt)} as of today.\nCustomer: But I thought my payment wasn't until...\nAgent: It was due ${p.due}. It's now past due. Are you going to pay or not?\nCustomer: I just got laid off last week. I need some time.\nAgent: Well when can you pay?\nCustomer: Maybe next Friday?\nAgent: Okay so next Friday for the full ${dollar(p.pmt)}?\nCustomer: I'll try. Can't promise the full amount.\nAgent: Well that's what's owed. We'll call back then.\nCustomer: Okay.\nAgent: Bye.`,
  };
}

function T_inbound_inquiry(p) {
  return {
    role:'ccm', callType:'inbound_inquiry', quality:'good',
    campaign: pick(CCM_INBOUND),
    disposition: 'Information Provided',
    dur: rng(180,360),
    text: `Agent: Thank you for calling TLC Financial, this is [AGENT], how can I help you today?\nCustomer: Hi, I'm just calling to check on my account balance and when my next payment is due.\nAgent: Of course, happy to help. I'll need to verify your identity first. Can I get your full name?\nCustomer: ${p.cFull}.\nAgent: Thank you. And your date of birth and last four of your social?\nCustomer: ${p.db} and ${p.s4}.\nAgent: Perfect. One moment. [typing] Okay so I have your account here, ending in ${p.a4}. Your current balance is ${dollar(p.loan)} and your next payment of ${dollar(p.pmt)} is due on ${p.next}.\nCustomer: Okay and if I wanted to pay it off early is there a penalty?\nAgent: Great question. There is no prepayment penalty, you're welcome to pay early at any time. Would you like to make a payment today?\nCustomer: Maybe, let me think about it. Also if I can't make the full payment on that date, what are my options?\nAgent: We do have an extension option that pushes your due date back fourteen days. There's a fee of ${dollar(p.ext)} which gets added to your next payment.\nCustomer: No no, I think I'll be fine. Just good to know.\nAgent: Absolutely. I'll note in your file that you called in to check your balance today. Is there anything else?\nCustomer: No that's all, thank you.\nAgent: Of course. Have a great day.`,
  };
}

function T_payment_call(p) {
  return {
    role:'ccm', callType:'payment_call', quality:'good',
    campaign: pick(CCM_INBOUND),
    disposition: 'Payment Processed',
    dur: rng(180,360),
    text: `Agent: TLC Financial, [AGENT] speaking, how can I help you today?\nCustomer: Hi I want to make a payment on my account.\nAgent: Of course, happy to help. Full name?\nCustomer: ${p.cFull}.\nAgent: Date of birth and last four of social?\nCustomer: ${p.db} and ${p.s4}.\nAgent: I've got your account here, ending in ${p.a4}. Your payment of ${dollar(p.pmt)} is due ${p.next}. Would you like to pay the full amount today?\nCustomer: Yes, the full amount.\nAgent: Great. Debit card or bank account?\nCustomer: Debit card.\nAgent: I'll need the card number, expiration, and CVV on the back.\nCustomer: Okay it's [reads card] expiration is zero nine twenty six, security code eight seven two.\nAgent: Thank you. Just to confirm, we're processing ${dollar(p.pmt)} to account ending in ${p.a4}?\nCustomer: Yes.\nAgent: One moment. [pause] The payment of ${dollar(p.pmt)} has been processed successfully. Confirmation will be in your email shortly.\nCustomer: Great. Am I all caught up now?\nAgent: Yes, your account is current. Anything else?\nCustomer: No that's everything, thank you.\nAgent: Of course. Have a wonderful day.`,
  };
}

function T_retention_good(p) {
  const reduced = +(p.pmt * 0.85).toFixed(2);
  return {
    role:'crm', callType:'retention_call', quality:'good',
    campaign: pick(CRM_CAMPAIGNS),
    disposition: pick(['Account Retained','Saved - Offered Extension','Payment Arrangement']),
    dur: rng(360,620),
    text: `Agent: Good ${greet(p.h)}, ${p.cf}? This is [AGENT] calling from TLC Financial. I'm reaching out because I see you've been with us for a while and I just wanted to touch base.\nCustomer: Oh actually yeah, I've been meaning to call. I'm thinking about closing my account.\nAgent: Oh, I'm sorry to hear that. Mind if I ask what's been going on?\nCustomer: Honestly the fees seem really high. I found another lender offering better rates.\nAgent: I completely understand. I want to be transparent — I may not match every offer but I can offer you a renewal at a reduced rate, about ${dollar(reduced)} — roughly fifteen percent less.\nCustomer: Oh really? Let's do it.\nAgent: Wonderful. I've processed the renewal and updated your terms. You'll receive a new agreement by email. Anything else?\nCustomer: No that's great. Thank you.\nAgent: Of course. We really value you as a customer. Have a great day.`,
  };
}

function T_retention_poor(p) {
  return {
    role:'crm', callType:'retention_call', quality:'poor',
    campaign: pick(CRM_CAMPAIGNS),
    disposition: pick(['Account Closed','Refused Retention Offer']),
    dur: rng(55,150),
    text: `Agent: Hi is this ${p.cFull}?\nCustomer: Speaking.\nAgent: Hi this is [AGENT] from TLC. I see you wanted to close your account?\nCustomer: Yeah I've decided I want to close it.\nAgent: Okay why is that?\nCustomer: I found better rates elsewhere.\nAgent: Oh okay. Well we do have other options.\nCustomer: I appreciate it but I've already decided.\nAgent: Are you sure?\nCustomer: Yeah I'm sure.\nAgent: Alright then. I'll process the closure. Anything else?\nCustomer: No that's it.\nAgent: Okay have a good day.`,
  };
}

function T_voicemail(p) {
  return {
    role: Math.random() < 0.6 ? 'ccm' : 'crm',
    callType:'voicemail', quality:'na',
    campaign: pick([...CCM_CAMPAIGNS, ...CRM_CAMPAIGNS]),
    disposition: pick(['Left Voicemail','No Answer','Voicemail Full']),
    dur: rng(20,45),
    text: `Agent: Hello, this message is for ${p.cFull}. This is [AGENT] calling from TLC Financial regarding your account ending in ${p.a4}. Please give us a call back at your earliest convenience at our main number. This is an attempt to collect a debt and any information obtained will be used for that purpose. Again this is [AGENT] from TLC Financial. Thank you and have a great day.\n\n[End of voicemail]`,
  };
}

function T_nsf_return(p) {
  const total = p.pmt + p.nsf;
  return {
    role:'ccm', callType:'payment_call', quality:'good',
    campaign: pick(CCM_CAMPAIGNS),
    disposition: 'Payment Processed - NSF Resolved',
    dur: rng(300,560),
    text: `Agent: Good ${greet(p.h)}, may I speak with ${p.cFull}?\nCustomer: Speaking.\nAgent: Hi ${p.cf}, this is [AGENT] from TLC Financial. This call is recorded and this is an attempt to collect a debt. To verify your account, can I get your date of birth and last four of your social?\nCustomer: Yeah it's ${p.db} and ${p.s4}.\nAgent: Thank you. We processed a payment of ${dollar(p.pmt)} on ${p.due} but it was returned as non-sufficient funds. Were you aware?\nCustomer: What? No, I must have miscalculated my balance.\nAgent: I understand. The original ${dollar(p.pmt)} plus a returned item fee of ${dollar(p.nsf)} brings the total to ${dollar(total)}. I was able to get the fee waived as a one-time courtesy.\nCustomer: Oh thank you so much.\nAgent: Can we process that today with a different account?\nCustomer: Yes. [reads bank details].\nAgent: The payment of ${dollar(p.pmt)} has been processed successfully. You'll receive email confirmation. Anything else?\nCustomer: No thank you.\nAgent: Of course. Have a great ${greet(p.h)}.`,
  };
}

function T_hardship(p) {
  return {
    role:'ccm', callType:'inbound_inquiry', quality:'good',
    campaign: pick(CCM_INBOUND),
    disposition: 'Accommodation Arrangement',
    dur: rng(270,500),
    text: `Agent: Thank you for calling TLC Financial, this is [AGENT], how can I help you today?\nCustomer: Hi, I'm calling because I'm having a really hard time financially and I can't make my payment on ${p.due}.\nAgent: I'm sorry you're going through a difficult time. Can I get your name and verification?\nCustomer: ${p.cFull}. DOB ${p.db}, last four ${p.s4}.\nAgent: Thank you. Your payment of ${dollar(p.pmt)} is due ${p.due}. You qualify for an accommodation — we'd split it into two installments of ${dollar(p.pmt / 2)}.\nCustomer: That would really help.\nAgent: Perfect. I'm setting that up now. You'll receive an updated schedule by email.\nCustomer: Thank you so much.\nAgent: Of course. I hope things look up for you soon. Take care.`,
  };
}

// ── Distribution ──────────────────────────────────────────────────────────────
const DIST = [
  { w: 25, fn: T_outbound_good },
  { w: 14, fn: T_outbound_average },
  { w:  7, fn: T_outbound_poor },
  { w:  9, fn: T_nsf_return },
  { w: 10, fn: T_inbound_inquiry },
  { w:  8, fn: T_payment_call },
  { w:  8, fn: T_retention_good },
  { w:  4, fn: T_retention_poor },
  { w:  5, fn: T_voicemail },
  { w:  5, fn: T_hardship },
  { w:  5, fn: T_outbound_average },
];
const TOTAL_W = DIST.reduce((s, d) => s + d.w, 0);
function pickTemplate() {
  let r = Math.random() * TOTAL_W;
  for (const d of DIST) { r -= d.w; if (r <= 0) return d.fn; }
  return DIST[0].fn;
}

// ── Score Generation ──────────────────────────────────────────────────────────
const QUALITY_PROFILES = {
  good:    { overall: [85,6], compliance: [90,5], communication: [87,5], empathy: [84,6], resolution: [86,5], accuracy: [88,5], tone: [88,5] },
  average: { overall: [72,7], compliance: [75,8], communication: [73,7], empathy: [68,8], resolution: [70,7], accuracy: [74,7], tone: [72,7] },
  poor:    { overall: [55,8], compliance: [50,10], communication: [58,8], empathy: [52,9], resolution: [48,9], accuracy: [55,8], tone: [55,9] },
  na: null,
};

function generateAgentBias() {
  return {
    overall: gauss(0,4), compliance: gauss(0,5), communication: gauss(0,4),
    empathy: gauss(0,5), resolution: gauss(0,4), accuracy: gauss(0,4), tone: gauss(0,3),
  };
}

function generateScores(quality, agentBias) {
  const profile = QUALITY_PROFILES[quality];
  if (!profile) return null;
  const scores = {};
  for (const [dim, [mean, std]] of Object.entries(profile)) {
    scores[dim] = clamp(gauss(mean + (agentBias[dim] || 0), std));
  }
  const dims = ['compliance','communication','empathy','resolution','accuracy','tone'];
  scores.overall = clamp(dims.reduce((s, d) => s + scores[d], 0) / dims.length);
  return scores;
}

function generateFeedback(quality, scores) {
  const strengths = [], improvements = [], recommendations = [];
  if (quality === 'good') {
    if (scores.compliance >= 85) strengths.push('Properly delivered Mini-Miranda disclosure and verified customer identity before discussing account details');
    if (scores.empathy >= 80) strengths.push('Demonstrated genuine empathy and understanding of customer situation');
    if (scores.communication >= 85) strengths.push('Clear, professional communication throughout the call');
    if (scores.resolution >= 85) strengths.push('Achieved positive resolution that benefits both customer and company');
    if (improvements.length === 0) improvements.push('Minor: Could explore additional solutions or cross-sell opportunities');
    recommendations.push('Continue this level of quality — agent is a strong example for peer coaching');
  } else if (quality === 'average') {
    if (scores.compliance >= 70) strengths.push('Basic compliance requirements were met');
    else improvements.push('Mini-Miranda delivery was rushed or incomplete');
    if (scores.empathy < 75) improvements.push('Limited empathy shown — agent should acknowledge customer feelings before moving to solutions');
    strengths.push('Completed basic call requirements and achieved partial resolution');
    recommendations.push('Focus on empathy training and active listening techniques');
  } else if (quality === 'poor') {
    improvements.push('Failed to properly identify themselves and deliver required Mini-Miranda disclosure');
    improvements.push('Showed little to no empathy for customer situation');
    strengths.push('Call was brief and direct');
    recommendations.push('Immediate coaching session required — review compliance requirements');
    recommendations.push('Shadow a top performer to observe empathy and de-escalation techniques');
  }
  const summary = quality === 'good'
    ? `Strong call performance. Agent followed TLC protocols, demonstrated genuine care. Overall score: ${scores.overall}/100.`
    : quality === 'average'
    ? `Adequate performance with room for improvement. Basic requirements met but empathy could be enhanced. Score: ${scores.overall}/100.`
    : `Below standard performance. Multiple compliance and quality issues requiring coaching intervention. Score: ${scores.overall}/100.`;
  return { summary, strengths: strengths.slice(0,4), improvements: improvements.slice(0,4), recommendations: recommendations.slice(0,3) };
}

function generateCriteria(quality, scores) {
  return [
    { id: 'QQ', result: scores.compliance >= 80 ? 'PASS' : scores.compliance >= 60 ? 'PARTIAL' : 'FAIL', score: scores.compliance, explanation: quality === 'good' ? 'Agent asked qualifying questions properly.' : quality === 'average' ? 'Qualifying questions were rushed.' : 'Did not properly ask qualifying questions.' },
    { id: 'VCI', result: scores.compliance >= 75 ? 'PASS' : 'PARTIAL', score: clamp(scores.compliance + rng(-5,5)), explanation: quality === 'good' ? 'Customer identity verified before account discussion.' : 'Identity verification incomplete.' },
    { id: 'WHY_SMILE', result: scores.tone >= 80 ? 'PASS' : 'PARTIAL', score: scores.tone, explanation: quality === 'good' ? 'Maintained warm tone throughout.' : 'Tone lacked warmth.' },
    { id: 'WHAT_EMPATHY', result: scores.empathy >= 80 ? 'PASS' : 'PARTIAL', score: scores.empathy, explanation: quality === 'good' ? 'Demonstrated genuine care.' : 'Empathy was formulaic or absent.' },
    { id: 'WHERE_RESOLUTION', result: scores.resolution >= 80 ? 'PASS' : 'PARTIAL', score: scores.resolution, explanation: quality === 'good' ? 'Fair resolution achieved.' : 'Resolution not fully explored.' },
    { id: 'WHAT_LISTEN', result: scores.communication >= 80 ? 'PASS' : 'PARTIAL', score: scores.communication, explanation: quality === 'good' ? 'Actively listened and explored solutions.' : 'Did not fully listen.' },
    { id: 'NOTES', result: scores.accuracy >= 80 ? 'PASS' : 'PARTIAL', score: scores.accuracy, explanation: quality === 'good' ? 'Mentioned noting the call in file.' : 'Documentation not mentioned.' },
  ];
}


// ═══════════════════════════════════════════════════════════════════════════════
// CALL ANALYTICS GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

const COMPLIANCE_KEYWORDS = [
  'Mini-Miranda', 'recorded line', 'attempt to collect a debt', 'information obtained',
  'verify your identity', 'date of birth', 'last four', 'Social Security',
];
const EMPATHY_KEYWORDS = [
  'I understand', 'I completely understand', 'sorry to hear', 'I appreciate',
  'difficult time', 'happy to help', 'of course', 'no problem',
];
const PROHIBITED_KEYWORDS = [
  'I promise', 'guaranteed', 'you have to', 'no choice', 'legal action',
];
const ESCALATION_KEYWORDS = [
  'supervisor', 'manager', 'complaint', 'attorney', 'lawyer', 'sue',
];

const CALL_OUTCOMES = ['payment_collected','payment_arrangement','callback_scheduled','dispute','refused_to_pay','disconnected','voicemail','no_contact','other'];

function generateCallAnalytics(callData, scores, quality) {
  const dur = callData.call_duration_seconds;
  const agentTalk = Math.round(dur * (0.4 + Math.random() * 0.2));
  const customerTalk = Math.round(dur * (0.25 + Math.random() * 0.2));
  const silence = dur - agentTalk - customerTalk;

  // Sentiment based on quality
  const sentimentMap = { good: 'positive', average: 'neutral', poor: 'negative', na: 'neutral' };
  const sentimentScoreMap = { good: [0.6, 0.9], average: [0.3, 0.6], poor: [-0.3, 0.2], na: [0.0, 0.3] };
  const [sLo, sHi] = sentimentScoreMap[quality] || [0, 0.5];
  const sentimentScore = +(sLo + Math.random() * (sHi - sLo)).toFixed(2);

  // Sentiment timeline (5-10 points)
  const timelinePoints = rng(5, 10);
  const timeline = [];
  for (let i = 0; i < timelinePoints; i++) {
    const t = Math.round((i / timelinePoints) * dur);
    const baseSentiment = sentimentScore + gauss(0, 0.15);
    timeline.push({ timestamp: t, score: +fclamp(baseSentiment, -1, 1).toFixed(2), speaker: i % 2 === 0 ? 'agent' : 'customer' });
  }

  // Keywords found
  const keywordsFound = [];
  const complianceCount = quality === 'good' ? rng(4,7) : quality === 'average' ? rng(2,4) : rng(0,2);
  const empathyCount = quality === 'good' ? rng(3,6) : quality === 'average' ? rng(1,3) : rng(0,1);
  const prohibitedCount = quality === 'poor' ? rng(1,3) : quality === 'average' ? (Math.random() < 0.2 ? 1 : 0) : 0;
  const escalationCount = quality === 'poor' ? (Math.random() < 0.3 ? 1 : 0) : 0;

  for (let i = 0; i < complianceCount; i++) {
    keywordsFound.push({ phrase: pick(COMPLIANCE_KEYWORDS), category: 'compliance', library: 'TLC Compliance', count: 1, weight: 1.0 });
  }
  for (let i = 0; i < empathyCount; i++) {
    keywordsFound.push({ phrase: pick(EMPATHY_KEYWORDS), category: 'empathy', library: 'Empathy Phrases', count: rng(1,3), weight: 0.8 });
  }
  for (let i = 0; i < prohibitedCount; i++) {
    keywordsFound.push({ phrase: pick(PROHIBITED_KEYWORDS), category: 'prohibited', library: 'Prohibited Language', count: 1, weight: -1.0 });
  }
  for (let i = 0; i < escalationCount; i++) {
    keywordsFound.push({ phrase: pick(ESCALATION_KEYWORDS), category: 'escalation', library: 'Escalation Triggers', count: 1, weight: -0.5 });
  }

  // Script adherence
  const adherence = scores ? clamp(scores.compliance * 0.7 + scores.communication * 0.3 + gauss(0, 5)) : rng(40, 70);

  // Call outcome mapping
  const outcomeMap = {
    'Promise to Pay (PTP)': 'payment_arrangement',
    'Payment Taken': 'payment_collected',
    'Payment Arrangement Set': 'payment_arrangement',
    'Callback Scheduled': 'callback_scheduled',
    'Partial Promise': 'payment_arrangement',
    'Left Message': 'voicemail',
    'Refused to Pay': 'refused_to_pay',
    'Disputed Debt': 'dispute',
    'Information Provided': 'other',
    'Payment Processed': 'payment_collected',
    'Payment Processed - NSF Resolved': 'payment_collected',
    'Account Retained': 'other',
    'Saved - Offered Extension': 'payment_arrangement',
    'Account Closed': 'other',
    'Refused Retention Offer': 'refused_to_pay',
    'Left Voicemail': 'voicemail',
    'No Answer': 'no_contact',
    'Voicemail Full': 'no_contact',
    'Accommodation Arrangement': 'payment_arrangement',
  };
  const callOutcome = outcomeMap[callData.disposition] || 'other';

  const topics = [];
  if (callData.call_type === 'outbound_collection') topics.push('collections', 'payment');
  if (callData.call_type === 'payment_call') topics.push('payment', 'account');
  if (callData.call_type === 'inbound_inquiry') topics.push('inquiry', 'account');
  if (callData.call_type === 'retention_call') topics.push('retention', 'account_closure');
  if (callData.call_type === 'voicemail') topics.push('voicemail');

  return {
    call_duration_seconds: dur,
    agent_talk_time_seconds: agentTalk,
    customer_talk_time_seconds: customerTalk,
    silence_time_seconds: Math.max(0, silence),
    talk_to_listen_ratio: +(agentTalk / Math.max(1, customerTalk)).toFixed(2),
    overall_sentiment: quality === 'na' ? 'neutral' : sentimentMap[quality],
    sentiment_score: sentimentScore,
    sentiment_timeline: timeline,
    keywords_found: keywordsFound,
    compliance_keywords_found: complianceCount,
    prohibited_keywords_found: prohibitedCount,
    empathy_keywords_found: empathyCount,
    escalation_triggers_found: escalationCount,
    script_adherence_score: adherence,
    script_phrases_matched: quality === 'good' ? ['greeting','mini_miranda','verification','closing'] : quality === 'average' ? ['greeting','verification'] : ['greeting'],
    script_phrases_missed: quality === 'poor' ? ['mini_miranda','verification','empathy','closing'] : quality === 'average' ? ['empathy','closing'] : [],
    call_outcome: callOutcome,
    call_topics: topics,
    customer_intent: pick(['make_payment','dispute_charge','account_inquiry','request_extension','close_account','general_inquiry']),
    dead_air_count: quality === 'poor' ? rng(2,5) : rng(0,2),
    interruption_count: quality === 'poor' ? rng(3,7) : quality === 'average' ? rng(1,3) : rng(0,1),
    hold_time_seconds: Math.random() < 0.3 ? rng(10,60) : 0,
    transfer_count: Math.random() < 0.1 ? 1 : 0,
    ai_summary: `Call analysis: ${quality} quality ${callData.call_type} call. Outcome: ${callOutcome}.`,
    ai_recommendations: quality === 'poor'
      ? ['Review Mini-Miranda compliance requirements', 'Practice empathy statements', 'Complete de-escalation training']
      : quality === 'average'
      ? ['Improve closing technique', 'Add more empathy statements']
      : ['Excellent call handling - use as training example'],
    ai_model: 'seed-v2',
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// COACHING & GOALS GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

const SESSION_TYPES = ['one_on_one','performance_review','skill_development','self_review'];
const SESSION_TITLES = [
  'Monthly Performance Review', 'Compliance Check-In', 'Empathy Skills Workshop',
  'Call Quality Deep Dive', 'Goal Progress Review', 'De-escalation Techniques',
  'New Script Training', 'Quarterly Performance Review', 'Mini-Miranda Compliance',
  'Active Listening Practice', 'Payment Negotiation Skills', 'Customer Retention Strategies',
];

const GOAL_CATEGORIES = ['quality','compliance','communication','efficiency','development'];
const GOAL_TITLES = {
  quality: ['Achieve 85+ average audit score', 'Maintain 90%+ quality rating', 'Reduce low-score calls below 10%'],
  compliance: ['100% Mini-Miranda compliance', 'Zero compliance violations this month', 'Perfect identity verification rate'],
  communication: ['Improve empathy score to 80+', 'Reduce interruption rate', 'Achieve 85+ communication score'],
  efficiency: ['Reduce average handle time by 15%', 'Increase first-call resolution rate', 'Process 20+ calls per shift'],
  development: ['Complete advanced negotiation training', 'Shadow 5 top performer calls', 'Lead 2 peer coaching sessions'],
};

function generateCoachingSessions(agents, managers, reportCardsByAgent) {
  const sessions = [];
  const now = new Date();

  for (const agent of agents) {
    const agentCards = reportCardsByAgent[agent.id] || [];
    const numSessions = rng(3, 8); // 3-8 sessions per agent over 6 months
    const coach = pick(managers);

    for (let i = 0; i < numSessions; i++) {
      const daysAgo = rng(0, 180);
      const sessionDate = new Date(now.getTime() - daysAgo * 86400000);
      sessionDate.setHours(rng(9, 16), pick([0, 15, 30, 45]), 0, 0);

      const isPast = daysAgo > 1;
      const isFuture = daysAgo === 0 && sessionDate > now;
      const status = isFuture ? 'scheduled'
        : isPast ? pick(['completed','completed','completed','no_show','cancelled'].slice(0, Math.random() < 0.85 ? 3 : 5))
        : 'scheduled';

      const relatedCard = agentCards.length ? pick(agentCards) : null;
      const sessionType = pick(SESSION_TYPES);
      const title = pick(SESSION_TITLES);

      const session = {
        agent_id: agent.id,
        coach_id: coach.id,
        session_type: sessionType,
        title,
        description: `${title} for ${agent.first_name} ${agent.last_name}`,
        status,
        scheduled_at: sessionDate.toISOString(),
        duration_minutes: pick([15, 30, 30, 30, 45, 60]),
        completed_at: status === 'completed' ? new Date(sessionDate.getTime() + rng(15,60) * 60000).toISOString() : null,
        related_report_card_id: relatedCard?.id || null,
        agenda: [
          { topic: 'Review recent call scores', duration: 10 },
          { topic: title, duration: 15 },
          { topic: 'Set action items', duration: 5 },
        ],
        notes: status === 'completed' ? `Discussed ${agent.first_name}'s recent performance. ${
          agentCards.length > 0
            ? `Average score: ${Math.round(agentCards.reduce((s,c) => s + (c.overall_score || 0), 0) / agentCards.length)}/100.`
            : 'No recent audits to review.'
        }` : null,
        action_items: status === 'completed' ? [
          { task: pick(['Review Mini-Miranda script','Practice empathy statements','Listen to 3 top performer calls','Complete compliance refresher']), completed: Math.random() < 0.6 },
          { task: pick(['Set up peer coaching session','Review call recordings from last week','Update personal goals']), completed: Math.random() < 0.4 },
        ] : [],
        agent_feedback: status === 'completed' ? pick([
          'Very helpful session, I have clear action items.',
          'Good discussion about my call quality.',
          'Appreciate the specific feedback on my compliance.',
          null, null,
        ]) : null,
        coach_feedback: status === 'completed' ? pick([
          `${agent.first_name} is making good progress. Focus areas remain empathy and closing.`,
          `Strong improvement in compliance. Need to work on active listening.`,
          `Discussed areas for growth. ${agent.first_name} is receptive to feedback.`,
          `Reviewed several calls together. Agent shows consistent quality.`,
        ]) : null,
        rating: status === 'completed' ? rng(3, 5) : null,
      };
      sessions.push(session);
    }
  }
  return sessions;
}

function generateAgentGoals(agents, managers) {
  const goals = [];
  const now = new Date();

  for (const agent of agents) {
    const numGoals = rng(2, 5);
    const coach = pick(managers);

    for (let i = 0; i < numGoals; i++) {
      const category = pick(GOAL_CATEGORIES);
      const titleOptions = GOAL_TITLES[category];
      const title = pick(titleOptions);
      const startDaysAgo = rng(10, 120);
      const startDate = new Date(now.getTime() - startDaysAgo * 86400000);
      const targetDate = new Date(startDate.getTime() + rng(30, 90) * 86400000);
      const isOverdue = targetDate < now;
      const targetValue = category === 'compliance' ? 100
        : category === 'quality' ? pick([80, 85, 90])
        : category === 'efficiency' ? pick([15, 20, 25])
        : pick([3, 5, 80, 85, 90]);
      const progress = Math.random();
      const currentValue = +(targetValue * progress).toFixed(1);
      const status = progress >= 0.95 ? 'completed'
        : isOverdue ? (Math.random() < 0.3 ? 'missed' : 'active')
        : 'active';

      // Progress history
      const historyPoints = rng(3, 8);
      const progressHistory = [];
      for (let j = 0; j < historyPoints; j++) {
        const histDate = new Date(startDate.getTime() + (j / historyPoints) * (Math.min(now.getTime(), targetDate.getTime()) - startDate.getTime()));
        progressHistory.push({
          date: histDate.toISOString().split('T')[0],
          value: +(targetValue * (j / historyPoints) * progress).toFixed(1),
          note: j === 0 ? 'Goal created' : pick(['Progress update', 'Coaching session review', 'Weekly check-in', null]),
        });
      }

      goals.push({
        agent_id: agent.id,
        created_by: coach.id,
        title,
        description: `Goal: ${title} for ${agent.first_name} ${agent.last_name}`,
        category,
        metric_type: category === 'efficiency' ? 'percentage' : category === 'development' ? 'count' : 'score',
        target_value: targetValue,
        current_value: currentValue,
        baseline_value: +(currentValue * 0.6 + Math.random() * 10).toFixed(1),
        start_date: startDate.toISOString().split('T')[0],
        target_date: targetDate.toISOString().split('T')[0],
        completed_date: status === 'completed' ? new Date(targetDate.getTime() - rng(0,10) * 86400000).toISOString().split('T')[0] : null,
        status,
        priority: pick(['low','medium','medium','high']),
        milestones: [
          { label: '25% progress', target: +(targetValue * 0.25).toFixed(1), reached: progress >= 0.25 },
          { label: '50% progress', target: +(targetValue * 0.5).toFixed(1), reached: progress >= 0.5 },
          { label: '75% progress', target: +(targetValue * 0.75).toFixed(1), reached: progress >= 0.75 },
          { label: 'Goal achieved', target: targetValue, reached: progress >= 0.95 },
        ],
        progress_history: progressHistory,
      });
    }
  }
  return goals;
}


// ═══════════════════════════════════════════════════════════════════════════════
// PERFORMANCE ALERTS GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

const ALERT_TEMPLATES = [
  { type: 'low_score', severity: 'warning', title: 'Low Audit Score', msg: (a) => `${a.first_name} ${a.last_name} scored below 70 on a recent audit. Review recommended.` },
  { type: 'low_score', severity: 'critical', title: 'Critical Low Score', msg: (a) => `${a.first_name} ${a.last_name} scored below 50 on a recent audit. Immediate coaching required.` },
  { type: 'score_drop', severity: 'warning', title: 'Score Declining', msg: (a) => `${a.first_name} ${a.last_name}'s average score dropped 10+ points week-over-week.` },
  { type: 'compliance_violation', severity: 'critical', title: 'Compliance Violation', msg: (a) => `${a.first_name} ${a.last_name} missed Mini-Miranda disclosure on a recorded call.` },
  { type: 'compliance_violation', severity: 'warning', title: 'Identity Verification Skipped', msg: (a) => `${a.first_name} ${a.last_name} discussed account details before verifying customer identity.` },
  { type: 'goal_achieved', severity: 'success', title: 'Goal Achieved', msg: (a) => `${a.first_name} ${a.last_name} achieved their quality improvement goal. Congratulations!` },
  { type: 'goal_at_risk', severity: 'warning', title: 'Goal At Risk', msg: (a) => `${a.first_name} ${a.last_name}'s compliance goal is at risk — only 5 days remaining with 40% progress.` },
  { type: 'excellent_performance', severity: 'success', title: 'Top Performer', msg: (a) => `${a.first_name} ${a.last_name} achieved 90+ average score this week. Outstanding!` },
  { type: 'coaching_due', severity: 'info', title: 'Coaching Session Due', msg: (a) => `${a.first_name} ${a.last_name} is due for a monthly coaching session.` },
  { type: 'improvement_needed', severity: 'warning', title: 'Improvement Needed', msg: (a) => `${a.first_name} ${a.last_name}'s empathy scores have been consistently below average.` },
];

function generatePerformanceAlerts(agents, managers) {
  const alerts = [];
  const now = new Date();

  for (const agent of agents) {
    const numAlerts = rng(2, 6);
    for (let i = 0; i < numAlerts; i++) {
      const template = pick(ALERT_TEMPLATES);
      const daysAgo = rng(0, 60);
      const createdAt = new Date(now.getTime() - daysAgo * 86400000);
      const isAcknowledged = daysAgo > 3 && Math.random() < 0.7;

      alerts.push({
        user_id: agent.id,
        alert_type: template.type,
        severity: template.severity,
        title: template.title,
        message: template.msg(agent),
        related_entity_type: 'report_card',
        metadata: { agent_name: `${agent.first_name} ${agent.last_name}`, team: agent.team || 'TLC Care Team' },
        is_read: isAcknowledged || Math.random() < 0.5,
        is_acknowledged: isAcknowledged,
        acknowledged_by: isAcknowledged ? pick(managers).id : null,
        acknowledged_at: isAcknowledged ? new Date(createdAt.getTime() + rng(1,48) * 3600000).toISOString() : null,
        created_at: createdAt.toISOString(),
        expires_at: new Date(createdAt.getTime() + 30 * 86400000).toISOString(),
      });
    }
  }
  return alerts;
}


// ═══════════════════════════════════════════════════════════════════════════════
// SCORE DISPUTES GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

const DISPUTE_REASONS = [
  'I believe the compliance score is unfair — I did deliver the Mini-Miranda at the start of the call.',
  'The empathy score does not reflect my actual interaction. I spent significant time listening to the customer.',
  'The call was marked as poor quality but the customer was extremely difficult and uncooperative.',
  'I disagree with the resolution score — the customer agreed to a payment plan which is a positive outcome.',
  'The tone score seems too low. I maintained professionalism throughout despite the customer being hostile.',
  'The system didn\'t pick up that I verified identity through security questions before discussing the account.',
  'My communication score should be higher — I clearly explained all options available to the customer.',
];

function generateScoreDisputes(agents, managers, reportCardsByAgent) {
  const disputes = [];
  const comments = [];

  for (const agent of agents) {
    const cards = reportCardsByAgent[agent.id] || [];
    // Only dispute low-scoring cards
    const lowCards = cards.filter(c => c.overall_score < 75);
    const numDisputes = Math.min(rng(0, 2), lowCards.length);

    for (let i = 0; i < numDisputes; i++) {
      const card = lowCards[i];
      const daysAgo = rng(1, 30);
      const createdAt = new Date(Date.now() - daysAgo * 86400000);
      const reviewer = pick(managers);
      const status = pick(['pending','pending','under_review','approved','partially_approved','rejected']);
      const isResolved = ['approved','partially_approved','rejected'].includes(status);

      const disputeId = crypto.randomUUID();
      disputes.push({
        id: disputeId,
        report_card_id: card.id,
        user_id: agent.id,
        dispute_reason: pick(DISPUTE_REASONS),
        criteria_disputed: [pick(['compliance','empathy','communication','tone','resolution'])],
        supporting_evidence: 'Please review the call recording — the transcript may not capture my full interaction.',
        requested_scores: { overall_score: Math.min(100, card.overall_score + rng(10, 20)) },
        status,
        priority: card.overall_score < 50 ? 'high' : 'normal',
        reviewed_by: isResolved ? reviewer.id : null,
        reviewed_at: isResolved ? new Date(createdAt.getTime() + rng(1, 5) * 86400000).toISOString() : null,
        resolution_notes: isResolved
          ? status === 'approved' ? 'Reviewed call recording. Agent\'s assessment is valid. Scores adjusted.'
            : status === 'partially_approved' ? 'Partial adjustment made. Compliance score remains as assessed.'
            : 'After review, original scores are accurate. The system correctly identified the gaps.'
          : null,
        adjusted_scores: status === 'approved' ? { overall_score: Math.min(100, card.overall_score + 12) }
          : status === 'partially_approved' ? { overall_score: Math.min(100, card.overall_score + 5) }
          : null,
        created_at: createdAt.toISOString(),
      });

      // Add comments
      comments.push({
        dispute_id: disputeId,
        user_id: agent.id,
        comment: 'I\'ve submitted this dispute because I believe the scoring doesn\'t reflect my actual performance on this call.',
        is_internal: false,
        created_at: createdAt.toISOString(),
      });
      if (isResolved) {
        comments.push({
          dispute_id: disputeId,
          user_id: reviewer.id,
          comment: status === 'approved'
            ? 'After reviewing the call recording, I agree the scores should be adjusted.'
            : status === 'partially_approved'
            ? 'Reviewed and partially adjusted. Some scores were accurate but empathy was underscored.'
            : 'Reviewed thoroughly. The original scores accurately reflect the call quality.',
          is_internal: false,
          created_at: new Date(createdAt.getTime() + rng(1,3) * 86400000).toISOString(),
        });
      }
    }
  }
  return { disputes, comments };
}


// ═══════════════════════════════════════════════════════════════════════════════
// KEYWORD LIBRARIES & SCRIPT TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

function getKeywordLibraries(adminId) {
  return [
    {
      name: 'TLC Compliance Phrases',
      description: 'Required compliance language for debt collection calls',
      category: 'compliance',
      keywords: [
        { phrase: 'attempt to collect a debt', weight: 1.0, required: true },
        { phrase: 'information obtained will be used for that purpose', weight: 1.0, required: true },
        { phrase: 'recorded line', weight: 0.8 },
        { phrase: 'verify your identity', weight: 0.9 },
        { phrase: 'date of birth', weight: 0.7 },
        { phrase: 'last four of your Social', weight: 0.7 },
        { phrase: 'Mini-Miranda', weight: 1.0, required: true },
      ],
      is_active: true,
      created_by: adminId,
    },
    {
      name: 'Prohibited Language',
      description: 'Phrases that should never be used on calls',
      category: 'prohibited',
      keywords: [
        { phrase: 'I promise', weight: -1.0 },
        { phrase: 'guaranteed', weight: -1.0 },
        { phrase: 'you have to', weight: -0.8 },
        { phrase: 'no choice', weight: -1.0 },
        { phrase: 'legal action', weight: -1.0 },
        { phrase: 'we will sue', weight: -1.0 },
        { phrase: 'garnish your wages', weight: -1.0 },
        { phrase: 'go to jail', weight: -1.0 },
      ],
      is_active: true,
      created_by: adminId,
    },
    {
      name: 'Empathy Phrases',
      description: 'Positive empathy language to encourage',
      category: 'empathy',
      keywords: [
        { phrase: 'I understand', weight: 0.8 },
        { phrase: 'I completely understand', weight: 1.0 },
        { phrase: 'sorry to hear', weight: 0.8 },
        { phrase: 'I appreciate', weight: 0.7 },
        { phrase: 'happy to help', weight: 0.8 },
        { phrase: 'difficult time', weight: 0.6 },
        { phrase: 'let me see what I can do', weight: 0.9 },
        { phrase: 'of course', weight: 0.5 },
      ],
      is_active: true,
      created_by: adminId,
    },
    {
      name: 'Escalation Triggers',
      description: 'Language indicating potential escalation',
      category: 'escalation',
      keywords: [
        { phrase: 'supervisor', weight: -0.5 },
        { phrase: 'manager', weight: -0.5 },
        { phrase: 'complaint', weight: -0.6 },
        { phrase: 'attorney', weight: -0.8 },
        { phrase: 'lawyer', weight: -0.8 },
        { phrase: 'BBB', weight: -0.7 },
        { phrase: 'consumer protection', weight: -0.7 },
      ],
      is_active: true,
      created_by: adminId,
    },
    {
      name: 'Sales & Closing',
      description: 'Effective closing and sales language',
      category: 'closing',
      keywords: [
        { phrase: 'would you like to', weight: 0.7 },
        { phrase: 'can we process', weight: 0.8 },
        { phrase: 'is there anything else', weight: 0.6 },
        { phrase: 'have a great day', weight: 0.5 },
        { phrase: 'thank you for', weight: 0.5 },
      ],
      is_active: true,
      created_by: adminId,
    },
  ];
}

function getScriptTemplates(adminId) {
  return [
    {
      name: 'Collections Outbound Opening',
      description: 'Standard opening for outbound collections calls',
      category: 'opening',
      script_content: 'Good [morning/afternoon], may I please speak with [Customer Name]? Hi [Customer Name], this is [Agent Name] calling from TLC Financial on a recorded line. Before I continue I do need to let you know that this is an attempt to collect a debt and any information obtained will be used for that purpose.',
      required_phrases: ['TLC Financial', 'recorded line', 'attempt to collect a debt', 'information obtained'],
      min_adherence_score: 80,
      is_active: true,
      created_by: adminId,
    },
    {
      name: 'Identity Verification',
      description: 'Customer identity verification procedure',
      category: 'verification',
      script_content: 'Before I can discuss any details, I need to verify your identity. Could I get your date of birth and the last four of your Social Security Number?',
      required_phrases: ['verify', 'date of birth', 'last four', 'Social Security'],
      min_adherence_score: 90,
      is_active: true,
      created_by: adminId,
    },
    {
      name: 'Payment Negotiation',
      description: 'Guidelines for negotiating payment arrangements',
      category: 'negotiation',
      script_content: 'I understand you may be in a difficult situation. Let me see what options we have available. We can set up a payment arrangement that works for both of us. Would you like to explore that?',
      required_phrases: ['understand', 'options', 'payment arrangement'],
      min_adherence_score: 70,
      is_active: true,
      created_by: adminId,
    },
    {
      name: 'Standard Call Closing',
      description: 'Professional call closing script',
      category: 'closing',
      script_content: 'Is there anything else I can help you with today? Thank you for your time, [Customer Name]. Have a great [morning/afternoon].',
      required_phrases: ['anything else', 'thank you'],
      min_adherence_score: 70,
      is_active: true,
      created_by: adminId,
    },
    {
      name: 'Hardship Accommodation',
      description: 'Script for handling hardship cases',
      category: 'objection_handling',
      script_content: 'I\'m sorry to hear you\'re going through a difficult time. We do have accommodation options available. Let me review your account and see what we can offer to help make this more manageable for you.',
      required_phrases: ['sorry to hear', 'accommodation', 'help'],
      min_adherence_score: 75,
      is_active: true,
      created_by: adminId,
    },
    {
      name: 'Full Collections Call',
      description: 'Complete outbound collections call script',
      category: 'full_call',
      script_content: '[Opening] Good [time], may I speak with [Customer]? This is [Agent] from TLC Financial on a recorded line. This is an attempt to collect a debt.\n[Verification] I need to verify your identity. Date of birth and last four of SSN?\n[Purpose] I\'m calling regarding your account ending in [XXXX]. We have a payment of [amount] that was due on [date].\n[Resolution] Are you in a position to take care of this today?\n[Closing] Thank you for your time. Is there anything else I can help with?',
      required_phrases: ['TLC Financial', 'recorded line', 'attempt to collect a debt', 'verify', 'date of birth', 'anything else'],
      min_adherence_score: 80,
      is_active: true,
      created_by: adminId,
    },
  ];
}


// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function seed() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  Cliopa Comprehensive Seeder v2                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── Step 0: Clean old data if requested ────────────────────────────────────
  if (CLEAN) {
    console.log('🧹 Cleaning old seed data...');
    // Delete in dependency order
    const tables = [
      'dispute_comments', 'dispute_history', 'score_disputes',
      'call_analytics', 'performance_alerts',
      'coaching_sessions', 'agent_goals',
      'report_cards', 'calls',
      'keyword_libraries', 'script_templates',
    ];
    for (const table of tables) {
      const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error && !error.message.includes('does not exist')) {
        console.log(`  ⚠  ${table}: ${error.message}`);
      } else {
        console.log(`  ✓  ${table} cleared`);
      }
    }
    console.log('');
  }

  // ── Step 1: Load agents and managers ───────────────────────────────────────
  const { data: allProfiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, role, team');

  if (profErr) throw profErr;
  if (!allProfiles?.length) throw new Error('No profiles found');

  const agents = allProfiles.filter(p => ['ccm', 'crm'].includes(p.role));
  const managers = allProfiles.filter(p => ['admin', 'manager'].includes(p.role));
  const ccmAgents = agents.filter(a => a.role === 'ccm');
  const crmAgents = agents.filter(a => a.role === 'crm');
  const adminUser = managers[0];

  console.log(`👥 Profiles: ${agents.length} agents (${ccmAgents.length} CCM, ${crmAgents.length} CRM), ${managers.length} managers`);
  console.log(`🎯 Target: ${TARGET_CALLS} calls\n`);

  // ── Step 2: Seed keyword libraries & script templates ──────────────────────
  console.log('📚 Seeding keyword libraries & script templates...');
  const keywordLibs = getKeywordLibraries(adminUser.id);
  const { error: kwErr } = await supabase.from('keyword_libraries').insert(keywordLibs);
  if (kwErr) console.log(`  ⚠  keyword_libraries: ${kwErr.message}`);
  else console.log(`  ✓  ${keywordLibs.length} keyword libraries`);

  const scriptTemplates = getScriptTemplates(adminUser.id);
  const { data: insertedTemplates, error: stErr } = await supabase.from('script_templates').insert(scriptTemplates).select('id');
  if (stErr) console.log(`  ⚠  script_templates: ${stErr.message}`);
  else console.log(`  ✓  ${scriptTemplates.length} script templates`);

  const templateIds = (insertedTemplates || []).map(t => t.id);

  // ── Step 3: Seed calls + report_cards + call_analytics ─────────────────────
  console.log(`\n📞 Seeding ${TARGET_CALLS} calls with report cards and analytics...`);

  const agentBiases = {};
  agents.forEach(a => { agentBiases[a.id] = generateAgentBias(); });

  const BATCH_SIZE = 50;
  let callBatch = [];
  let ok = 0, skipped = 0;
  const allReportCards = []; // Track for coaching/disputes
  const t0 = Date.now();

  for (let i = 0; i < TARGET_CALLS; i++) {
    const templateFn = pickTemplate();
    const p = mkParams();
    const result = templateFn(p);

    const pool = result.role === 'crm' ? (crmAgents.length ? crmAgents : agents) : (ccmAgents.length ? ccmAgents : agents);
    const agent = pick(pool);
    const agentName = `${agent.first_name} ${agent.last_name}`;
    const transcript = result.text.replace(/\[AGENT\]/g, agentName);

    const callStart = businessDate(randomCallDate());
    const callEnd = new Date(callStart.getTime() + result.dur * 1000);

    const callData = {
      user_id: agent.id,
      call_id: `SEED-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      campaign_name: result.campaign,
      call_type: result.callType,
      call_start_time: callStart.toISOString(),
      call_end_time: callEnd.toISOString(),
      call_duration_seconds: result.dur,
      transcript_text: transcript,
      customer_phone: phone(),
      customer_name: p.cFull,
      disposition: result.disposition,
      status: result.quality === 'na' ? 'transcribed' : 'audited',
      processing_status: 'completed',
    };

    const scores = generateScores(result.quality, agentBiases[agent.id]);
    callBatch.push({ callData, scores, agent, quality: result.quality, disposition: result.disposition });

    if (callBatch.length >= BATCH_SIZE || i === TARGET_CALLS - 1) {
      // Insert calls
      const callInserts = callBatch.map(b => b.callData);
      const { data: insertedCalls, error: callErr } = await supabase
        .from('calls')
        .insert(callInserts)
        .select('id');

      if (callErr) {
        console.error(`\n  ❌ Batch error at ${i}: ${callErr.message}`);
        callBatch = [];
        continue;
      }

      // Insert report cards
      const reportCards = [];
      callBatch.forEach((b, idx) => {
        if (!b.scores || !insertedCalls[idx]) return;
        const feedback = generateFeedback(b.quality, b.scores);
        const criteria = generateCriteria(b.quality, b.scores);
        const rc = {
          user_id: b.agent.id,
          call_id: insertedCalls[idx].id,
          source_file: b.callData.call_id,
          source_type: 'call',
          overall_score: b.scores.overall,
          communication_score: b.scores.communication,
          compliance_score: b.scores.compliance,
          accuracy_score: b.scores.accuracy,
          tone_score: b.scores.tone,
          empathy_score: b.scores.empathy,
          resolution_score: b.scores.resolution,
          feedback: feedback.summary,
          strengths: feedback.strengths,
          areas_for_improvement: feedback.improvements,
          recommendations: feedback.recommendations,
          criteria_results: criteria,
          ai_model: 'seed-v2',
          ai_provider: 'seed',
          processing_time_ms: rng(50, 200),
          created_at: b.callData.call_start_time,
        };
        reportCards.push(rc);
      });

      if (reportCards.length) {
        const { data: insertedRCs, error: rcErr } = await supabase.from('report_cards').insert(reportCards).select('id, user_id, overall_score');
        if (rcErr) console.error(`\n  ❌ Report card error: ${rcErr.message}`);
        else if (insertedRCs) allReportCards.push(...insertedRCs);
      }

      // Insert call_analytics
      const analytics = [];
      callBatch.forEach((b, idx) => {
        if (!insertedCalls[idx]) return;
        const a = generateCallAnalytics(b.callData, b.scores, b.quality);
        a.call_id = insertedCalls[idx].id;
        a.user_id = b.agent.id;
        if (templateIds.length) a.script_template_id = pick(templateIds);
        a.created_at = b.callData.call_start_time;
        analytics.push(a);
      });

      if (analytics.length) {
        const { error: aErr } = await supabase.from('call_analytics').insert(analytics);
        if (aErr) console.error(`\n  ❌ call_analytics error: ${aErr.message}`);
      }

      ok += callBatch.filter(b => b.scores).length;
      skipped += callBatch.filter(b => !b.scores).length;
      callBatch = [];

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      process.stdout.write(`\r  [${i + 1}/${TARGET_CALLS}] ${elapsed}s | ✅ ${ok} scored | ⏭ ${skipped} voicemails`);
    }
  }

  console.log(`\n  ✓  ${ok} calls with report cards + analytics, ${skipped} voicemails\n`);

  // ── Step 4: Seed coaching sessions & agent goals ───────────────────────────
  console.log('🎓 Seeding coaching sessions & agent goals...');

  // Group report cards by agent
  const reportCardsByAgent = {};
  for (const rc of allReportCards) {
    if (!reportCardsByAgent[rc.user_id]) reportCardsByAgent[rc.user_id] = [];
    reportCardsByAgent[rc.user_id].push(rc);
  }

  const sessions = generateCoachingSessions(agents, managers, reportCardsByAgent);
  // Batch insert sessions
  for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
    const batch = sessions.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('coaching_sessions').insert(batch);
    if (error) console.error(`  ❌ coaching_sessions error: ${error.message}`);
  }
  console.log(`  ✓  ${sessions.length} coaching sessions`);

  const goals = generateAgentGoals(agents, managers);
  const { error: goalsErr } = await supabase.from('agent_goals').insert(goals);
  if (goalsErr) console.error(`  ❌ agent_goals error: ${goalsErr.message}`);
  else console.log(`  ✓  ${goals.length} agent goals`);

  // ── Step 5: Seed performance alerts ────────────────────────────────────────
  console.log('\n🔔 Seeding performance alerts...');
  const alerts = generatePerformanceAlerts(agents, managers);
  const { error: alertsErr } = await supabase.from('performance_alerts').insert(alerts);
  if (alertsErr) console.error(`  ❌ performance_alerts error: ${alertsErr.message}`);
  else console.log(`  ✓  ${alerts.length} performance alerts`);

  // ── Step 6: Seed score disputes ────────────────────────────────────────────
  console.log('\n⚖️  Seeding score disputes...');
  const { disputes, comments } = generateScoreDisputes(agents, managers, reportCardsByAgent);
  if (disputes.length) {
    const { error: dErr } = await supabase.from('score_disputes').insert(disputes);
    if (dErr) console.error(`  ❌ score_disputes error: ${dErr.message}`);
    else console.log(`  ✓  ${disputes.length} score disputes`);
  } else {
    console.log('  ✓  0 disputes (no low-scoring cards to dispute)');
  }
  if (comments.length) {
    const { error: cErr } = await supabase.from('dispute_comments').insert(comments);
    if (cErr) console.error(`  ❌ dispute_comments error: ${cErr.message}`);
    else console.log(`  ✓  ${comments.length} dispute comments`);
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(58)}`);
  console.log('SEED COMPLETE');
  console.log(`  📞 Calls:         ${ok} scored + ${skipped} voicemails`);
  console.log(`  📊 Analytics:     ${ok + skipped} call_analytics records`);
  console.log(`  🎓 Coaching:      ${sessions.length} sessions`);
  console.log(`  🎯 Goals:         ${goals.length} agent goals`);
  console.log(`  🔔 Alerts:        ${alerts.length} performance alerts`);
  console.log(`  ⚖️  Disputes:      ${disputes.length} score disputes`);
  console.log(`  📚 Libraries:     ${keywordLibs.length} keyword libs + ${scriptTemplates.length} scripts`);
  console.log(`  ⏱  Time:          ${totalSec}s`);
  console.log('');
}

seed().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
