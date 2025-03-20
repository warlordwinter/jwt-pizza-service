#!/bin/bash

# Check if host is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <host>"
  echo "Example: $0 http://localhost:3000"
  exit 1
fi
host=$1

# Function to cleanly exit
cleanup() {
  echo -e "\nStopping menu item creation..."
  exit 0
}

# Trap Ctrl+C
trap cleanup SIGINT

# Login as admin
echo "Logging in as admin..."
response=$(curl -s -X PUT $host/api/auth -H 'Content-Type: application/json' -d '{"email":"a@jwt.com", "password":"admin"}')
token=$(echo $response | jq -r '.token')

if [ "$token" = "null" ] || [ -z "$token" ]; then
  echo "Failed to get auth token"
  exit 1
fi

# Counter for pizza names
count=1

# Continuous loop to add menu items
while true; do
  title="Test Pizza #$count"
  price="0.05"
  
  echo "Adding $title..."
  start_time=$(date +%s%3N)
  
  curl -s -X PUT $host/api/order/menu \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $token" \
    -d "{\"title\":\"$title\",\"description\":\"Test pizza\",\"image\":\"pizza.png\",\"price\":$price}"
    
  end_time=$(date +%s%3N)
  echo "Latency: $((end_time - start_time)) ms"
  
  count=$((count + 1))
  sleep 10
done 