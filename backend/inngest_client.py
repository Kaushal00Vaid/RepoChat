import os
import inngest
from dotenv import load_dotenv

load_dotenv()

# INNGEST_DEV=1  → local dev server (default)
# INNGEST_DEV=0  → Inngest Cloud (set this in production env vars)
_is_dev = os.getenv("INNGEST_DEV", "1") == "1"

_signing_key = os.getenv("INNGEST_SIGNING_KEY")
_signing_key = _signing_key if _signing_key else ("deadbeef" if _is_dev else None)

_event_key = os.getenv("INNGEST_EVENT_KEY")
_event_key = _event_key if _event_key else ("dummy" if _is_dev else None)

inngest_client = inngest.Inngest(
    app_id="repochat",
    signing_key=_signing_key,
    event_key=_event_key,
    is_production=not _is_dev,
    # event_api_base_url is only used in dev to point at the local Inngest Dev Server.
    # In production (INNGEST_DEV=0) this must be None so the SDK uses Inngest Cloud.
    event_api_base_url="http://127.0.0.1:8288" if _is_dev else None,
)
