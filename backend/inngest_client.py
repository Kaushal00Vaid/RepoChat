import os
import inngest
from dotenv import load_dotenv

load_dotenv()

_is_dev = os.getenv("INNGEST_DEV", "1") == "1"   # TODO: Change in prod

inngest_client = inngest.Inngest(
    app_id="repochat",
    signing_key=os.getenv("INNGEST_SIGNING_KEY"),
    event_key=os.getenv("INNGEST_EVENT_KEY"),
    is_production=not _is_dev,
    event_api_base_url=os.getenv("INNGEST_BASE_URL", "http://127.0.0.1:8288") if _is_dev else None,
)
