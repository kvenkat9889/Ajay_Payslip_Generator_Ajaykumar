# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy application source
COPY . .

# Expose the application's port
EXPOSE 3111

# Start the application
CMD ["node", "server.js"]

