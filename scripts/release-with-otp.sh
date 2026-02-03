#!/bin/bash

# Verify user is logged in to npm
if ! npm whoami &> /dev/null; then
  echo "Error: You are not logged in to npm. Please run 'npm login' first."
  exit 1
fi

# Prompt for OTP
read -p "Enter npm OTP: " otp

if [ -z "$otp" ]; then
  echo "Error: OTP is required"
  exit 1
fi

# Export OTP for semantic-release
export NPM_CONFIG_OTP=$otp

npm run release
