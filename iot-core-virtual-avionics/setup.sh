#!/usr/bin/env bash
# Creates one IoT "thing" (a virtual rocket avionics board), its certificate and policy.
set -euo pipefail
REGION=${AWS_REGION:-us-east-1}
THING=gsu-rocket-avionics
cd "$(dirname "$0")"
mkdir -p certs

aws iot create-thing --thing-name $THING --region $REGION >/dev/null

aws iot create-policy --policy-name $THING-policy --region $REGION \
  --policy-document file://policy.json >/dev/null 2>&1 || echo "policy exists"

ARN=$(aws iot create-keys-and-certificate --set-as-active --region $REGION \
  --certificate-pem-outfile certs/device.pem.crt \
  --public-key-outfile certs/public.pem.key \
  --private-key-outfile certs/private.pem.key \
  --query certificateArn --output text)

aws iot attach-policy --policy-name $THING-policy --target "$ARN" --region $REGION
aws iot attach-thing-principal --thing-name $THING --principal "$ARN" --region $REGION

curl -s -o certs/AmazonRootCA1.pem https://www.amazontrust.com/repository/AmazonRootCA1.pem
aws iot describe-endpoint --endpoint-type iot:Data-ATS --region $REGION \
  --query endpointAddress --output text > certs/endpoint.txt
echo "Done. Endpoint: $(cat certs/endpoint.txt)"
