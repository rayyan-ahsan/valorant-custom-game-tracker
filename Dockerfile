# Use an official Go runtime as a parent image
FROM golang:1.20 AS builder

# Set environment variables
ENV PORT=8080
ENV ADDR=0.0.0.0

# Set the working directory
WORKDIR /app

# Copy go.mod and go.sum files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy the source code
COPY . .

# Build the Go application
RUN go build -o main .

# Build React frontend
RUN cd frontend && npm install && npm run build

# Final stage
FROM alpine:latest

# Copy the compiled Go binary and React build
COPY --from=builder /app/main /app/main
COPY --from=builder /app/frontend/build /app/frontend/build

# Set the working directory
WORKDIR /app

# Expose port 8080
EXPOSE 8080

# Command to run the executable
CMD ["./main"]
