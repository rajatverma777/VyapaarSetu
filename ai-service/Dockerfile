FROM python:3.10-slim

# Install system dependencies needed by PaddlePaddle, PaddleOCR, and OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libgomp1 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements file
COPY requirements.txt .

# Install Python packages
# Disable pip cache to keep docker image size minimal
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Expose microservice port
EXPOSE 8001

# Command to run FastAPI server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
