FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY backend ./backend
COPY frontend ./frontend
RUN mkdir -p /data /app/backend/uploads
ENV PORT=8787
ENV STOREOPS_DB=/data/storeops.db
EXPOSE 8787
CMD ["node","backend/server.mjs"]
