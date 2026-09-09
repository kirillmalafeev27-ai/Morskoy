# Northflank baut dieses Image direkt aus dem Repository ("Build type: Dockerfile").
FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

# Zuerst nur die Manifeste kopieren: Solange sich die Abhängigkeiten nicht
# ändern, bleibt der npm-Layer im Cache und der Build dauert Sekunden.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Das Node-Image bringt den unprivilegierten Nutzer "node" bereits mit.
USER node

# Northflank setzt PORT selbst; 3000 ist nur der lokale Standard.
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
