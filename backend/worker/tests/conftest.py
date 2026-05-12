import os
import sys
from pathlib import Path

# Set env vars before app modules are imported.
os.environ.setdefault("ANTHROPIC_API_KEY", "test-anthropic-key")
os.environ.setdefault("GCS_BUCKET", "test-bucket")

# Make the worker `app` package importable when pytest is invoked from the
# repo root.
WORKER_ROOT = Path(__file__).resolve().parent.parent
if str(WORKER_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKER_ROOT))
