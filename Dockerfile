# Stage 1: Build the React frontend
FROM node:18 AS frontend-builder

WORKDIR /FrontEnd

# Copy package.json and package-lock.json
COPY FrontEnd/package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the frontend code
COPY FrontEnd/ ./

# Build the React app
RUN npm run build

# Stage 2: Build the Go application
FROM golang:1.22 AS go-builder

WORKDIR /app

# Copy go.mod and go.sum
COPY go.mod go.sum ./
RUN go mod download

# Copy the Go source code
COPY *.go ./

# Build the Go binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# Stage 3: Final Stage
FROM ubuntu:22.04

WORKDIR /app

# Install ca-certificates and tzdata
RUN apt-get update && apt-get install -y ca-certificates tzdata && rm -rf /var/lib/apt/lists/*

# Copy the Go binary from the build stage
COPY --from=go-builder /app/main .

# Copy the built React assets from the frontend build stage
COPY --from=frontend-builder /FrontEnd/build ./FrontEnd/build

# Create a directory for the SQLite database
RUN mkdir /data

# Copy the pre-existing database file (if it exists)
COPY maindb.db /data/maindb.db

# Set environment variables
ENV ADDR=0.0.0.0
ENV PORT=8080
ENV SQLPATH=/data/maindb.db

# Expose the port your app will run on
EXPOSE 8080

# Run the Go binary
CMD ["./main"]