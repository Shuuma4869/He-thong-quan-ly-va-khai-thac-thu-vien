FROM alpine/minio:RELEASE.2025-10-15T17-29-55Z

USER root
RUN mkdir -p /data && chown 100:101 /data
USER minio

VOLUME ["/data"]
