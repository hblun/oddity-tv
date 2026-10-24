FROM python:3.12-slim-bookworm
ARG INSTALL_MEDIA_TOOLS=false
RUN --mount=type=secret,id=proxy_ca,target=/run/secrets/proxy_ca \
    if [ "$INSTALL_MEDIA_TOOLS" = "true" ]; then \
      if [ -f /run/secrets/proxy_ca ]; then export SSL_CERT_FILE=/run/secrets/proxy_ca; fi; \
      apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*; \
    fi
WORKDIR /app
COPY requirements.txt .
RUN --mount=type=secret,id=proxy_ca,target=/run/secrets/proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi; \
    pip install --no-cache-dir -r requirements.txt
COPY station ./station
COPY web ./web
COPY THIRD_PARTY_NOTICES.md ./
COPY vendor/ringmast4r/LICENSE ./licenses/ringmast4r-LICENSE
COPY vendor/vt323/OFL.txt ./licenses/VT323-OFL.txt
RUN mkdir -p /app/config /app/media && chmod -R a+rX /app
USER 1000:1000
EXPOSE 8000
CMD ["uvicorn", "station.app:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--no-server-header", "--no-proxy-headers"]
