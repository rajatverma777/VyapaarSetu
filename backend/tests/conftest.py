import subprocess
import time
import pytest
import httpx
import os
import sys

def is_server_online():
    try:
        res = httpx.get("http://127.0.0.1:8000/api/health", timeout=0.5)
        return res.status_code == 200
    except Exception:
        return False

@pytest.fixture(scope="session", autouse=True)
def run_server():
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    proc = None

    if not is_server_online():
        python_env = dict(os.environ)
        existing_pythonpath = python_env.get("PYTHONPATH", "")
        paths = [backend_dir]
        site_packages = os.path.join(backend_dir, "venv", "lib", "python3.12", "site-packages")
        if os.path.exists(site_packages):
            paths.append(site_packages)
        if existing_pythonpath:
            paths.append(existing_pythonpath)
        python_env["PYTHONPATH"] = ":".join(paths)
        python_env["SECRET_KEY"] = "test_secret_key_for_ci_pipeline_only_32_chars"

        try:
            proc = subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"],
                cwd=backend_dir,
                env=python_env
            )
        except Exception:
            proc = None

    if proc is not None:
        start_time = time.time()
        while time.time() - start_time < 5:
            if proc.poll() is not None:
                break
            if is_server_online():
                break
            time.sleep(0.2)

    yield

    if proc is not None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()

def pytest_collection_modifyitems(config, items):
    if not is_server_online():
        skip_marker = pytest.mark.skip(
            reason="Live FastAPI backend and MongoDB service required. Runs in CI/container with active MongoDB."
        )
        live_tests = {
            "test_brand_categories.py",
            "test_concurrency_and_auth.py",
            "test_multitenancy_rbac.py",
            "test_returns_trace.py",
            "test_stock_sync.py",
        }
        for item in items:
            if os.path.basename(str(item.fspath)) in live_tests:
                item.add_marker(skip_marker)
