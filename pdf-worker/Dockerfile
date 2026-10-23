# GeniusAI PDF worker
# Build:  docker build -t geniusai-pdf-worker .
# Run:    docker run -p 8080:8080 -e PDF_WORKER_SECRET=$(openssl rand -hex 32) --read-only --tmpfs /tmp:size=1g geniusai-pdf-worker
FROM node:22-bookworm-slim

# Document tools + fonts (Noto covers Devanagari, Bengali, Tamil, Telugu and other Indian scripts, plus CJK).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      qpdf ghostscript poppler-utils zip unzip \
      libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui \
      fonts-noto-core fonts-noto-cjk fonts-liberation2 fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.mjs tools.mjs ./

# Run as an unprivileged user; only /tmp needs to be writable.
RUN useradd --system --uid 10001 --home-dir /tmp worker
USER worker
ENV NODE_ENV=production PORT=8080 HOME=/tmp
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
