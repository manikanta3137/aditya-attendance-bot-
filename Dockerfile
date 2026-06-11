# Build stage
FROM node:18-alpine

# Install chromium and native dependencies for puppeteer
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont

# Tell Puppeteer to use the installed Chromium binary
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Set working directory
WORKDIR /usr/src/app

# Copy package config
COPY package*.json ./

# Install dependencies (production only for small footprint)
RUN npm install --only=production --strict-ssl=false

# Copy project source files
COPY . .

# Set up persistent database folder in container
RUN mkdir -p /usr/src/app/data
ENV DATABASE_PATH=/usr/src/app/data
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "start"]
