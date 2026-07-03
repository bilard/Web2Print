# Détourage automatique rembg (isnet-general-use) — voir main.py.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PORT=8080 \
    U2NET_HOME=/opt/models

RUN pip install --no-cache-dir "rembg[cpu]==2.0.61" flask gunicorn firebase-admin

# Pré-télécharge le modèle DANS l'image : cold start sans téléchargement (~170 Mo).
RUN python -c "from rembg import new_session; new_session('isnet-general-use')"

WORKDIR /app
COPY main.py .

# 1 worker (le modèle pèse ~1 Go en RAM), threads pour le parallélisme I/O.
CMD exec gunicorn --bind :$PORT --workers 1 --threads 4 --timeout 120 main:app
