FROM node:22-bookworm-slim

WORKDIR /workspace

# Build the local intent-compiler package so the demo's file dependency can resolve to dist artifacts.
COPY . .
RUN npm install && npm run build

WORKDIR /workspace/demos/apps/react-rest-drizzle-postgres
RUN npm install

EXPOSE 5173 8787

CMD ["sh", "./scripts/container-start.sh"]
