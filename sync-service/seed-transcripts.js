/**
 * Cliopa Database Seeder - TLC Call Transcripts
 *
 * Generates ~1000 realistic short-term loan company call transcripts,
 * inserts them into Supabase production, and runs Gemini AI audit on each.
 *
 * TLC Financial call center: CCM = Collections/Care, CRM = Retention
 *
 * Usage:
 *   cd sync-service
 *   SUPABASE_SERVICE_KEY=your_key node seed-transcripts.js
 *
 * Env vars:
 *   SUPABASE_URL          Defaults to TLC production
 *   SUPABASE_SERVICE_KEY  Service role key — REQUIRED (bypasses RLS)
 *   GEMINI_API_KEY        Defaults to configured key
 *   TARGET_CALLS          How many calls (default: 1000)
 *   DELAY_MS              Delay between Gemini calls ms (default: 1500)
 *   DRY_RUN               "true" = print sample transcript, no DB writes
 *   START_FROM            Resume from call N (default: 0)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL        = process.env.SUPABASE_URL        || 'https://zkywapiptgpnfkacpyrz.supabase.co';
const SUPABASE_SERVICE_KEY= process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY      = process.env.GEMINI_API_KEY      || 'AIzaSyDYwaogARq39f1QCFekCdBzE6ens-R69L8';
const TARGET_CALLS        = parseInt(process.env.TARGET_CALLS  || '1000');
const DELAY_MS            = parseInt(process.env.DELAY_MS       || '1500');
const DRY_RUN             = process.env.DRY_RUN === 'true';
const START_FROM          = parseInt(process.env.START_FROM     || '0');

if (!SUPABASE_SERVICE_KEY && !DRY_RUN) {
  console.error('\n❌  SUPABASE_SERVICE_KEY is required.\n');
  console.error('   Get it: Supabase Dashboard → Project Settings → API → service_role\n');
  console.error('   Usage:  SUPABASE_SERVICE_KEY=xxx node seed-transcripts.js\n');
  process.exit(1);
}

const supabase = DRY_RUN ? null : createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Random helpers ─────────────────────────────────────────────────────────────
const pick  = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rng   = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
const clamp = (v)  => Math.min(100, Math.max(0, Math.round(v || 0)));

const FIRST_NAMES = [
  'Maria','James','Linda','Robert','Patricia','Michael','Jennifer','David','Susan','William',
  'Jessica','Richard','Sarah','Joseph','Karen','Thomas','Lisa','Charles','Nancy','Christopher',
  'Betty','Daniel','Margaret','Matthew','Sandra','Anthony','Ashley','Mark','Dorothy','Donald',
  'Kimberly','Steven','Emily','Paul','Donna','Andrew','Michelle','Joshua','Carol','Kenneth',
  'Amanda','Kevin','Melissa','Brian','Deborah','George','Stephanie','Timothy','Rebecca','Ronald',
  'Sharon','Edward','Laura','Jason','Cynthia','Jeffrey','Kathleen','Ryan','Amy','Jacob',
  'Angela','Gary','Shirley','Nicholas','Brenda','Eric','Emma','Jonathan','Anna','Stephen',
  'Ruth','Larry','Heather','Justin','Diane','Scott','Julie','Brandon','Joyce','Raymond',
  'Victoria','Frank','Kelly','Gregory','Christina','Samuel','Joan','Patrick','Evelyn','Alexander',
];
const LAST_NAMES = [
  'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
  'Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin',
  'Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson',
  'Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores',
  'Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter','Roberts',
  'Gomez','Phillips','Evans','Turner','Diaz','Parker','Cruz','Edwards','Collins','Reyes',
  'Stewart','Morris','Morales','Murphy','Cook','Rogers','Gutierrez','Ortiz','Morgan','Cooper',
  'Peterson','Bailey','Reed','Kelly','Howard','Ramos','Kim','Cox','Ward','Richardson',
];

const CCM_AGENTS = [
  'Ashley Monroe','Darnell Washington','Kristina Flores','Marcus Thompson',
  'Brianna Davis','Tyler Morrison','Jasmine Carter','Derek Williams',
  'Samantha Reed','Jordan Phillips','Kayla Bennett','Andre Hughes',
];
const CRM_AGENTS = [
  'Nicole Brooks','Brandon Harris','Tiffany Johnson','Carlos Rivera',
  'Megan Sullivan','Andre Mitchell','Stephanie Chen','Kevin Patterson',
];

const CCM_CAMPAIGNS = ['CCM_R7_Outbound','CCM_R10_Outbound','CCM_FPD_Outbound','CCM_PD_Collections'];
const CCM_INBOUND   = ['CCM_Inbound_General','CCM_Inbound_Payments'];
const CRM_CAMPAIGNS = ['CRM_Retention_Outbound','CRM_Save_Inbound','CRM_Win_Back'];

function phone()       { return `(${rng(200,999)}) ${rng(200,999)}-${rng(1000,9999)}`; }
function acct4()       { return String(rng(1000,9999)); }
function ssn4()        { return String(rng(1000,9999)); }
function dob()         { return `${rng(1,12)}/${rng(1,28)}/${rng(1960,1997)}`; }
function loanAmt()     { return pick([200,250,300,350,400,450,500,600,700,800,900,1000,1200,1500]); }
function nsfFee()      { return pick([25,30,35]); }
function extFee()      { return pick([35,40,45,50]); }
function daysPD()      { return pick([1,2,3,5,7,8,10,12,14,18,21,30]); }

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

function dollar(n) {
  if (Math.random() < 0.2) {
    const map = {200:'two hundred',250:'two fifty',300:'three hundred',
                  350:'three fifty',400:'four hundred',500:'five hundred'};
    if (map[n]) return map[n] + ' dollars';
  }
  return `$${Number(n).toFixed(2)}`;
}

// ── Params object passed to every template ─────────────────────────────────────
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

// ── 15 Transcript Templates ───────────────────────────────────────────────────

function T_outbound_good(p) {
  const ag = pick(CCM_AGENTS);
  return {
    ag, role:'ccm', callType:'outbound_collection', quality:'good',
    campaign: pick(CCM_CAMPAIGNS),
    disposition: pick(['Promise to Pay (PTP)','Payment Taken','Payment Arrangement Set']),
    dur: rng(240,520),
    text: `Agent: Good ${greet(p.h)}, may I please speak with ${p.cf} ${p.cl}?
Customer: This is ${p.cf}.
Agent: Hi ${p.cf}, this is ${ag} calling from TLC Financial on a recorded line. Before I continue I do need to let you know that this is an attempt to collect a debt and any information obtained will be used for that purpose. How are you doing today?
Customer: I'm okay, what's this about?
Agent: Of course. I'm calling regarding your TLC account ending in ${p.a4}. Before I can discuss any details, I need to verify your identity. Could I get your date of birth and the last four of your Social Security Number?
Customer: Sure, it's ${p.db} and${ia()}${p.s4}.
Agent: Perfect, thank you. So the reason I'm calling today is that we have a payment of ${dollar(p.pmt)} that was due on ${p.due} and we haven't received that yet. Is everything okay on your end?
Customer: Oh gosh, I completely forgot, I've just been really busy with work.
Agent: I totally understand, life gets hectic. ${p.cf}, are you in a position to process that payment today? We really want to keep your account in good standing.
Customer: Yeah I think I can. Can I use my debit card?
Agent: Absolutely. I'll need your card number, expiration date, and the three-digit security code on the back.
Customer: Okay let me grab my wallet. [pause] It's${ct()}[reads card numbers]${ia()}expiration is oh eight twenty seven, code is three four nine.
Agent: Got it, let me process that. [pause] Alright, the payment of ${dollar(p.pmt)} has gone through successfully. You'll get a confirmation to the email on file. I'm also going to note in your file that we spoke today and the payment was processed. Is there any change to your contact information?
Customer: No everything's the same.
Agent: Perfect. Thank you for taking care of that ${p.cf}. Have a great ${greet(p.h)}.
Customer: Thanks, you too.`,
  };
}

function T_outbound_average(p) {
  const ag = pick(CCM_AGENTS);
  return {
    ag, role:'ccm', callType:'outbound_collection', quality:'average',
    campaign: pick(CCM_CAMPAIGNS),
    disposition: pick(['Callback Scheduled','Partial Promise','Left Message']),
    dur: rng(150,340),
    text: `Agent: Hello can I speak to ${p.cFull}?
Customer: Yeah speaking.
Agent: Hi this is ${ag} from TLC. ${f()} this call is recorded, this is a debt collection call, any info used for that purpose. I'm calling about your account ending in ${p.a4}, I need to verify real quick, what's your date of birth?
Customer: It's ${p.db}.
Agent: Okay and last four of your social?
Customer: ${p.s4}.
Agent: Alright. So${ia()}we have a payment of ${dollar(p.pmt)} due on ${p.due} that we haven't seen. What's going on?
Customer: I've been having some money problems lately to be honest.
Agent: Okay well we do need to get this taken care of. Can you make the payment today?
Customer: I don't know if I can do the full amount.
Agent: Well what can you do?
Customer: Maybe like half?
Agent: Okay so that would be${ia()}${dollar(p.pmt / 2)} by today and then the rest when?
Customer: Maybe in two weeks?
Agent: Alright I'll note that. So you're paying ${dollar(p.pmt / 2)} today and the balance in two weeks?
Customer: Yeah that should work.
Agent: Okay what card?
Customer: My Visa ending in eight eight four two.
Agent: Expiration?
Customer: Eleven twenty six.
Agent: CVV?
Customer: Five one two.
Agent: Processing. [pause] Okay that went through. The remaining balance is due in two weeks. We'll follow up. Anything else?
Customer: No that's it.
Agent: Okay have a good one.`,
  };
}

function T_outbound_poor(p) {
  const ag = pick(CCM_AGENTS);
  return {
    ag, role:'ccm', callType:'outbound_collection', quality:'poor',
    campaign: pick(CCM_CAMPAIGNS),
    disposition: pick(['Refused to Pay','Disputed Debt','Callback Scheduled']),
    dur: rng(70,200),
    text: `Agent: Hi is this ${p.cFull}?
Customer: Who's calling?
Agent: This is ${ag} from TLC.
Customer: Oh. Yeah this is ${p.cf}.
Agent: Yeah so we have you past due on account ${p.a4}. The amount of${ia()}${dollar(p.pmt)} was due ${p.due}. When are you gonna pay?
Customer: Um I wasn't expecting a call. What is this for exactly?
Agent: Your loan. You owe ${dollar(p.pmt)} and it's past due.
Customer: Can you tell me your name again and what company?
Agent: ${ag}, TLC Financial.
Customer: And how much do I owe?
Agent: ${dollar(p.pmt)} as of today.
Customer: But I thought my payment wasn't until${ia()}
Agent: It was due ${p.due}. It's now past due. Are you going to pay or not?
Customer: I just got laid off last week. I need some time.
Agent: Well when can you pay?
Customer: Maybe next Friday?
Agent: Okay so next Friday for the full ${dollar(p.pmt)}?
Customer: I'll try. Can't promise the full amount.
Agent: Well that's what's owed. We'll call back then.
Customer: Okay.
Agent: Bye.`,
  };
}

function T_nsf_return(p) {
  const ag = pick(CCM_AGENTS);
  const total = p.pmt + p.nsf;
  return {
    ag, role:'ccm', callType:'payment_call', quality:'good',
    campaign: pick(CCM_CAMPAIGNS),
    disposition: 'Payment Processed - NSF Resolved',
    dur: rng(300,560),
    text: `Agent: Good ${greet(p.h)}, may I speak with ${p.cFull}?
Customer: Speaking.
Agent: Hi ${p.cf}, this is ${ag} from TLC Financial. This call is recorded and I need to let you know this is an attempt to collect a debt and any information will be used for that purpose. To verify your account, can I get your date of birth and last four of your social?
Customer: Yeah it's ${p.db} and${ct()}${p.s4}.
Agent: Thank you. So the reason for my call is that we processed a payment of ${dollar(p.pmt)} on ${p.due} from your bank account on file, but that payment was returned to us as non-sufficient funds. Were you aware of that?
Customer: What? No, oh my gosh. I must have miscalculated my balance. I'm so sorry.
Agent: I completely understand, it happens. So the original payment of ${dollar(p.pmt)} plus a returned item fee of ${dollar(p.nsf)} brings the total due to ${dollar(total)}. I do want to mention this is the first time this has occurred on your account and I've noted that.
Customer: Is there any way that fee can be waived? I really didn't mean for this to happen.
Agent: ${p.cf}, I understand and I appreciate your cooperation. Let me see what I can do here. [pause] Okay, I was able to get the returned item fee waived as a one-time courtesy given your account history. So the total due is just the original ${dollar(p.pmt)}.
Customer: Oh thank you so much.
Agent: Of course. Can we process that today?
Customer: Yes. Can I use a different account to avoid this happening again?
Agent: Absolutely, that's a great idea. Go ahead and give me the new bank account routing and account numbers.
Customer: Okay [reads bank details]${ia()}.
Agent: Let me get that processed. [pause] The payment of ${dollar(p.pmt)} has been processed successfully. I've updated your file noting this call and the fee waiver. You'll receive email confirmation. Anything else today?
Customer: No that's everything. Thank you for being so understanding.
Agent: Of course. Have a great ${greet(p.h)}.`,
  };
}

function T_inbound_inquiry(p) {
  const ag = pick(CCM_AGENTS);
  return {
    ag, role:'ccm', callType:'inbound_inquiry', quality:'good',
    campaign: pick(CCM_INBOUND),
    disposition: 'Information Provided',
    dur: rng(180,360),
    text: `[background noise]
Agent: Thank you for calling TLC Financial, this is ${ag}, how can I help you today?
Customer: Hi, ${f()} I'm just calling to check on my account balance and when my next payment is due.
Agent: Of course, happy to help. I'll need to verify your identity first. Can I get your full name?
Customer: ${p.cFull}.
Agent: Thank you. And your date of birth and last four of your social?
Customer: ${p.db} and ${p.s4}.
Agent: Perfect. One moment. [typing] Okay so I have your account here, ending in ${p.a4}. Your current balance is ${dollar(p.loan)} and your next payment of ${dollar(p.pmt)} is due on ${p.next}.
Customer: Okay and if I wanted to pay it off early is there a penalty?
Agent: Great question. There is no prepayment penalty, you're welcome to pay early at any time. Would you like to make a payment today?
Customer: Maybe, let me think about it. Also if I can't make the full payment on that date, what are my options?
Agent: We do have an extension option that pushes your due date back fourteen days. There's a fee of ${dollar(p.ext)} which gets added to your next payment. Is there a concern about the due date?
Customer: No no, I think I'll be fine. Just good to know.
Agent: Absolutely, always smart to plan ahead. I'll note in your file that you called in to check your balance today. Is there anything else I can help with?
Customer: No that's all, thank you.
Agent: Of course. Have a great day.`,
  };
}

function T_extension_approved(p) {
  const ag = pick(CCM_AGENTS);
  const newPmt = +(p.pmt + p.ext).toFixed(2);
  return {
    ag, role:'ccm', callType:'inbound_inquiry', quality:'good',
    campaign: pick(CCM_INBOUND),
    disposition: 'Extension Granted',
    dur: rng(210,420),
    text: `Agent: TLC Financial, this is ${ag}, how can I assist you?
Customer: Hi, ${f()} I was hoping to get an extension on my payment that's due ${p.due}. I'm going through a rough patch financially.
Agent: I'm sorry to hear that. I can definitely look into that for you. Let me get your account up. Can I get your full name please?
Customer: ${p.cFull}.
Agent: And date of birth and last four of social for verification?
Customer: ${p.db} and ${p.s4}.
Agent: Thank you. One moment. [pause] Okay I see the payment of ${dollar(p.pmt)} due ${p.due}. What's going on with your situation if you don't mind sharing?
Customer: I had some unexpected car repairs that wiped out my account.
Agent: Oh I'm sorry, that's really stressful. So I do see you're eligible for an extension on this account. That would move your due date out fourteen days to ${p.next}. There is an extension fee of ${dollar(p.ext)} collected with your regular payment on the new date. Does that work?
Customer: Yes that would really help. So the total due on ${p.next} would be ${dollar(newPmt)}?
Agent: Exactly right. Do we have your bank account on file for that?
Customer: Yes the same account is fine.
Agent: Great. Let me go ahead and process that. [typing] Okay, your extension has been approved. New due date is ${p.next} and the total due will be ${dollar(newPmt)}. You'll receive a confirmation by email or text. I'm noting in your file that you called in proactively requesting an extension due to an unexpected expense.
Customer: Thank you so much, that's a relief.
Agent: Absolutely glad I could help. Anything else today?
Customer: No that's it. Thank you.
Agent: Of course. Have a good one ${p.cf}.`,
  };
}

function T_extension_denied(p) {
  const ag = pick(CCM_AGENTS);
  return {
    ag, role:'ccm', callType:'inbound_inquiry', quality:'good',
    campaign: pick(CCM_INBOUND),
    disposition: 'Payment Arrangement',
    dur: rng(240,440),
    text: `Agent: Thanks for calling TLC Financial, this is ${ag}.
Customer: Hi yeah I need another extension on my account, I already got one last month but I'm still having money problems.
Agent: I understand. Let me pull up your account. Can I get your name and verification info?
Customer: ${p.cFull}. Date of birth ${p.db}, social ends in ${p.s4}.
Agent: One moment. [pause] Okay I do see you received an extension previously that pushed your payment. I can see you made that payment which is great. Unfortunately our policy limits extensions to once per billing cycle and since you just had one, I'm not able to approve another at this time.
Customer: Oh come on, things are still really tight.
Agent: I completely hear you ${p.cf}, and I genuinely want to find a solution. What I can do is set up a partial payment today and document the remainder due by the end of the month. That would keep your account in good standing without a full extension. How does that sound?
Customer: Maybe. How much today?
Agent: If you could put down at least half — ${dollar(p.pmt / 2)} — I can document a payment arrangement for the remaining ${dollar(p.pmt / 2)} by end of this month.
Customer: Okay I think I can do that. Let me try my card.
Agent: Go ahead, what's the card number?
Customer: [reads card details]${ia()}.
Agent: Processing. [pause] The partial payment of ${dollar(p.pmt / 2)} went through. I'm documenting the arrangement for the remaining balance due end of month. You'll get a confirmation. Anything else?
Customer: No, I guess that works. Thanks.
Agent: Absolutely. I've noted everything in your file. Take care ${p.cf}.`,
  };
}

function T_nsf_dispute(p) {
  const ag = pick(CCM_AGENTS);
  return {
    ag, role:'ccm', callType:'inbound_inquiry', quality:'good',
    campaign: pick(CCM_INBOUND),
    disposition: 'Dispute Filed',
    dur: rng(270,500),
    text: `Agent: Thank you for calling TLC Financial, this is ${ag}, how can I help?
Customer: Yeah I'm pretty frustrated. I see a ${dollar(p.nsf)} NSF fee on my account and I didn't authorize that. I want it removed.
Agent: I'm sorry to hear you're upset about that. I definitely want to look into this for you. Can I get your name and verify your account?
Customer: ${p.cFull}. Date of birth ${p.db}, social ends in ${p.s4}.
Agent: Thank you ${p.cf}. One moment. [pause] Okay so I do see a returned payment on ${p.due}. The original payment of ${dollar(p.pmt)} was returned as non-sufficient funds, which triggered the ${dollar(p.nsf)} returned item fee per our loan agreement.
Customer: That's not right. I had money in my account. Something went wrong on your end.
Agent: I completely understand your frustration and I take that concern seriously. Do you have a bank statement from that date showing sufficient funds?
Customer: I mean I'd have to pull that up. But I'm telling you I had the money.
Agent: I believe you and I appreciate you bringing this to my attention. Here's what I can do — I'll submit a formal fee review request. If we find the payment should have processed, the fee will absolutely be reversed. Can you email us a bank statement from that date to disputes at tlcfinancial dot com?
Customer: Yeah I can do that. How long does it take?
Agent: Three to five business days once we receive the documentation. I'm noting this call in your file, documenting the dispute, and flagging it for review. Your account won't be negatively impacted while under review.
Customer: Okay and if I'm right do I get the full ${dollar(p.nsf)} back?
Agent: Yes, if the error is confirmed on our end the fee is fully reversed. I want to make sure we get this right for you.
Customer: Alright. I'll send that over today.
Agent: Thank you. I've documented everything. Sorry for the inconvenience. Have a good day.`,
  };
}

function T_payment_by_phone(p) {
  const ag = pick(CCM_AGENTS);
  return {
    ag, role:'ccm', callType:'payment_call', quality:'good',
    campaign: pick(CCM_INBOUND),
    disposition: 'Payment Processed',
    dur: rng(180,360),
    text: `[background noise]
Agent: TLC Financial, ${ag} speaking, how can I help you today?
Customer: Hi I want to make a payment on my account.
Agent: Of course, happy to help. I'll need to verify your identity first. Full name?
Customer: ${p.cFull}.
Agent: Date of birth and last four of social?
Customer: ${p.db} and ${p.s4}.
Agent: I've got your account here, ending in ${p.a4}. Your payment of ${dollar(p.pmt)} is due ${p.next}. Would you like to pay the full amount today?
Customer: Yes, the full amount.
Agent: Great. Debit card or bank account?
Customer: Debit card.
Agent: I'll need the card number, expiration, and CVV on the back.
Customer: Okay it's [reads card]${ct()}expiration is zero nine twenty six, security code eight seven two.
Agent: Thank you. Just to confirm, we're processing ${dollar(p.pmt)} to account ending in ${p.a4}?
Customer: Yes.
Agent: One moment. [pause] ${aff()} the payment of ${dollar(p.pmt)} has been processed successfully. Confirmation number will be in your email shortly.
Customer: Great. Am I all caught up now?
Agent: Yes, your account is current. Is there anything else I can help with?
Customer: No that's everything, thank you.
Agent: Of course. I'm noting this payment in your file. Have a wonderful day.
Customer: You too, bye.`,
  };
}

function T_retention_good(p) {
  const ag = pick(CRM_AGENTS);
  const reduced = +(p.pmt * 0.85).toFixed(2);
  return {
    ag, role:'crm', callType:'retention_call', quality:'good',
    campaign: pick(CRM_CAMPAIGNS),
    disposition: pick(['Account Retained','Saved - Offered Extension','Payment Arrangement']),
    dur: rng(360,620),
    text: `Agent: Good ${greet(p.h)}, ${p.cf}? This is ${ag} calling from TLC Financial. I'm reaching out because I see you've been with us for a while and I just wanted to touch base and make sure everything's going well with your account.
Customer: Oh ${f()} actually yeah, I've been meaning to call. I'm thinking about closing my account.
Agent: Oh, I'm sorry to hear that. I appreciate you being upfront with me. Mind if I ask what's been going on? Is there something specific?
Customer: Honestly the fees seem really high. I found another lender offering better rates.
Agent: I completely understand — fees are definitely something to consider and I appreciate your honesty. Can I ask who the other lender is, if you don't mind?
Customer: It's ${f()}, FastCash or something. They said they could do lower rates on the same amount.
Agent: I see. I want to be transparent — I may not match every offer out there, but I do want to make sure you have all the information before deciding. Is your concern mainly the overall cost, the rate, or the repayment schedule?
Customer: Mainly just the overall cost I guess.
Agent: That's fair. ${p.cf}, I've been looking at your account history and honestly you've been a very reliable customer. Customers with your profile do qualify for our preferred rate program. I can offer you a renewal at a reduced effective rate that would bring your payment down to about ${dollar(reduced)} — roughly fifteen percent less than your current terms.
Customer: Oh really? I didn't know that was an option.
Agent: Yeah I should have reached out about this sooner and I apologize for that. You've genuinely earned it. Does that sound worth considering?
Customer: Yeah actually that sounds pretty good. How does it work?
Agent: It's essentially a renewal with the updated preferred terms. Your current balance rolls over and your new payment is ${dollar(reduced)} going forward. I can process that today if you'd like.
Customer: Okay yeah, I'd rather stay then. Let's do it.
Agent: Wonderful. I'm really glad we had this conversation. [pause] Alright I've processed the renewal and updated your terms. You'll receive a new agreement by email. I'm noting in your file that you called in to discuss the account and we resolved it with a rate adjustment. Anything else today?
Customer: No that's great. Thank you so much for working with me on that.
Agent: Of course. That's exactly what I'm here for. We really value you as a customer ${p.cf}. Have a great day.`,
  };
}

function T_retention_poor(p) {
  const ag = pick(CRM_AGENTS);
  return {
    ag, role:'crm', callType:'retention_call', quality:'poor',
    campaign: pick(CRM_CAMPAIGNS),
    disposition: pick(['Account Closed','Refused Retention Offer']),
    dur: rng(55,150),
    text: `Agent: Hi is this ${p.cFull}?
Customer: Speaking.
Agent: Hi this is ${ag} from TLC. ${f()} I see you wanted to close your account?
Customer: Yeah I've decided I want to close it.
Agent: Okay ${f()} why is that?
Customer: I just don't need it anymore, I found better rates elsewhere.
Agent: Oh okay. Well we do have other options if you're interested.
Customer: I appreciate it but I've already decided.
Agent: Okay ${f()} are you sure? We have some programs.
Customer: Yeah I'm sure. I just want to close it.
Agent: Alright then. I'll process the closure. Is there anything else?
Customer: No that's it.
Agent: Okay I'll go ahead and close the account. Have a good day.
Customer: Thanks.`,
  };
}

function T_crm_outbound_collection(p) {
  const ag = pick(CRM_AGENTS);
  return {
    ag, role:'crm', callType:'outbound_collection', quality:'good',
    campaign: pick(CRM_CAMPAIGNS),
    disposition: 'Payment Arrangement - Hardship',
    dur: rng(300,560),
    text: `Agent: Hello, may I speak with ${p.cFull}?
Customer: Yeah this is ${p.cf}.
Agent: Hi ${p.cf}, this is ${ag} from TLC Financial. Before we continue, this call is being recorded and I need to let you know that this is an attempt to collect a debt and any information obtained will be used for that purpose. To verify I'm speaking with the right person, can I get your date of birth and last four of your social?
Customer: ${f()} it's ${p.db} and ${p.s4}.
Agent: Thank you. So ${p.cf}, I'm reaching out because your account is now ${p.dpd} days past due with a balance of ${dollar(p.loan)}. I want to help get your account current before it causes any further issues. Can you tell me what's been happening?
Customer: Yeah I've been dealing with some financial stuff. Lost my job a couple months ago and I'm just now getting back on my feet.
Agent: I'm really sorry to hear that, that's a tough situation. I want to work with you on this. Given what you're going through, would you be able to make even a small payment today — just to qualify for our hardship arrangement?
Customer: What does the hardship arrangement involve?
Agent: We can extend your payment schedule and reduce the minimum amounts for up to sixty days, giving you time to stabilize. To enroll, I'd need minimum ${dollar(p.pmt * 0.25)} today.
Customer: I think I could manage that. That would really help.
Agent: I'm glad. What card or bank account would you like to use?
Customer: Let me get my card.${ia()}Okay it's [reads card details].
Agent: Perfect. Processing now. [pause] That went through. I've enrolled you in the hardship plan and updated your file with our conversation today. Your new schedule is documented and you'll receive an email confirmation. Is there anything else?
Customer: No, thank you so much.
Agent: Of course. Take care ${p.cf}.`,
  };
}

function T_voicemail(p) {
  const ag = pick([...CCM_AGENTS, ...CRM_AGENTS]);
  return {
    ag, role: Math.random() < 0.6 ? 'ccm' : 'crm',
    callType:'voicemail', quality:'na',
    campaign: pick([...CCM_CAMPAIGNS, ...CRM_CAMPAIGNS]),
    disposition: pick(['Left Voicemail','No Answer','Voicemail Full']),
    dur: rng(20,45),
    text: `Agent: Hello, this message is for ${p.cFull}. This is ${ag} calling from TLC Financial regarding your account ending in ${p.a4}. Please give us a call back at your earliest convenience at our main number. This is an attempt to collect a debt and any information obtained will be used for that purpose. Again this is ${ag} from TLC Financial. Thank you and have a great day.

[End of voicemail]`,
  };
}

function T_financial_hardship(p) {
  const ag = pick(CCM_AGENTS);
  return {
    ag, role:'ccm', callType:'inbound_inquiry', quality:'good',
    campaign: pick(CCM_INBOUND),
    disposition: 'Accommodation Arrangement',
    dur: rng(270,500),
    text: `Agent: Thank you for calling TLC Financial, this is ${ag}, how can I help you today?
Customer: Hi, ${f()} I'm calling because I'm having a really hard time financially and I don't know if I'm going to be able to make my payment on ${p.due}.
Agent: I'm sorry you're going through a difficult time. I definitely want to see what we can do to help. Can I pull up your account? I'll need your name and verification.
Customer: ${p.cFull}. Date of birth ${p.db}, last four of social is ${p.s4}.
Agent: Thank you. I have your account here — payment of ${dollar(p.pmt)} due ${p.due}. Can you tell me a bit about what you're dealing with? I want to find the right solution for your situation.
Customer: My hours got cut at work significantly. I went from full-time to basically part-time so I'm making about half my normal paycheck.
Agent: Oh I'm sorry, that's a really difficult situation. Looking at your account, you do qualify for what we call an accommodation arrangement, designed specifically for situations like yours. We'd split your payment into two smaller installments and push the first out by ten days. Does that help?
Customer: Oh wow, that would actually really help.
Agent: So the first portion would be ${dollar(p.pmt / 2)} in ten days, and the second ${dollar(p.pmt / 2)} a week after that. Does that work with your pay schedule?
Customer: Yeah I get paid every other Friday so that timing actually works really well.
Agent: Perfect. I'm setting up that accommodation now. I'm noting in your file that you called proactively to let us know and that we set up a split payment arrangement. You'll receive an updated payment schedule by email.
Customer: Thank you so much. I was really worried about calling.
Agent: I'm glad you did. That's exactly what we're here for. Is there anything else today?
Customer: No that's it. Thank you for being so understanding.
Agent: Of course. I hope things look up for you soon. Take care.`,
  };
}

function T_broken_ptp(p) {
  const ag = pick(CCM_AGENTS);
  const ptpDate = new Date(p.cd); ptpDate.setDate(ptpDate.getDate() - rng(2,5));
  return {
    ag, role:'ccm', callType:'outbound_collection', quality:'average',
    campaign: pick(CCM_CAMPAIGNS),
    disposition: 'Partial Payment - New PTP Set',
    dur: rng(220,430),
    text: `Agent: Hi, may I speak with ${p.cFull}?
Customer: This is ${p.cf}.
Agent: Hi ${p.cf}, this is ${ag} from TLC Financial and this call is being recorded. I need to let you know this is an attempt to collect a debt and any information will be used for that purpose. To verify your identity, date of birth and last four of social please?
Customer: ${p.db} and ${p.s4}.
Agent: Thank you. ${p.cf}, I'm following up because we had a promise to pay of ${dollar(p.pmt)} noted in your file for ${fmt(ptpDate)} and we haven't received that. What happened?
Customer: Yeah I'm sorry, something came up and I had to use that money for something else.
Agent: I understand, things happen. I do want to resolve this quickly though because your account is now ${p.dpd} days past due. Are you able to take care of this today?
Customer: I can do some of it. Not all.
Agent: Okay. What can you do right now?
Customer: Maybe like${ia()}${dollar(p.pmt * 0.6)}?
Agent: Okay, I can accept a partial payment and set a new promise to pay for the remaining ${dollar(p.pmt * 0.4)} on a specific date. What date works?
Customer: Two weeks from today should work.
Agent: I want to be transparent — this is the second arrangement on this balance and it is important we honor this commitment. Do you understand?
Customer: Yes I understand. I'll have it this time.
Agent: I appreciate that. What payment method today?
Customer: Debit card.
Agent: Go ahead.
Customer: [reads card details]${ia()}.
Agent: Processing. [pause] That went through for ${dollar(p.pmt * 0.6)}. I've documented the new promise of ${dollar(p.pmt * 0.4)} due two weeks from today. You'll get a confirmation. Anything else?
Customer: No that's it.
Agent: Thank you for working with us. Take care.`,
  };
}

// ── Distribution (weights must sum to 100) ────────────────────────────────────
const DIST = [
  { w: 25, fn: T_outbound_good },
  { w: 14, fn: T_outbound_average },
  { w:  7, fn: T_outbound_poor },
  { w:  9, fn: T_nsf_return },
  { w: 10, fn: T_inbound_inquiry },
  { w:  6, fn: T_extension_approved },
  { w:  4, fn: T_extension_denied },
  { w:  4, fn: T_nsf_dispute },
  { w:  5, fn: T_payment_by_phone },
  { w:  4, fn: T_retention_good },
  { w:  2, fn: T_retention_poor },
  { w:  3, fn: T_crm_outbound_collection },
  { w:  3, fn: T_voicemail },
  { w:  2, fn: T_financial_hardship },
  { w:  2, fn: T_broken_ptp },
];
const TOTAL_W = DIST.reduce((s, d) => s + d.w, 0); // 100

function pickTemplate() {
  let r = Math.random() * TOTAL_W;
  for (const d of DIST) { r -= d.w; if (r <= 0) return d.fn; }
  return DIST[0].fn;
}

// ── Gemini audit ───────────────────────────────────────────────────────────────
const CRITERIA = [
  { id:'QQ',               name:'Qualifying Questions',              dim:'compliance',    desc:'Were qualifying questions asked AND documented? (name, DOB, account info)' },
  { id:'VCI',              name:'Verify Customer Information',       dim:'compliance',    desc:'Did agent verify AND document customer identity (DOB + last 4 SSN) before discussing account?' },
  { id:'WHY_SMILE',        name:'Sincerity & Tone',                  dim:'tone',          desc:"Did the agent's sincerity, tone, and friendliness live up to TLC's highest standards of care?" },
  { id:'WHAT_EMPATHY',     name:'Empathy & Care',                    dim:'empathy',       desc:'Did the agent demonstrate genuine care and concern for the customer?' },
  { id:'WHERE_RESOLUTION', name:'Fair Resolution',                   dim:'resolution',    desc:'Was appropriate resolution pursued — fair to both customer and lender?' },
  { id:'WHAT_LISTEN',      name:'Active Listening & Explore',        dim:'communication', desc:'Did the agent listen to the customer and explore all available solutions?' },
  { id:'NOTES',            name:'Proper Documentation',              dim:'accuracy',      desc:'Did the agent mention or indicate proper file documentation?' },
];

const CALL_CONTEXT = {
  outbound_collection: 'OUTBOUND COLLECTION — Mini-Miranda REQUIRED at call start. QQ and VCI mandatory before discussing account. Strict compliance.',
  payment_call:        'PAYMENT CALL — QQ and VCI mandatory. Accurate amounts required. Confirm payment success.',
  inbound_inquiry:     'INBOUND INQUIRY — VCI required before discussing account. Helpful, accurate information. Explore all options.',
  retention_call:      'RETENTION CALL — Empathy and listening are paramount. Must explore WHY customer wants to leave and offer genuine solutions.',
  voicemail:           'VOICEMAIL — Agent left a voicemail. Most criteria N/A. Score only what is observable.',
};

function buildAuditPrompt(callData) {
  const ctx   = CALL_CONTEXT[callData.call_type] || 'GENERAL CALL';
  const cText = CRITERIA.map(c => `- ${c.id}: ${c.name} (${c.dim}) — ${c.desc}`).join('\n');
  return `You are an expert call quality auditor for TLC Financial, a short-term personal loan company. Analyze this transcript carefully and return a JSON quality audit.

CALL TYPE: ${callData.call_type}
CONTEXT: ${ctx}
CAMPAIGN: ${callData.campaign_name || 'General'}
DURATION: ${callData.call_duration_seconds} seconds

AUDIT CRITERIA:
${cText}

KEY COMPLIANCE RULES:
- Outbound collection calls: Mini-Miranda ("This is an attempt to collect a debt...") is REQUIRED at the start
- All calls: Customer identity (DOB + last 4 SSN) MUST be verified before discussing account details
- Agent must indicate file notes/documentation at end of call
- Retention calls: Must explore customer's reason for leaving and offer a genuine solution before giving up

TRANSCRIPT:
${callData.transcript_text.substring(0, 10000)}

Return ONLY valid JSON (no markdown fences):
{
  "overall_score": 0-100,
  "communication_score": 0-100,
  "compliance_score": 0-100,
  "accuracy_score": 0-100,
  "tone_score": 0-100,
  "empathy_score": 0-100,
  "resolution_score": 0-100,
  "summary": "2-3 sentence assessment with specific transcript evidence",
  "strengths": ["strength with evidence"],
  "areas_for_improvement": ["specific gap with evidence"],
  "recommendations": ["actionable coaching tip"],
  "scoring_notes": "any adjustments for call type",
  "criteria": [
    { "id": "QQ", "result": "PASS|PARTIAL|FAIL|N/A", "score": 0-100, "explanation": "cite transcript", "recommendation": "tip if not PASS" }
  ]
}`;
}

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini ${res.status}: ${t.substring(0,200)}`);
  }
  const d = await res.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function parseGemini(text) {
  try {
    return JSON.parse(text.replace(/```json\s*/gi,'').replace(/```\s*/gi,'').trim());
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { return null; } }
    return null;
  }
}

async function auditCall(callData) {
  const t0 = Date.now();
  const prompt = buildAuditPrompt(callData);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raw    = await callGemini(prompt);
      const parsed = parseGemini(raw);
      if (!parsed || typeof parsed.overall_score !== 'number') throw new Error('Bad JSON from Gemini');
      return {
        overall_score:       clamp(parsed.overall_score),
        communication_score: clamp(parsed.communication_score),
        compliance_score:    clamp(parsed.compliance_score),
        accuracy_score:      clamp(parsed.accuracy_score),
        tone_score:          clamp(parsed.tone_score),
        empathy_score:       clamp(parsed.empathy_score),
        resolution_score:    clamp(parsed.resolution_score),
        feedback:            parsed.summary || '',
        strengths:           Array.isArray(parsed.strengths) ? parsed.strengths.slice(0,5) : [],
        areas_for_improvement: Array.isArray(parsed.areas_for_improvement) ? parsed.areas_for_improvement.slice(0,5) : [],
        recommendations:     Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0,5) : [],
        criteria_results:    Array.isArray(parsed.criteria) ? parsed.criteria : [],
        scoring_notes:       parsed.scoring_notes || '',
        processing_time_ms:  Date.now() - t0,
      };
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1500));
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function loadAgents() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, role')
    .in('role', ['ccm','crm','admin','manager']);
  if (error) throw new Error(`Cannot load agents: ${error.message}`);
  if (!data?.length) throw new Error('No agents found. Create user profiles first (role: ccm or crm).');
  console.log(`Loaded ${data.length} agent(s): ${data.map(a=>`${a.first_name||a.email} (${a.role})`).join(', ')}`);
  return data;
}

async function seed() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  Cliopa Seeder — TLC Financial Call Transcripts  ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
  console.log(`Target  : ${TARGET_CALLS} calls`);
  console.log(`Delay   : ${DELAY_MS} ms between Gemini calls (~${(60000/DELAY_MS).toFixed(0)} RPM)`);
  console.log(`Dry run : ${DRY_RUN}`);
  if (START_FROM > 0) console.log(`Resume  : starting from call ${START_FROM}`);
  console.log('');

  if (DRY_RUN) {
    const p = mkParams();
    const r = T_outbound_good(p);
    console.log('── DRY RUN SAMPLE TRANSCRIPT ───────────────────────\n');
    console.log(r.text);
    console.log('\n────────────────────────────────────────────────────');
    const p2 = mkParams();
    const r2 = T_retention_good(p2);
    console.log('\n── SAMPLE AUDIT PROMPT (first 1000 chars) ──────────\n');
    const fakeCall = { call_type: r2.callType, campaign_name: r2.campaign,
                       call_duration_seconds: r2.dur, transcript_text: r2.text };
    console.log(buildAuditPrompt(fakeCall).substring(0,1000) + '...\n');
    return;
  }

  const agents = await loadAgents();
  const ccmAgents = agents.filter(a => ['ccm','admin','manager'].includes(a.role));
  const crmAgents = agents.filter(a => ['crm','admin','manager'].includes(a.role));
  const fallback  = agents;

  let ok = 0, fail = 0;
  const errors = [];
  const t0 = Date.now();

  for (let i = START_FROM; i < TARGET_CALLS; i++) {
    // Progress line
    const elapsed = ((Date.now()-t0)/60000).toFixed(1);
    const rate    = i > START_FROM ? (i - START_FROM) / ((Date.now()-t0)/1000) : 0;
    const eta     = rate > 0 ? ((TARGET_CALLS - i) / rate / 60).toFixed(0) : '?';
    process.stdout.write(`\r[${i+1}/${TARGET_CALLS}] ${elapsed}m elapsed | ETA ${eta}m | ✅ ${ok} ❌ ${fail}   `);

    try {
      const templateFn = pickTemplate();
      const p          = mkParams();
      const result     = templateFn(p);

      // Pick agent matching role preference
      const pool = result.role === 'crm'
        ? (crmAgents.length ? crmAgents : fallback)
        : (ccmAgents.length ? ccmAgents : fallback);
      const agent = pick(pool);

      const callStart = businessDate(randomCallDate());
      const callEnd   = new Date(callStart.getTime() + result.dur * 1000);

      const callData = {
        user_id:               agent.id,
        call_id:               `SEED-${Date.now()}-${Math.random().toString(36).substr(2,9)}`,
        campaign_name:         result.campaign,
        call_type:             result.callType,
        call_start_time:       callStart.toISOString(),
        call_end_time:         callEnd.toISOString(),
        call_duration_seconds: result.dur,
        transcript_text:       result.text,
        customer_phone:        phone(),
        customer_name:         p.cFull,
        disposition:           result.disposition,
        status:                'transcribed',
        processing_status:     'queued',
      };

      // 1. Insert call
      const { data: ins, error: callErr } = await supabase
        .from('calls').insert(callData).select('id').single();
      if (callErr) throw new Error(`Call insert: ${callErr.message}`);

      // 2. Audit via Gemini
      const audit = await auditCall(callData);

      // 3. Insert report card
      const { error: rcErr } = await supabase.from('report_cards').insert({
        user_id:               agent.id,
        call_id:               ins.id,
        source_file:           callData.call_id,
        source_type:           'call',
        overall_score:         audit.overall_score,
        communication_score:   audit.communication_score,
        compliance_score:      audit.compliance_score,
        accuracy_score:        audit.accuracy_score,
        tone_score:            audit.tone_score,
        empathy_score:         audit.empathy_score,
        resolution_score:      audit.resolution_score,
        feedback:              audit.feedback,
        strengths:             audit.strengths,
        areas_for_improvement: audit.areas_for_improvement,
        recommendations:       audit.recommendations,
        criteria_results:      audit.criteria_results,
        ai_model:              'gemini-flash-latest',
        ai_provider:           'gemini',
        processing_time_ms:    audit.processing_time_ms,
      });
      if (rcErr) throw new Error(`Report card: ${rcErr.message}`);

      // 4. Mark call audited
      await supabase.from('calls')
        .update({ status:'audited', processing_status:'completed' })
        .eq('id', ins.id);

      ok++;
    } catch (err) {
      fail++;
      errors.push({ n: i+1, msg: err.message });
      // Print first few errors inline
      if (errors.length <= 10) process.stdout.write(`\n  ✗ #${i+1}: ${err.message}\n`);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  const totalMin = ((Date.now()-t0)/60000).toFixed(1);
  console.log(`\n\n${'═'.repeat(52)}`);
  console.log(`SEED COMPLETE`);
  console.log(`  ✅ Success : ${ok}`);
  console.log(`  ❌ Failed  : ${fail}`);
  console.log(`  ⏱  Time   : ${totalMin} minutes`);
  if (errors.length > 0) {
    console.log('\nFirst errors:');
    errors.slice(0,5).forEach(e => console.log(`  #${e.n}: ${e.msg}`));
  }
  console.log('');
}

seed().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
