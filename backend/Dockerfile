FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create directories for runtime state
RUN mkdir -p logs uploads backups

# ─── Run as non-root user ────────────────────────────────────────────────
# uid 10001 keeps us above the host user range and avoids collisions with
# Synology DSM accounts (which sit in 1024+).
#
# IMPORTANT (NAS deploy): the bind-mounted host paths
#   /volume1/docker/Qualitas/backend/{qualitas.db,uploads,backups,logs}
# must be readable+writable by uid 10001 or the container will fail to write
# the SQLite DB / uploads / logs. One-time host fix from the NAS shell:
#
#   sudo chown -R 10001:10001 /volume1/docker/Qualitas/backend/uploads \
#                              /volume1/docker/Qualitas/backend/backups \
#                              /volume1/docker/Qualitas/backend/logs
#   sudo chown 10001:10001 /volume1/docker/Qualitas/backend/qualitas.db
#
# (run BEFORE `docker-compose up -d --build backend`).
RUN groupadd --system --gid 10001 qualitas \
 && useradd --system --uid 10001 --gid qualitas --no-create-home --shell /usr/sbin/nologin qualitas \
 && chown -R qualitas:qualitas /app
USER qualitas

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
