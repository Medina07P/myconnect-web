FROM node:20-slim

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY proxy-server.cjs .

EXPOSE 3001
CMD ["node", "proxy-server.cjs"]