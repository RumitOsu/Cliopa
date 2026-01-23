"""
Cliopa Call Sync & AI Audit DAG

This DAG runs every 15 minutes to:
1. Pull new calls from Five9 SQL Server (fivenine.call_recording_logs)
2. Filter out voicemails and non-scorable calls
3. Fetch transcripts from NAS URLs
4. Score calls with Gemini AI
5. Store results in Supabase (calls, report_cards tables)

Uses TaskFlow API with minimal top-level code.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta
from typing import Any

import google.generativeai as genai
import pymssql
import requests
from airflow.decorators import dag, task
from airflow.models import Variable
from supabase import create_client

logger = logging.getLogger(__name__)


# =============================================================================
# DAG DEFINITION
# =============================================================================

def _parse_json_response(response_text: str) -> dict[str, Any]:
    """Parse a JSON string that may be wrapped in code fences."""
    cleaned = response_text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```", 1)[1]
        if cleaned.lstrip().startswith("json"):
            cleaned = cleaned.lstrip()[4:]
    return json.loads(cleaned)


@dag(
    dag_id="call_sync_and_audit",
    description="Sync Five9 calls to Supabase and score with Gemini AI",
    schedule="*/15 * * * *",  # Every 15 minutes
    start_date=datetime(2025, 1, 1),
    catchup=False,
    max_active_runs=1,
    default_args={
        "owner": "cliopa",
        "retries": 2,
        "retry_delay": timedelta(minutes=2),
        "execution_timeout": timedelta(minutes=10),
    },
    tags=["cliopa", "five9", "ai-audit", "gemini"],
)
def call_sync_dag():
    """Main DAG for syncing and auditing calls."""

    @task()
    def get_config() -> dict[str, Any]:
        """Load configuration from Airflow Variables."""
        return {
            "mssql": {
                "server": Variable.get("MSSQL_SERVER"),
                "database": Variable.get("MSSQL_DATABASE"),
                "username": Variable.get("MSSQL_USERNAME"),
                "password": Variable.get("MSSQL_PASSWORD", deserialize_json=False),
            },
            "supabase": {
                "url": Variable.get("SUPABASE_URL"),
                "service_key": Variable.get("SUPABASE_SERVICE_KEY", deserialize_json=False),
            },
            "gemini": {
                "api_key": Variable.get("GEMINI_API_KEY", deserialize_json=False),
                "model": Variable.get("GEMINI_MODEL", default_var="gemini-2.0-flash"),
            },
            "validation": {
                "enabled": Variable.get("ENABLE_AUDIT_VALIDATION", default_var="false").lower() == "true",
                "model": Variable.get("GEMINI_VALIDATOR_MODEL", default_var="gemini-2.0-flash"),
                "max_tokens": int(Variable.get("GEMINI_VALIDATOR_MAX_TOKENS", default_var="3000")),
            },
            "sync": {
                "lookback_hours": int(Variable.get("SYNC_LOOKBACK_HOURS", default_var="24")),
                "batch_size": int(Variable.get("SYNC_BATCH_SIZE", default_var="50")),
            },
        }

    @task()
    def fetch_calls_from_five9(config: dict[str, Any]) -> list[dict[str, Any]]:
        """
        Fetch new calls from Five9 SQL Server.
        Filters out voicemails and very short calls.
        """
        mssql_config = config["mssql"]
        lookback_hours = config["sync"]["lookback_hours"]

        query = """
        SELECT
            recording_id,
            upload_timestamp,
            file_name,
            call_timestamp,
            length_seconds,
            call_type,
            number1,
            email,
            first_name,
            last_name,
            inf_cust_id,
            disposition,
            campaign,
            agent_name,
            agent_email,
            agent_group,
            deleted,
            status,
            call_id,
            server_name,
            file_path,
            CASE
                WHEN server_name = 'F9' THEN CONCAT(
                    'https://nas01.tlcops.com/Five9VmBackup/',
                    file_path,
                    file_name
                )
                ELSE CONCAT(
                    'https://nas01.tlcops.com',
                    file_path,
                    file_name
                )
            END AS recording_link,
            CASE
                WHEN server_name = 'F9' AND call_id IS NOT NULL THEN
                    CONCAT(
                        'https://nas01.tlcops.com/Five9VmBackup/',
                        REPLACE(file_path, 'recordings', 'transcripts'),
                        call_id, '_', agent_email, '_transcript.txt'
                    )
                WHEN server_name = 'F9' THEN
                    CONCAT(
                        'https://nas01.tlcops.com/Five9VmBackup/',
                        REPLACE(file_path, 'recordings', 'transcripts'),
                        LEFT(file_name, CHARINDEX('_', file_name) - 1),
                        '_', agent_email, '_transcript.txt'
                    )
                ELSE ''
            END AS transcript_link,
            CASE
                WHEN server_name = 'F9' AND call_id IS NOT NULL THEN
                    CONCAT(
                        'https://nas01.tlcops.com/Five9VmBackup/',
                        REPLACE(file_path, 'recordings', 'summaries'),
                        call_id, '_', agent_email, '_summary.txt'
                    )
                WHEN server_name = 'F9' THEN
                    CONCAT(
                        'https://nas01.tlcops.com/Five9VmBackup/',
                        REPLACE(file_path, 'recordings', 'summaries'),
                        LEFT(file_name, CHARINDEX('_', file_name) - 1),
                        '_', agent_email, '_summary.txt'
                    )
                ELSE ''
            END AS summary_link
        FROM fivenine.call_recording_logs
        WHERE
            upload_timestamp >= DATEADD(HOUR, -%s, GETDATE())
            AND deleted = 0
            AND agent_email IS NOT NULL
            AND agent_email != ''
            -- Filter out very short calls (likely hangups)
            AND length_seconds >= 30
            -- Filter out voicemails based on disposition
            AND LOWER(ISNULL(disposition, '')) NOT LIKE '%%voicemail%%'
            AND LOWER(ISNULL(disposition, '')) NOT LIKE '%%vm%%'
            AND LOWER(ISNULL(disposition, '')) NOT LIKE '%%no answer%%'
            AND LOWER(ISNULL(disposition, '')) NOT LIKE '%%busy%%'
            AND LOWER(ISNULL(disposition, '')) NOT LIKE '%%disconnected%%'
        ORDER BY upload_timestamp DESC
        """

        conn = pymssql.connect(
            server=mssql_config["server"],
            user=mssql_config["username"],
            password=mssql_config["password"],
            database=mssql_config["database"],
        )

        try:
            cursor = conn.cursor(as_dict=True)
            cursor.execute(query, (lookback_hours,))
            calls = cursor.fetchall()
            logger.info(f"Fetched {len(calls)} calls from Five9 (last {lookback_hours} hours)")
            return calls
        finally:
            conn.close()

    @task()
    def filter_existing_calls(
        calls: list[dict[str, Any]], config: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Filter out calls that already exist in Supabase."""
        if not calls:
            return []

        supabase = create_client(
            config["supabase"]["url"],
            config["supabase"]["service_key"],
        )

        # Get call IDs to check
        call_ids = [c.get("call_id") or c.get("recording_id") for c in calls if c.get("call_id") or c.get("recording_id")]

        if not call_ids:
            return calls

        # Check which already exist (batch in chunks of 100)
        existing_ids = set()
        for i in range(0, len(call_ids), 100):
            batch = call_ids[i : i + 100]
            result = supabase.table("calls").select("call_id").in_("call_id", batch).execute()
            existing_ids.update(r["call_id"] for r in result.data)

        # Filter to new calls only
        new_calls = [
            c for c in calls
            if (c.get("call_id") or c.get("recording_id")) not in existing_ids
        ]

        logger.info(f"Filtered to {len(new_calls)} new calls ({len(existing_ids)} already synced)")
        return new_calls

    @task()
    def fetch_transcripts(calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Fetch transcript text from NAS URLs for each call."""
        calls_with_transcripts = []

        for call in calls:
            transcript_url = call.get("transcript_link", "")
            summary_url = call.get("summary_link", "")

            transcript_text = None
            summary_text = None

            # Fetch transcript
            if transcript_url:
                try:
                    resp = requests.get(transcript_url, timeout=30)
                    if resp.ok and len(resp.text) >= 10:
                        transcript_text = resp.text
                except Exception as e:
                    logger.warning(f"Failed to fetch transcript for {call.get('call_id')}: {e}")

            # Fetch summary
            if summary_url:
                try:
                    resp = requests.get(summary_url, timeout=30)
                    if resp.ok and len(resp.text) >= 10:
                        summary_text = resp.text
                except Exception as e:
                    logger.warning(f"Failed to fetch summary for {call.get('call_id')}: {e}")

            calls_with_transcripts.append({
                **call,
                "transcript_text": transcript_text,
                "summary_text": summary_text,
            })

        with_transcripts = sum(1 for c in calls_with_transcripts if c.get("transcript_text"))
        logger.info(f"Fetched transcripts: {with_transcripts}/{len(calls)} have transcripts")
        return calls_with_transcripts

    @task()
    def get_agent_mapping(
        calls: list[dict[str, Any]], config: dict[str, Any]
    ) -> dict[str, str]:
        """Get or create agent profiles, return email -> user_id mapping."""
        if not calls:
            return {}

        supabase = create_client(
            config["supabase"]["url"],
            config["supabase"]["service_key"],
        )

        # Get unique agent emails
        agent_emails = list({c.get("agent_email", "").lower() for c in calls if c.get("agent_email")})

        if not agent_emails:
            return {}

        # Fetch existing profiles
        result = supabase.table("profiles").select("id, email").in_("email", agent_emails).execute()
        mapping = {r["email"].lower(): r["id"] for r in result.data}

        # Find missing agents
        missing = [e for e in agent_emails if e not in mapping]

        # Create missing agents
        for email in missing:
            # Find the call data for this agent
            call_data = next((c for c in calls if c.get("agent_email", "").lower() == email), None)
            agent_name = call_data.get("agent_name", "") if call_data else ""

            # Parse name
            if agent_name:
                parts = agent_name.split(" ", 1)
                first_name = parts[0]
                last_name = parts[1] if len(parts) > 1 else ""
            else:
                username = email.split("@")[0]
                name_parts = username.replace(".", " ").replace("_", " ").split()
                first_name = name_parts[0].title() if name_parts else ""
                last_name = name_parts[1].title() if len(name_parts) > 1 else ""

            # Determine team from email domain
            domain = email.split("@")[1] if "@" in email else ""
            team = None
            if "boostcreditline" in domain:
                team = "Boost"
            elif "bisongreen" in domain:
                team = "Bison"
            elif "tlc" in domain:
                team = "TLC"
            elif "yattaops" in domain:
                team = "Yatta"

            try:
                # Create auth user
                auth_result = supabase.auth.admin.create_user({
                    "email": email,
                    "password": f"Temp{datetime.now().timestamp()}!",
                    "email_confirm": True,
                    "user_metadata": {
                        "first_name": first_name,
                        "last_name": last_name,
                        "created_by_airflow": True,
                    },
                })

                user_id = auth_result.user.id

                # Create profile
                supabase.table("profiles").upsert({
                    "id": user_id,
                    "email": email,
                    "first_name": first_name,
                    "last_name": last_name,
                    "role": "agent",
                    "team": team,
                    "hourly_rate": 15.00,
                }).execute()

                mapping[email] = user_id
                logger.info(f"Created agent: {first_name} {last_name} ({email})")

            except Exception as e:
                logger.error(f"Failed to create agent {email}: {e}")

        logger.info(f"Agent mapping: {len(mapping)} agents resolved")
        return mapping

    @task()
    def insert_calls_to_supabase(
        calls: list[dict[str, Any]],
        agent_mapping: dict[str, str],
        config: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """Insert calls into Supabase calls table."""
        if not calls:
            return []

        supabase = create_client(
            config["supabase"]["url"],
            config["supabase"]["service_key"],
        )

        inserted_calls = []

        for call in calls:
            agent_email = call.get("agent_email", "").lower()
            user_id = agent_mapping.get(agent_email)

            if not user_id:
                logger.warning(f"No user_id for agent {agent_email}, skipping call")
                continue

            call_id = call.get("call_id") or call.get("recording_id")
            transcript_text = call.get("transcript_text")

            # Determine call type
            call_type_raw = (call.get("call_type") or "").lower()
            if "outbound" in call_type_raw or "out" in call_type_raw:
                call_type = "outbound"
            elif "internal" in call_type_raw:
                call_type = "internal"
            else:
                call_type = "inbound"

            # Determine status based on transcript availability
            status = "transcribed" if transcript_text else "pending"

            try:
                result = supabase.table("calls").insert({
                    "user_id": user_id,
                    "call_id": call_id,
                    "campaign_name": call.get("campaign"),
                    "call_type": call_type,
                    "call_start_time": call.get("call_timestamp").isoformat() if call.get("call_timestamp") else None,
                    "call_duration_seconds": call.get("length_seconds"),
                    "recording_url": call.get("recording_link"),
                    "transcript_text": transcript_text,
                    "transcript_url": call.get("transcript_link"),
                    "customer_phone": call.get("number1"),
                    "customer_name": " ".join(filter(None, [call.get("first_name"), call.get("last_name")])) or None,
                    "disposition": call.get("disposition"),
                    "status": status,
                }).execute()

                if result.data:
                    inserted_call = result.data[0]
                    inserted_call["transcript_text"] = transcript_text  # Keep for scoring
                    inserted_calls.append(inserted_call)
                    logger.debug(f"Inserted call {call_id}")

            except Exception as e:
                logger.error(f"Failed to insert call {call_id}: {e}")

        logger.info(f"Inserted {len(inserted_calls)} calls to Supabase")
        return inserted_calls

    @task()
    def load_audit_template(config: dict[str, Any]) -> list[dict[str, Any]]:
        """Load the default audit template from Supabase."""
        supabase = create_client(
            config["supabase"]["url"],
            config["supabase"]["service_key"],
        )

        result = supabase.table("audit_templates").select("criteria").eq("is_default", True).single().execute()

        if result.data:
            return result.data["criteria"]

        # Fallback criteria
        return [
            {"id": "QQ", "name": "Qualifying Questions", "description": "Were QQs asked and documented?", "dimension": "compliance"},
            {"id": "VCI", "name": "Verify Customer Info", "description": "Was customer info verified?", "dimension": "compliance"},
            {"id": "WHY_SMILE", "name": "Tone & Friendliness", "description": "Was agent friendly and professional?", "dimension": "tone"},
            {"id": "WHAT_EMPATHY", "name": "Empathy", "description": "Did agent show empathy?", "dimension": "empathy"},
            {"id": "WHERE_RESOLUTION", "name": "Resolution", "description": "Was issue resolved or next steps clear?", "dimension": "resolution"},
        ]

    @task()
    def score_calls_with_gemini(
        calls: list[dict[str, Any]],
        criteria: list[dict[str, Any]],
        config: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """Score calls with Gemini AI."""
        if not calls:
            return []

        gemini_config = config["gemini"]
        genai.configure(api_key=gemini_config["api_key"])
        model = genai.GenerativeModel(gemini_config["model"])

        supabase = create_client(
            config["supabase"]["url"],
            config["supabase"]["service_key"],
        )

        # Build criteria text for prompt
        criteria_text = "\n".join(
            f"- {c['id']}: {c['name']} - {c['description']}"
            for c in criteria
        )

        scored_calls = []

        for call in calls:
            transcript = call.get("transcript_text")
            if not transcript or len(transcript) < 50:
                logger.info(f"Skipping call {call.get('call_id')} - no/short transcript")
                continue

            # Check cache first
            transcript_hash = hashlib.sha256(transcript.strip().lower().encode()).hexdigest()
            cache_result = supabase.table("audit_cache").select("audit_result").eq("transcript_hash", transcript_hash).execute()

            if cache_result.data:
                logger.info(f"Cache HIT for call {call.get('call_id')}")
                audit_result = cache_result.data[0]["audit_result"]
                audit_result["from_cache"] = True
            else:
                # Call Gemini
                prompt = f"""You are an expert call quality auditor. Analyze this call transcript.

CRITERIA TO EVALUATE:
{criteria_text}

TRANSCRIPT:
{transcript[:12000]}

Return ONLY valid JSON with this structure:
{{
  "overall_score": 0-100,
  "communication_score": 0-100,
  "compliance_score": 0-100,
  "accuracy_score": 0-100,
  "tone_score": 0-100,
  "empathy_score": 0-100,
  "resolution_score": 0-100,
  "summary": "2-3 sentence assessment",
  "strengths": ["strength1", "strength2"],
  "areas_for_improvement": ["area1", "area2"],
  "recommendations": ["rec1", "rec2"],
  "criteria": [
    {{"id": "CRITERION_ID", "result": "PASS|PARTIAL|FAIL|N/A", "score": 0-100, "explanation": "...", "recommendation": "..."}}
  ]
}}"""

                try:
                    response = model.generate_content(
                        prompt,
                        generation_config=genai.GenerationConfig(
                            response_mime_type="application/json",
                            temperature=0.3,
                            max_output_tokens=4000,
                        ),
                    )

                    # Parse response
                    audit_result = _parse_json_response(response.text)
                    audit_result["from_cache"] = False

                    # Cache the result
                    supabase.table("audit_cache").upsert({
                        "transcript_hash": transcript_hash,
                        "audit_result": audit_result,
                        "ai_provider": "gemini",
                        "ai_model": gemini_config["model"],
                        "hit_count": 1,
                    }, on_conflict="transcript_hash").execute()

                except Exception as e:
                    logger.error(f"Gemini scoring failed for call {call.get('call_id')}: {e}")
                    continue

            # Add call metadata to result
            audit_result["call_db_id"] = call.get("id")
            audit_result["call_id"] = call.get("call_id")
            audit_result["user_id"] = call.get("user_id")
            audit_result["transcript_text"] = transcript
            scored_calls.append(audit_result)

        logger.info(f"Scored {len(scored_calls)} calls with Gemini")
        return scored_calls

    @task()
    def validate_scored_calls(
        scored_calls: list[dict[str, Any]],
        config: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """Validate/adjust AI scores for consistency using a second Gemini pass."""
        if not scored_calls:
            return []

        if not config["validation"]["enabled"]:
            for r in scored_calls:
                r["validation_status"] = "skipped"
            return scored_calls

        validator_model_name = config["validation"]["model"]
        genai.configure(api_key=config["gemini"]["api_key"])
        validator = genai.GenerativeModel(validator_model_name)

        validated = []

        for result in scored_calls:
            transcript = result.get("transcript_text", "")
            if not transcript:
                result["validation_status"] = "skipped_no_transcript"
                validated.append(result)
                continue

            base_result = {k: v for k, v in result.items() if k != "transcript_text"}

            prompt = f"""You are a senior QA auditor reviewing another AI's call audit.

TASK:
- Verify the audit results against the transcript.
- If the audit is accurate and consistent, set "accept": true.
- If any score/criteria is off, set "accept": false and provide a corrected_result.

TRANSCRIPT:
{transcript[:12000]}

AI_AUDIT_RESULT_JSON:
{json.dumps(base_result, ensure_ascii=True)}

Return ONLY valid JSON with this structure:
{{
  "accept": true|false,
  "notes": "short reasoning",
  "corrected_result": {{ ...full audit result json... }}  // only if accept=false
}}"""

            try:
                response = validator.generate_content(
                    prompt,
                    generation_config=genai.GenerationConfig(
                        response_mime_type="application/json",
                        temperature=0.2,
                        max_output_tokens=config["validation"]["max_tokens"],
                    ),
                )

                validation = _parse_json_response(response.text)
                if validation.get("accept") is True:
                    result["validation_status"] = "accepted"
                    result["validation_notes"] = validation.get("notes")
                    validated.append(result)
                else:
                    corrected = validation.get("corrected_result")
                    if isinstance(corrected, dict):
                        # Preserve call identifiers and metadata
                        corrected["call_db_id"] = result.get("call_db_id")
                        corrected["call_id"] = result.get("call_id")
                        corrected["user_id"] = result.get("user_id")
                        corrected["from_cache"] = result.get("from_cache", False)
                        corrected["validation_status"] = "corrected"
                        corrected["validation_notes"] = validation.get("notes")
                        corrected["transcript_text"] = transcript
                        validated.append(corrected)
                    else:
                        result["validation_status"] = "failed_no_correction"
                        result["validation_notes"] = validation.get("notes")
                        validated.append(result)
            except Exception as e:
                logger.error(f"Validation failed for call {result.get('call_id')}: {e}")
                result["validation_status"] = "failed_error"
                validated.append(result)

        logger.info(f"Validated {len(validated)} scored calls")
        return validated

    @task()
    def save_report_cards(
        scored_calls: list[dict[str, Any]],
        config: dict[str, Any],
    ) -> dict[str, int]:
        """Save audit results as report cards and update call status."""
        if not scored_calls:
            return {"saved": 0, "errors": 0}

        supabase = create_client(
            config["supabase"]["url"],
            config["supabase"]["service_key"],
        )

        saved = 0
        errors = 0

        for result in scored_calls:
            try:
                # Remove large fields not needed in DB
                result.pop("transcript_text", None)
                # Insert report card
                report_card = {
                    "user_id": result["user_id"],
                    "call_id": result["call_db_id"],
                    "source_file": result.get("call_id", "synced_call"),
                    "source_type": "call",
                    "overall_score": result.get("overall_score", 0),
                    "communication_score": result.get("communication_score"),
                    "compliance_score": result.get("compliance_score"),
                    "accuracy_score": result.get("accuracy_score"),
                    "tone_score": result.get("tone_score"),
                    "empathy_score": result.get("empathy_score"),
                    "resolution_score": result.get("resolution_score"),
                    "feedback": result.get("summary"),
                    "strengths": result.get("strengths", []),
                    "areas_for_improvement": result.get("areas_for_improvement", []),
                    "recommendations": result.get("recommendations", []),
                    "criteria_results": result.get("criteria", []),
                    "ai_model": config["gemini"]["model"],
                    "ai_provider": "gemini",
                }

                supabase.table("report_cards").insert(report_card).execute()

                # Update call status to audited
                supabase.table("calls").update({"status": "audited"}).eq("id", result["call_db_id"]).execute()

                saved += 1
                cache_note = " (cached)" if result.get("from_cache") else ""
                logger.info(f"Saved report card for {result.get('call_id')}: {result.get('overall_score')}/100{cache_note}")

            except Exception as e:
                logger.error(f"Failed to save report card for {result.get('call_id')}: {e}")
                errors += 1

        return {"saved": saved, "errors": errors}

    # ==========================================================================
    # DAG FLOW
    # ==========================================================================

    config = get_config()
    raw_calls = fetch_calls_from_five9(config)
    new_calls = filter_existing_calls(raw_calls, config)
    calls_with_transcripts = fetch_transcripts(new_calls)
    agent_mapping = get_agent_mapping(calls_with_transcripts, config)
    inserted_calls = insert_calls_to_supabase(calls_with_transcripts, agent_mapping, config)
    criteria = load_audit_template(config)
    scored_calls = score_calls_with_gemini(inserted_calls, criteria, config)
    validated_calls = validate_scored_calls(scored_calls, config)
    save_report_cards(validated_calls, config)


# Instantiate the DAG
call_sync_dag()
