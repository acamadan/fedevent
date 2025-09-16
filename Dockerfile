# syntax=docker/dockerfile:1
FROM node:20-bookworm

# System deps for OCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr ocrmypdf poppler-utils ghostscript \
    ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Ensure runtime dirs exist (Render disks will mount over these paths)
RUN mkdir -p /app/uploads /app/data

ENV NODE_ENV=production
ENV PORT=10000

# Render will provide PORT; app uses process.env.PORT
EXPOSE 10000

ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["npm","start"]


