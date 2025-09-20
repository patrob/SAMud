FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create data directory
RUN mkdir -p data

# Expose the telnet port
EXPOSE 2323

# Start the application
CMD ["npm", "start"]