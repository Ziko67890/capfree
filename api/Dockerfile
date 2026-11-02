FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the background-removal models into the image so the first request isn't slow
RUN python -c "from rembg import new_session; [new_session(m) for m in ('u2netp', 'isnet-general-use')]" || true

COPY main.py silence.py fillers.py removebg.py beats.py tts.py vocals.py upscale.py tracking.py translate.py ./

# Railway sets $PORT
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
