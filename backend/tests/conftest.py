import subprocess
import time
import pytest
import httpx
import os

@pytest.fixture(scope="session", autouse=True)
def run_server():
    # Start the uvicorn server process in the background
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # We run it using the venv's uvicorn command if available, else standard uvicorn
    uvicorn_path = os.path.join(backend_dir, "venv", "bin", "uvicorn")
    if not os.path.exists(uvicorn_path):
        uvicorn_path = "uvicorn"
        
    proc = subprocess.Popen(
        [uvicorn_path, "main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=backend_dir,
        env=dict(os.environ, SECRET_KEY="test_secret_key_for_ci_pipeline_only")
    )
    
    # Wait for the server to be responsive
    start_time = time.time()
    while time.time() - start_time < 15:
        try:
            res = httpx.get("http://127.0.0.1:8000/api/health", timeout=1.0)
            if res.status_code == 200:
                break
        except Exception:
            pass
        time.sleep(0.5)
        
    yield
    
    # Terminate the server process
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
