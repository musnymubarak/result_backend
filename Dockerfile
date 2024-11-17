# Use the official Node.js image as the base
FROM node:16-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application files to the container
COPY . .

# Ensure the Excel file is copied
COPY data.xlsx ./data.xlsx

# Expose the port your app runs on
EXPOSE 4000

# Start the application
CMD ["node", "index.js"]
