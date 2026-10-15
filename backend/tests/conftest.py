import subprocess
import time
import pytest
import httpx
import os
import sys

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

def is_server_online():
    try:
        res = httpx.get("http://127.0.0.1:8000/api/health", timeout=1.5)
        return res.status_code == 200
    except Exception:
        return False

@pytest.fixture(scope="session", autouse=True)
def run_server():
    proc = None

    if not is_server_online():
        python_env = dict(os.environ)
        existing_pythonpath = python_env.get("PYTHONPATH", "")
        python_env["PYTHONPATH"] = f"{backend_dir}:{existing_pythonpath}" if existing_pythonpath else backend_dir
        python_env["SECRET_KEY"] = "test_secret_key_for_ci_pipeline_only_32_chars"

        uvicorn_bin = os.path.join(backend_dir, "venv", "bin", "uvicorn")
        if os.path.exists(uvicorn_bin):
            cmd = [uvicorn_bin, "main:app", "--host", "127.0.0.1", "--port", "8000"]
        else:
            cmd = [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"]

        try:
            proc = subprocess.Popen(cmd, cwd=backend_dir, env=python_env)
        except Exception as e:
            print(f"[conftest] Failed to start uvicorn: {e}", file=sys.stderr)
            proc = None

        start_time = time.time()
        # Allow up to 45 seconds for CI runner to connect to MongoDB and build indexes
        while time.time() - start_time < 45:
            if proc and proc.poll() is not None:
                print(f"[conftest] Uvicorn exited prematurely with exit code {proc.returncode}", file=sys.stderr)
                break
            if is_server_online():
                print(f"[conftest] Backend server is healthy after {round(time.time() - start_time, 2)}s.")
                break
            time.sleep(0.5)

    yield

    if proc is not None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()

@pytest.fixture(autouse=True)
def skip_live_tests_if_offline(request):
    live_tests = {
        "test_brand_categories.py",
        "test_concurrency_and_auth.py",
        "test_multitenancy_rbac.py",
        "test_returns_trace.py",
        "test_stock_sync.py",
    }
    path_obj = getattr(request, "path", None)
    if path_obj:
        file_name = path_obj.name
    else:
        file_name = os.path.basename(str(getattr(request, "fspath", "")))

    if file_name in live_tests and not is_server_online():
        pytest.skip(f"Live FastAPI backend required for {file_name}. Server was offline.")
