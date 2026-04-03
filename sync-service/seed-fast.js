/**
 * Fast Cliopa Seeder — Generates 1000 calls with realistic algorithmic scores.
 * Uses the same transcript templates as seed-transcripts.js but skips Gemini API
 * calls in favor of quality-aware score generation with per-agent skill profiles.
 *
 * Usage:  SUPABASE_SERVICE_KEY=xxx node seed-fast.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL        = process.env.SUPABASE_URL || 'https://zkywapiptgpnfkacpyrz.supabase.co';
const SUPABASE_SERVICE_KEY= process.env.SUPABASE_SERVICE_KEY;
const TARGET_CALLS        = parseInt(process.env.TARGET_CALLS || '1000');

if (!SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_KEY required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Random helpers ─────────────────────────────────────────────────────────────
const pick  = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rng   = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
const clamp = (v)  => Math.min(100, Math.max(0, Math.round(v)));
const gauss = (mean, std) => {
  // Box-Muller transform for normal distribution
  const u1 = Math.random(), u2 = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
};

const FIRST_NAMES = [
  'Maria','James','Linda','Robert','Patricia','Michael','Jennifer','David','Susan','William',
  'Jessica','Richard','Sarah','Joseph','Karen','Thomas','Lisa','Charles','Nancy','Christopher',
  'Betty','Daniel','Margaret','Matthew','Sandra','Anthony','Ashley','Mark','Dorothy','Donald',
  'Kimberly','Steven','Emily','Paul','Donna','Andrew','Michelle','Joshua','Carol','Kenneth',
  'Amanda','Kevin','Melissa','Brian','Deborah','George','Stephanie','Timothy','Rebecca','Ronald',
];
const LAST_NAMES = [
  'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
  'Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin',
  'Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson',
];

const CCM_CAMPAIGNS = ['CCM_R7_Outbound','CCM_R10_Outbound','CCM_FPD_Outbound','CCM_PD_Collections'];
const CCM_INBOUND   = ['CCM_Inbound_General','CCM_Inbound_Payments'];
const CRM_CAMPAIGNS = ['CRM_Retention_Outbound','CRM_Save_Inbound','CRM_Win_Back'];

function phone()   { return `(${rng(200,999)}) ${rng(200,999)}-${rng(1000,9999)}`; }
function acct4()   { return String(rng(1000,9999)); }
function ssn4()    { return String(rng(1000,9999)); }
function dob()     { return `${rng(1,12)}/${rng(1,28)}/${rng(1960,1997)}`; }
function loanAmt() { return pick([200,250,300,350,400,450,500,600,700,800,900,1000,1200,1500]); }
function nsfFee()  { return pick([25,30,35]); }
function extFee()  { return pick([35,40,45,50]); }
function daysPD()  { return pick([1,2,3,5,7,8,10,12,14,18,21,30]); }

function fmt(d)   { return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`; }
function greet(h) { return h < 12 ? 'morning' : 'afternoon'; }

function randomCallDate() {
  const now  = Date.now();
  const ago6 = now - 180 * 86400000;
  return new Date(ago6 + Math.random() * (now - ago6));
}
function businessDate(base) {
  const d = new Date(base);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(rng(8,17), rng(0,59), rng(0,59), 0);
  return d;
}

// Messy auto-transcript helpers
const FILLERS  = ['um','uh','you know','so','like','right'];
const AFFIRM   = ['Uh-huh.','Mm-hmm.','Okay.','Right.','Yes.','I see.'];
function f()   { return pick(FILLERS); }
function aff() { return pick(AFFIRM); }
function ia()  { return Math.random() < 0.1 ? ' [inaudible] ' : ' '; }
function ct()  { return Math.random() < 0.05 ? ' [crosstalk] ' : ' '; }
function dollar(n) { return `$${Number(n).toFixed(2)}`; }

function mkParams() {
  const cd    = businessDate(randomCallDate());
  const loan  = loanAmt();
  const pmt   = Math.random() < 0.35 ? loan : Math.round(loan / pick([2,3,4]) * 100) / 100;
  const due   = new Date(cd); due.setDate(due.getDate() - daysPD());
  const next  = new Date(cd); next.setDate(next.getDate() + 14);
  return {
    cf: pick(FIRST_NAMES), cl: pick(LAST_NAMES),
    get cFull() { return `${this.cf} ${this.cl}`; },
    loan, pmt, nsf: nsfFee(), ext: extFee(),
    a4: acct4(), s4: ssn4(), db: dob(),
    due: fmt(due), next: fmt(next), cd, h: cd.getHours(),
    dpd: daysPD(),
  };
}

// ── Transcript Templates (from original seed-transcripts.js) ────────────────

function T_outbound_good(p) {
  return {
    role:'ccm', callType:'outbound_collection', quality:'good',
    campaign: pick(CCM_CAMPAIGNS),
    disposition: pick(['Promise to Pay (PTP)','Payment Taken','Payment Arrangement Set']),
    dur: rng(240,520),
    text: `Agent: Good ${greet(p.h)}, may I please speak with ${p.cf} ${p.cl}?\nCustomer: This is ${p.cf}.\nAgent: Hi ${p.cf}, this is [AGENT] calling from TLC Financial on a recorded line. Before I continue I do need to let you know that this is an attempt to collect a debt and any information obtained will be used for that purpose. How are you doing today?\nCustomer: I'm okay, what's this about?\nAgent: Of course. I'm calling regarding your TLC account ending in ${p.a4}. Before I can discuss any details, I need to verify your identity. Could I get your date of birth and the last four of your Social Security Number?\nCustomer: Sure, it's ${p.db} and${ia()}${p.s4}.\nAgent: Perfect, thank you. So the reason I'm calling today is that we have a payment of ${dollar(p.pmt)} that was due on ${p.due} and we haven't received that yet. Is everything okay on your end?\nCustomer: Oh gosh, I completely forgot, I've just been really busy with work.\nAgent: I totally understand, life gets hectic. ${p.cf}, are you in a position to process that payment today? We really want to keep your account in good standing.\nCustomer: Yeah I think I can. Can I use my debit card?\nAgent: Absolutely. I'll need your card number, expiration date, and the three-digit security code on the back.\nCustomer: Okay let me grab my wallet. [pause] It's${ct()}[reads card numbers]${ia()}expiration is oh eight twenty seven, code is three four nine.\nAgent: Got it, let me process that. [pause] Alright, the payment of ${dollar(p.pmt)} has gone through successfully. You'll get a confirmation to the email on file. I'm also going to note in your file that we spoke today and the payment was processed. Is there any change to your contact information?\nCustomer: No everything's the same.\nAgent: Perfect. Thank you for taking care of that ${p.cf}. Have a great ${greet(p.h)}.\nCustomer: Thanks, you too.`,
  };
}

function T_outbound_average(p) {
  return {
    role:'ccm', callType:'outbound_collection', quality:'average',
    campaign: pick(CCM_CAMPAIGNS),
    disposition: pick(['Callback Scheduled','Partial Promise','Left Message']),
    dur: rng(150,340),
    text: `Agent: Hello can I speak to ${p.cFull}?\nCustomer: Yeah speaking.\nAgent: Hi this is [AGENT] from TLC. ${f()} this call is recorded, this is a debt collection call, any info used for that purpose. I'm calling about your account ending in ${p.a4}, I need to verify real quick, what's your date of birth?\nCustomer: It's ${p.db}.\nAgent: Okay and last four of your social?\nCustomer: ${p.s4}.\nAgent: Alright. So${ia()}we have a payment of ${dollar(p.pmt)} due on ${p.due} that we haven't seen. What's going on?\nCustomer: I've been having some money problems lately to be honest.\nAgent: Okay well we do need to get this taken care of. Can you make the payment today?\nCustomer: I don't know if I can do the full amount.\nAgent: Well what can you do?\nCustomer: Maybe like half?\nAgent: Okay so that would be${ia()}${dollar(p.pmt / 2)} by today and then the rest when?\nCustomer: Maybe in two weeks?\nAgent: Alright I'll note that. So you're paying ${dollar(p.pmt / 2)} today and the balance in two weeks?\nCustomer: Yeah that should work.\nAgent: Okay what card?\nCustomer: My Visa ending in eight eight four two.\nAgent: Processing. [pause] Okay that went through. The remaining balance is due in two weeks. We'll follow up. Anything else?\nCustomer: No that's it.\nAgent: Okay have a good one.`,
  };
}

function T_outbound_poor(p) {
  return {
    role:'ccm', callType:'outbound_collection', quality:'poor',
    campaign: pick(CCM_CAMPAIGNS),
    disposition: pick(['Refused to Pay','Disputed Debt','Callback Scheduled']),
    dur: rng(70,200),
    text: `Agent: Hi is this ${p.cFull}?\nCustomer: Who's calling?\nAgent: This is [AGENT] from TLC.\nCustomer: Oh. Yeah this is ${p.cf}.\nAgent: Yeah so we have you past due on account ${p.a4}. The amount of${ia()}${dollar(p.pmt)} was due ${p.due}. When are you gonna pay?\nCustomer: Um I wasn't expecting a call. What is this for exactly?\nAgent: Your loan. You owe ${dollar(p.pmt)} and it's past due.\nCustomer: Can you tell me your name again and what company?\nAgent: [AGENT], TLC Financial.\nCustomer: And how much do I owe?\nAgent: ${dollar(p.pmt)} as of today.\nCustomer: But I thought my payment wasn't until${ia()}\nAgent: It was due ${p.due}. It's now past due. Are you going to pay or not?\nCustomer: I just got laid off last week. I need some time.\nAgent: Well when can you pay?\nCustomer: Maybe next Friday?\nAgent: Okay so next Friday for the full ${dollar(p.pmt)}?\nCustomer: I'll try. Can't promise the full amount.\nAgent: Well that's what's owed. We'll call back then.\nCustomer: Okay.\nAgent: Bye.`,
  };
}

function T_inbound_inquiry(p) {
  return {
    role:'ccm', callType:'inbound_inquiry', quality:'good',
    campaign: pick(CCM_INBOUND),
    disposition: 'Information Provided',
    dur: rng(180,360),
    text: `[background noise]\nAgent: Thank you for calling TLC Financial, this is [AGENT], how can I help you today?\nCustomer: Hi, ${f()} I'm just calling to check on my account balance and when my next payment is due.\nAgent: Of course, happy to help. I'll need to verify your identity first. Can I get your full name?\nCustomer: ${p.cFull}.\nAgent: Thank you. And your date of birth and last four of your social?\nCustomer: ${p.db} and ${p.s4}.\nAgent: Perfect. One moment. [typing] Okay so I have your account here, ending in ${p.a4}. Your current balance is ${dollar(p.loan)} and your next payment of ${dollar(p.pmt)} is due on ${p.next}.\nCustomer: Okay and if I wanted to pay it off early is there a penalty?\nAgent: Great question. There is no prepayment penalty, you're welcome to pay early at any time. Would you like to make a payment today?\nCustomer: Maybe, let me think about it. Also if I can't make the full payment on that date, what are my options?\nAgent: We do have an extension option that pushes your due date back fourteen days. There's a fee of ${dollar(p.ext)} which gets added to your next payment. Is there a concern about the due date?\nCustomer: No no, I think I'll be fine. Just good to know.\nAgent: Absolutely, always smart to plan ahead. I'll note in your file that you called in to check your balance today. Is there anything else I can help with?\nCustomer: No that's all, thank you.\nAgent: Of course. Have a great day.`,
  };
}

function T_payment_call(p) {
  return {
    role:'ccm', callType:'payment_call', quality:'good',
    campaign: pick(CCM_INBOUND),
    disposition: 'Payment Processed',
    dur: rng(180,360),
    text: `Agent: TLC Financial, [AGENT] speaking, how can I help you today?\nCustomer: Hi I want to make a payment on my account.\nAgent: Of course, happy to help. I'll need to verify your identity first. Full name?\nCustomer: ${p.cFull}.\nAgent: Date of birth and last four of social?\nCustomer: ${p.db} and ${p.s4}.\nAgent: I've got your account here, ending in ${p.a4}. Your payment of ${dollar(p.pmt)} is due ${p.next}. Would you like to pay the full amount today?\nCustomer: Yes, the full amount.\nAgent: Great. Debit card or bank account?\nCustomer: Debit card.\nAgent: I'll need the card number, expiration, and CVV on the back.\nCustomer: Okay it's [reads card]${ct()}expiration is zero nine twenty six, security code eight seven two.\nAgent: Thank you. Just to confirm, we're processing ${dollar(p.pmt)} to account ending in ${p.a4}?\nCustomer: Yes.\nAgent: One moment. [pause] The payment of ${dollar(p.pmt)} has been processed successfully. Confirmation number will be in your email shortly.\nCustomer: Great. Am I all caught up now?\nAgent: Yes, your account is current. Is there anything else I can help with?\nCustomer: No that's everything, thank you.\nAgent: Of course. I'm noting this payment in your file. Have a wonderful day.`,
  };
}

function T_retention_good(p) {
  const reduced = +(p.pmt * 0.85).toFixed(2);
  return {
    role:'crm', callType:'retention_call', quality:'good',
    campaign: pick(CRM_CAMPAIGNS),
    disposition: pick(['Account Retained','Saved - Offered Extension','Payment Arrangement']),
    dur: rng(360,620),
    text: `Agent: Good ${greet(p.h)}, ${p.cf}? This is [AGENT] calling from TLC Financial. I'm reaching out because I see you've been with us for a while and I just wanted to touch base.\nCustomer: Oh ${f()} actually yeah, I've been meaning to call. I'm thinking about closing my account.\nAgent: Oh, I'm sorry to hear that. I appreciate you being upfront with me. Mind if I ask what's been going on?\nCustomer: Honestly the fees seem really high. I found another lender offering better rates.\nAgent: I completely understand. Can I ask who the other lender is, if you don't mind?\nCustomer: It's ${f()}, FastCash or something.\nAgent: I see. I want to be transparent — I may not match every offer out there, but I do want to make sure you have all the information. Is your concern mainly the overall cost?\nCustomer: Mainly just the overall cost I guess.\nAgent: That's fair. ${p.cf}, I've been looking at your account history and honestly you've been a very reliable customer. I can offer you a renewal at a reduced effective rate that would bring your payment down to about ${dollar(reduced)} — roughly fifteen percent less.\nCustomer: Oh really? I didn't know that was an option.\nAgent: Yeah I should have reached out about this sooner. Does that sound worth considering?\nCustomer: Yeah actually that sounds pretty good. Let's do it.\nAgent: Wonderful. I'm really glad we had this conversation. [pause] Alright I've processed the renewal and updated your terms. You'll receive a new agreement by email. Anything else today?\nCustomer: No that's great. Thank you so much.\nAgent: Of course. We really value you as a customer ${p.cf}. Have a great day.`,
  };
}

function T_retention_poor(p) {
  return {
    role:'crm', callType:'retention_call', quality:'poor',
    campaign: pick(CRM_CAMPAIGNS),
    disposition: pick(['Account Closed','Refused Retention Offer']),
    dur: rng(55,150),
    text: `Agent: Hi is this ${p.cFull}?\nCustomer: Speaking.\nAgent: Hi this is [AGENT] from TLC. ${f()} I see you wanted to close your account?\nCustomer: Yeah I've decided I want to close it.\nAgent: Okay ${f()} why is that?\nCustomer: I just don't need it anymore, I found better rates elsewhere.\nAgent: Oh okay. Well we do have other options if you're interested.\nCustomer: I appreciate it but I've already decided.\nAgent: Okay ${f()} are you sure? We have some programs.\nCustomer: Yeah I'm sure.\nAgent: Alright then. I'll process the closure. Is there anything else?\nCustomer: No that's it.\nAgent: Okay have a good day.`,
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
    text: `Agent: Good ${greet(p.h)}, may I speak with ${p.cFull}?\nCustomer: Speaking.\nAgent: Hi ${p.cf}, this is [AGENT] from TLC Financial. This call is recorded and I need to let you know this is an attempt to collect a debt. To verify your account, can I get your date of birth and last four of your social?\nCustomer: Yeah it's ${p.db} and${ct()}${p.s4}.\nAgent: Thank you. So the reason for my call is that we processed a payment of ${dollar(p.pmt)} on ${p.due} from your bank account on file, but that payment was returned as non-sufficient funds. Were you aware of that?\nCustomer: What? No, oh my gosh. I must have miscalculated my balance.\nAgent: I completely understand. So the original payment of ${dollar(p.pmt)} plus a returned item fee of ${dollar(p.nsf)} brings the total due to ${dollar(total)}. I've noted this is the first time this has occurred.\nCustomer: Is there any way that fee can be waived?\nAgent: Let me see what I can do. [pause] Okay, I was able to get the returned item fee waived as a one-time courtesy. So the total due is just the original ${dollar(p.pmt)}.\nCustomer: Oh thank you so much.\nAgent: Can we process that today with a different account?\nCustomer: Yes. [reads bank details]${ia()}.\nAgent: Let me get that processed. [pause] The payment of ${dollar(p.pmt)} has been processed successfully. I've updated your file. You'll receive email confirmation. Anything else?\nCustomer: No thank you.\nAgent: Of course. Have a great ${greet(p.h)}.`,
  };
}

function T_hardship(p) {
  return {
    role:'ccm', callType:'inbound_inquiry', quality:'good',
    campaign: pick(CCM_INBOUND),
    disposition: 'Accommodation Arrangement',
    dur: rng(270,500),
    text: `Agent: Thank you for calling TLC Financial, this is [AGENT], how can I help you today?\nCustomer: Hi, ${f()} I'm calling because I'm having a really hard time financially and I don't know if I'm going to be able to make my payment on ${p.due}.\nAgent: I'm sorry you're going through a difficult time. Let me see what we can do. Can I get your name and verification?\nCustomer: ${p.cFull}. Date of birth ${p.db}, last four of social is ${p.s4}.\nAgent: Thank you. I have your account here — payment of ${dollar(p.pmt)} due ${p.due}. Can you tell me about what you're dealing with?\nCustomer: My hours got cut at work significantly.\nAgent: I'm sorry. Looking at your account, you qualify for an accommodation arrangement — we'd split your payment into two smaller installments. The first ${dollar(p.pmt / 2)} in ten days, and the second ${dollar(p.pmt / 2)} a week after.\nCustomer: That would really help.\nAgent: Perfect. I'm setting up that accommodation now. I'm noting in your file that you called proactively. You'll receive an updated schedule by email.\nCustomer: Thank you so much.\nAgent: Of course. I hope things look up for you soon. Take care.`,
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
  { w:  5, fn: T_outbound_average },  // extra average variety
];
const TOTAL_W = DIST.reduce((s, d) => s + d.w, 0);

function pickTemplate() {
  let r = Math.random() * TOTAL_W;
  for (const d of DIST) { r -= d.w; if (r <= 0) return d.fn; }
  return DIST[0].fn;
}

// ── Score Generation ─────────────────────────────────────────────────────────
// Each agent gets a persistent "skill profile" that determines their baseline
// scores. Good templates score higher, poor templates lower, with variance.

const QUALITY_PROFILES = {
  good: {
    overall: [85, 6],     // mean, stddev
    compliance: [90, 5],
    communication: [87, 5],
    empathy: [84, 6],
    resolution: [86, 5],
    accuracy: [88, 5],
    tone: [88, 5],
  },
  average: {
    overall: [72, 7],
    compliance: [75, 8],
    communication: [73, 7],
    empathy: [68, 8],
    resolution: [70, 7],
    accuracy: [74, 7],
    tone: [72, 7],
  },
  poor: {
    overall: [55, 8],
    compliance: [50, 10],
    communication: [58, 8],
    empathy: [52, 9],
    resolution: [48, 9],
    accuracy: [55, 8],
    tone: [55, 9],
  },
  na: null,  // voicemail — not scored
};

// Generate per-agent skill bias (some agents are consistently better/worse)
function generateAgentBias() {
  return {
    overall: gauss(0, 4),
    compliance: gauss(0, 5),
    communication: gauss(0, 4),
    empathy: gauss(0, 5),
    resolution: gauss(0, 4),
    accuracy: gauss(0, 4),
    tone: gauss(0, 3),
  };
}

function generateScores(quality, agentBias) {
  const profile = QUALITY_PROFILES[quality];
  if (!profile) return null; // voicemail

  const scores = {};
  for (const [dim, [mean, std]] of Object.entries(profile)) {
    const biasedMean = mean + (agentBias[dim] || 0);
    scores[dim] = clamp(gauss(biasedMean, std));
  }

  // Recalculate overall as weighted average of dimensions
  const dims = ['compliance','communication','empathy','resolution','accuracy','tone'];
  const weights = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
  const weightedSum = dims.reduce((sum, d, i) => sum + scores[d] * weights[i], 0);
  scores.overall = clamp(weightedSum / weights.reduce((a, b) => a + b, 0));

  return scores;
}

function generateFeedback(quality, scores) {
  const strengths = [];
  const improvements = [];
  const recommendations = [];

  if (quality === 'good') {
    if (scores.compliance >= 85) strengths.push('Properly delivered Mini-Miranda disclosure and verified customer identity before discussing account details');
    if (scores.empathy >= 80) strengths.push('Demonstrated genuine empathy and understanding of customer situation');
    if (scores.communication >= 85) strengths.push('Clear, professional communication throughout the call');
    if (scores.resolution >= 85) strengths.push('Achieved positive resolution that benefits both customer and company');
    if (scores.accuracy >= 85) strengths.push('Properly documented the call and noted all relevant account changes');
    if (scores.tone >= 85) strengths.push('Maintained warm, friendly tone that reflects TLC values');
    if (improvements.length === 0) improvements.push('Minor: Could explore additional solutions or cross-sell opportunities where appropriate');
    recommendations.push('Continue this level of quality — agent is a strong example for peer coaching');
  } else if (quality === 'average') {
    if (scores.compliance >= 70) strengths.push('Basic compliance requirements were met');
    else improvements.push('Mini-Miranda delivery was rushed or incomplete — must be clearly stated at call opening');
    if (scores.empathy < 75) improvements.push('Limited empathy shown — agent should acknowledge customer feelings before moving to solutions');
    if (scores.communication < 75) improvements.push('Communication was functional but lacked warmth and clarity');
    if (scores.tone < 75) improvements.push('Tone was somewhat flat — needs more genuine engagement with the customer');
    strengths.push('Completed basic call requirements and achieved partial resolution');
    recommendations.push('Focus on empathy training and active listening techniques');
    recommendations.push('Practice delivering Mini-Miranda naturally without rushing');
  } else if (quality === 'poor') {
    improvements.push('Failed to properly identify themselves and deliver required Mini-Miranda disclosure');
    improvements.push('Showed little to no empathy for customer situation — came across as aggressive');
    improvements.push('Did not explore available solutions or payment arrangements');
    if (scores.compliance < 60) improvements.push('Critical compliance failure: Customer identity not properly verified before discussing account');
    strengths.push('Call was brief and direct');
    recommendations.push('Immediate coaching session required — review compliance requirements');
    recommendations.push('Shadow a top performer to observe empathy and de-escalation techniques');
    recommendations.push('Practice scenario-based training for difficult customer interactions');
  }

  const summary = quality === 'good'
    ? `Strong call performance. Agent followed TLC protocols, demonstrated genuine care for the customer, and achieved a positive outcome. Overall score: ${scores.overall}/100.`
    : quality === 'average'
    ? `Adequate call performance with room for improvement. Basic requirements were met but empathy and communication could be enhanced. Overall score: ${scores.overall}/100.`
    : `Below standard call performance. Multiple compliance and quality issues identified requiring immediate coaching intervention. Overall score: ${scores.overall}/100.`;

  return { summary, strengths: strengths.slice(0, 4), improvements: improvements.slice(0, 4), recommendations: recommendations.slice(0, 3) };
}

function generateCriteria(quality, scores) {
  const criteria = [
    {
      id: 'QQ', result: scores.compliance >= 80 ? 'PASS' : scores.compliance >= 60 ? 'PARTIAL' : 'FAIL',
      score: scores.compliance, explanation: quality === 'good'
        ? 'Agent asked qualifying questions including name, DOB, and account information.'
        : quality === 'average' ? 'Qualifying questions were asked but in a rushed manner.'
        : 'Agent did not properly ask all qualifying questions.',
    },
    {
      id: 'VCI', result: scores.compliance >= 75 ? 'PASS' : scores.compliance >= 55 ? 'PARTIAL' : 'FAIL',
      score: Math.min(100, scores.compliance + rng(-5, 5)),
      explanation: quality === 'good'
        ? 'Customer identity verified with DOB and last 4 SSN before any account discussion.'
        : quality === 'average' ? 'Identity was verified but not before some account details were mentioned.'
        : 'Identity verification was incomplete or skipped.',
    },
    {
      id: 'WHY_SMILE', result: scores.tone >= 80 ? 'PASS' : scores.tone >= 60 ? 'PARTIAL' : 'FAIL',
      score: scores.tone,
      explanation: quality === 'good'
        ? 'Agent maintained a sincere, warm tone throughout the interaction.'
        : quality === 'average' ? 'Tone was functional but lacked warmth and genuine friendliness.'
        : 'Tone was cold and transactional, not meeting TLC standards.',
    },
    {
      id: 'WHAT_EMPATHY', result: scores.empathy >= 80 ? 'PASS' : scores.empathy >= 60 ? 'PARTIAL' : 'FAIL',
      score: scores.empathy,
      explanation: quality === 'good'
        ? 'Agent demonstrated genuine care and concern for the customer throughout.'
        : quality === 'average' ? 'Some empathy shown but felt formulaic rather than genuine.'
        : 'Little to no empathy demonstrated — customer concerns were dismissed.',
    },
    {
      id: 'WHERE_RESOLUTION', result: scores.resolution >= 80 ? 'PASS' : scores.resolution >= 60 ? 'PARTIAL' : 'FAIL',
      score: scores.resolution,
      explanation: quality === 'good'
        ? 'Fair resolution achieved that serves both customer needs and company interests.'
        : quality === 'average' ? 'Partial resolution — agent did not fully explore all available options.'
        : 'No meaningful resolution pursued. Agent was dismissive of customer needs.',
    },
    {
      id: 'WHAT_LISTEN', result: scores.communication >= 80 ? 'PASS' : scores.communication >= 60 ? 'PARTIAL' : 'FAIL',
      score: scores.communication,
      explanation: quality === 'good'
        ? 'Agent actively listened and explored solutions tailored to the customer.'
        : quality === 'average' ? 'Agent listened but did not fully explore available options.'
        : 'Agent talked over customer and did not listen to their concerns.',
    },
    {
      id: 'NOTES', result: scores.accuracy >= 80 ? 'PASS' : scores.accuracy >= 60 ? 'PARTIAL' : 'FAIL',
      score: scores.accuracy,
      explanation: quality === 'good'
        ? 'Agent explicitly mentioned noting the call in the customer file.'
        : quality === 'average' ? 'Documentation was mentioned briefly but not in detail.'
        : 'No mention of file documentation or notes.',
    },
  ];
  return criteria;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function seed() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  Cliopa Fast Seeder — Algorithmic Scoring        ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
  console.log(`Target: ${TARGET_CALLS} calls\n`);

  // Load agents
  const { data: agents, error: agentErr } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, role')
    .in('role', ['ccm', 'crm']);

  if (agentErr) throw agentErr;
  if (!agents?.length) throw new Error('No agents found');

  const ccmAgents = agents.filter(a => a.role === 'ccm');
  const crmAgents = agents.filter(a => a.role === 'crm');

  console.log(`Agents: ${ccmAgents.length} CCM, ${crmAgents.length} CRM\n`);

  // Generate per-agent skill biases
  const agentBiases = {};
  agents.forEach(a => { agentBiases[a.id] = generateAgentBias(); });

  // Batch insert for speed
  const BATCH_SIZE = 50;
  let callBatch = [];
  let ok = 0, skipped = 0;
  const t0 = Date.now();

  for (let i = 0; i < TARGET_CALLS; i++) {
    const templateFn = pickTemplate();
    const p = mkParams();
    const result = templateFn(p);

    // Pick agent matching role
    const pool = result.role === 'crm' ? (crmAgents.length ? crmAgents : agents) : (ccmAgents.length ? ccmAgents : agents);
    const agent = pick(pool);

    // Replace [AGENT] placeholder with agent name
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
      processing_status: result.quality === 'na' ? 'completed' : 'completed',
    };

    // Generate scores (skip voicemails)
    const scores = generateScores(result.quality, agentBiases[agent.id]);

    callBatch.push({ callData, scores, agent, quality: result.quality });

    // Flush batch
    if (callBatch.length >= BATCH_SIZE || i === TARGET_CALLS - 1) {
      // Insert calls
      const callInserts = callBatch.map(b => b.callData);
      const { data: insertedCalls, error: callErr } = await supabase
        .from('calls')
        .insert(callInserts)
        .select('id');

      if (callErr) {
        console.error(`\nBatch error at ${i}: ${callErr.message}`);
        callBatch = [];
        continue;
      }

      // Insert report cards for scored calls
      const reportCards = [];
      callBatch.forEach((b, idx) => {
        if (!b.scores || !insertedCalls[idx]) return;

        const feedback = generateFeedback(b.quality, b.scores);
        const criteria = generateCriteria(b.quality, b.scores);

        reportCards.push({
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
          ai_model: 'algorithmic-seed',
          ai_provider: 'seed',
          processing_time_ms: rng(50, 200),
          created_at: b.callData.call_start_time, // Match call date for realistic distribution
        });
      });

      if (reportCards.length) {
        const { error: rcErr } = await supabase.from('report_cards').insert(reportCards);
        if (rcErr) console.error(`\nReport card error: ${rcErr.message}`);
      }

      ok += callBatch.filter(b => b.scores).length;
      skipped += callBatch.filter(b => !b.scores).length;
      callBatch = [];

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      process.stdout.write(`\r[${i + 1}/${TARGET_CALLS}] ${elapsed}s | ✅ ${ok} scored | ⏭ ${skipped} voicemails`);
    }
  }

  const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n\n${'═'.repeat(52)}`);
  console.log(`SEED COMPLETE`);
  console.log(`  ✅ Scored  : ${ok}`);
  console.log(`  ⏭  Skipped : ${skipped} (voicemails)`);
  console.log(`  ⏱  Time   : ${totalSec}s`);
  console.log('');
}

seed().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
