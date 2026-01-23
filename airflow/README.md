# Cliopa Airflow Call Sync & AI Audit

This Airflow setup automates the call ingestion and AI auditing pipeline.

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│  Five9 SQL DB   │────▶│  Airflow DAG │────▶│  Gemini AI  │────▶│   Supabase   │
│  (call_recording│     │  (15 min)    │     │  (scoring)  │     │ (calls, etc) │
│    _logs)       │     └──────────────┘     └─────────────┘     └──────────────┘
└─────────────────┘            │
                               │
                        ┌──────▼──────┐
                        │    NAS      │
                        │ (transcripts│
                        │  & audio)   │
                        └─────────────┘
```

## DAG: `call_sync_and_audit`

**Schedule:** Every 15 minutes (`*/15 * * * *`)

### Pipeline Steps:

1. **get_config** - Load configuration from Airflow Variables
2. **fetch_calls_from_five9** - Query SQL Server for new calls (filters voicemails)
3. **filter_existing_calls** - Skip calls already in Supabase
4. **fetch_transcripts** - Download transcripts from NAS URLs
5. **get_agent_mapping** - Resolve/create agent profiles
6. **insert_calls_to_supabase** - Store call records
7. **load_audit_template** - Get audit criteria from database
8. **score_calls_with_gemini** - AI-powered call scoring
9. **save_report_cards** - Store audit results

### Filtering Logic:

The DAG automatically filters out non-scorable calls:
- Calls < 30 seconds (likely hangups)
- Voicemails (disposition contains "voicemail", "vm", etc.)
- No answer calls
- Busy signals
- Disconnected numbers

## Setup

### 1. Install Airflow

```bash
# Create virtual environment
python -m venv airflow_venv
source airflow_venv/bin/activate

# Install Airflow with constraints
AIRFLOW_VERSION=2.8.0
PYTHON_VERSION="$(python --version | cut -d " " -f 2 | cut -d "." -f 1-2)"
CONSTRAINT_URL="https://raw.githubusercontent.com/apache/airflow/constraints-${AIRFLOW_VERSION}/constraints-${PYTHON_VERSION}.txt"

pip install "apache-airflow==${AIRFLOW_VERSION}" --constraint "${CONSTRAINT_URL}"

# Install additional requirements
pip install -r requirements.txt
```

### 2. Initialize Airflow

```bash
# Set Airflow home
export AIRFLOW_HOME=$(pwd)

# Initialize database
airflow db init

# Create admin user
airflow users create \
    --username admin \
    --firstname Admin \
    --lastname User \
    --role Admin \
    --email admin@cliopa.io \
    --password admin
```

### 3. Configure Environment

Create `airflow/.env` with your credentials (used by Docker Compose to populate Airflow Variables):

```bash
MSSQL_SERVER=sql03.ad.yattaops.com
MSSQL_DATABASE=Yatta
MSSQL_USERNAME=bsimmons
MSSQL_PASSWORD=YOUR_PASSWORD
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_KEY
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_MODEL=gemini-2.0-flash
SYNC_LOOKBACK_HOURS=24
SYNC_BATCH_SIZE=50
```

### 4. (Optional) Configure Variables via Airflow UI

Import the variables template and update with real values:

```bash
# Edit config/variables.json with real credentials first!
airflow variables import config/variables.json
```

Or set via UI: **Admin > Variables**

Required Variables:
| Variable | Description |
|----------|-------------|
| `MSSQL_SERVER` | SQL Server hostname |
| `MSSQL_DATABASE` | Database name (Yatta) |
| `MSSQL_USERNAME` | SQL Server username |
| `MSSQL_PASSWORD` | SQL Server password |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `GEMINI_MODEL` | Model name (default: gemini-2.0-flash) |
| `SYNC_LOOKBACK_HOURS` | Hours to look back (default: 24) |
| `SYNC_BATCH_SIZE` | Batch size (default: 50) |

### 5. Start Airflow

```bash
# Start webserver (terminal 1)
airflow webserver --port 8080

# Start scheduler (terminal 2)
airflow scheduler
```

Access UI at: http://localhost:8080

### 6. Enable the DAG

In the Airflow UI:
1. Navigate to DAGs
2. Find `call_sync_and_audit`
3. Toggle the switch to enable
4. (Optional) Click play button to trigger manually

## Getting a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Click "Get API Key"
3. Create a new key or use existing
4. Copy the key and set as `GEMINI_API_KEY` variable

**Recommended Model:** `gemini-2.0-flash`
- Fast processing (~2-5 seconds per call)
- Cost-effective for high volume
- Good quality for structured JSON output

## Monitoring

### Logs

```bash
# View DAG run logs
airflow tasks logs call_sync_and_audit <task_id> <execution_date>

# Or via UI: DAGs > call_sync_and_audit > Graph > Click task > Log
```

### Metrics to Watch

- **New calls per run:** Should see 0-50 depending on call volume
- **Scoring time:** ~2-5 seconds per call with Gemini
- **Cache hit rate:** Increases over time for duplicate transcripts
- **Error rate:** Should be < 5%

## Troubleshooting

### "No module named pymssql"

```bash
# On Mac, may need FreeTDS
brew install freetds
pip install pymssql
```

### SQL Server Connection Issues

Check network access to `sql03.ad.yattaops.com`. May need VPN.

### Gemini Rate Limits

Gemini has rate limits. If hitting limits:
1. Reduce `SYNC_BATCH_SIZE`
2. Add delays between calls
3. Upgrade to paid tier

### Missing Transcripts

Ensure NAS URLs are accessible from the Airflow server:
- `https://nas01.tlcops.com/Five9VmBackup/...`

## Production Deployment

For production, consider:

1. **Use managed Airflow:**
   - Google Cloud Composer
   - Amazon MWAA
   - Astronomer

2. **Secure secrets:**
   - Use Airflow Connections instead of Variables for credentials
   - Or use external secret backend (Vault, AWS Secrets Manager)

3. **Add alerting:**
   - Configure email on failure
   - Set up Slack/PagerDuty integration

4. **Scale workers:**
   - Use CeleryExecutor for parallel processing
   - Set `max_active_tasks_per_dag` appropriately
