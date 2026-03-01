# Use an official Node.js runtime as a parent image
FROM node:20-slim

# Install system dependencies for Electron and building AppImage/deb
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libxkbcommon0 \
    libgtk-3-0 \
    fakeroot \
    rpm \
    dpkg \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the application
RUN npm run build

# Default command (could be used for building artifacts)
CMD ["npm", "run", "dist:linux"]
