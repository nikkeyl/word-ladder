FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && mkdir data && chown node:node data
COPY server.mjs game-rules.mjs dictionaries.mjs dictionary-lookup.mjs ./
USER node
ENV HOST=0.0.0.0 PORT=8787 DATABASE_PATH=/app/data/games.sqlite
EXPOSE 8787
CMD ["node", "server.mjs"]
